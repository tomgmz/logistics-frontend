'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Cloudflare Turnstile, the captcha on the landing page's contact form (the
 * only public form with one since 2026-11-16).
 *
 *   const captcha = useTurnstile('contact')
 *   ...
 *   const token = await captcha.getToken()   // before the request
 *   send it as captcha_token
 *   ...
 *   {captcha.element}                        // where a challenge may show
 *
 * The widget starts as soon as the form shows, so a token is usually ready by
 * the time the person presses the button. Most people see nothing: it only
 * appears ("Verify you are human") when Cloudflare wants a tick. A token is
 * single use, so each getToken() spends the one it has and fetches the next.
 *
 * No NEXT_PUBLIC_TURNSTILE_SITE_KEY = nothing renders and getToken() gives
 * undefined (the server then decides; with no secret it doesn't check either).
 * Dev test key that always passes: 1x00000000000000000000AA.
 */

// Only the landing page's contact form (user 2026-11-16; sign-in and
// password reset have no captcha).
export type CaptchaAction = 'contact'

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  execute: (id: string) => void
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SITE_KEY   = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
/** Tokens live 300 s; treat older than this as stale and fetch a fresh one. */
const TOKEN_FRESH_MS = 240_000
/** Long enough for someone to answer an interactive challenge. */
const WAIT_MS = 90_000

export const LOAD_FAILED_MESSAGE =
  'The security check could not load. Check your connection (or allow challenges.cloudflare.com if a blocker is on), then try again.'

/** A captcha problem on this side (didn't load, took too long); its message is for the person. */
export class CaptchaError extends Error {
  constructor(message: string) { super(message); this.name = 'CaptchaError' }
}

let scriptPromise: Promise<TurnstileApi> | null = null

function loadScript(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script')
    s.src   = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload  = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing'))
    s.onerror = () => { scriptPromise = null; s.remove(); reject(new Error('turnstile script failed')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

type Waiter = { resolve: (t: string) => void; reject: (e: Error) => void }

export function useTurnstile(action: CaptchaAction): {
  element:  ReactNode
  getToken: () => Promise<string | undefined>
} {
  // A callback ref (state), so the widget renders whenever its box appears:
  // a form shown only after a check (reset page) or a step that comes back.
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [attempt, setAttempt] = useState(0)
  const idRef     = useRef<string | null>(null)
  const tokenRef  = useRef<{ value: string; at: number } | null>(null)
  const waiters   = useRef<Waiter[]>([])
  const runningRef = useRef(false)
  const [loadError, setLoadError] = useState(false)
  // Out of the layout (no flex gap) until Cloudflare asks for a tick.
  const [shown, setShown] = useState(false)

  const settle = useCallback((token: string | null, err?: Error) => {
    runningRef.current = false
    const list = waiters.current
    waiters.current = []
    if (token) {
      if (list.length) list.forEach((w) => w.resolve(token))
      else tokenRef.current = { value: token, at: Date.now() }
    } else {
      list.forEach((w) => w.reject(err ?? new CaptchaError(LOAD_FAILED_MESSAGE)))
    }
  }, [])

  /** Start a fresh challenge (spends nothing; the old token is dropped). */
  const run = useCallback(() => {
    const api = window.turnstile
    const id  = idRef.current
    if (!api || !id || runningRef.current) return
    runningRef.current = true
    tokenRef.current = null
    try {
      api.reset(id)
      api.execute(id)
    } catch {
      settle(null)
    }
  }, [settle])

  useEffect(() => {
    if (!SITE_KEY || !box) return
    let cancelled = false
    loadScript().then((api) => {
      if (cancelled) return
      idRef.current = api.render(box, {
        sitekey:           SITE_KEY,
        action,
        execution:         'execute',
        appearance:        'interaction-only',
        theme:             'dark',
        // The full widget is at least 300 px wide; a 320 px phone gets the small one.
        size:              window.innerWidth < 400 ? 'compact' : 'flexible',
        'refresh-expired': 'manual',
        callback:          (t: string) => settle(t),
        'error-callback':  () => { settle(null); return true },
        'expired-callback': () => { tokenRef.current = null },
        'timeout-callback': () => settle(null),
        'before-interactive-callback': () => setShown(true),
        'after-interactive-callback':  () => setShown(false),
      })
      run()
    }).catch(() => { if (!cancelled) setLoadError(true) })
    return () => {
      cancelled = true
      const id = idRef.current
      idRef.current = null
      if (id) { try { window.turnstile?.remove(id) } catch { /* already gone */ } }
      waiters.current.forEach((w) => w.reject(new CaptchaError('closed')))
      waiters.current = []
      runningRef.current = false
      tokenRef.current = null
      setShown(false)
    }
  }, [box, action, attempt, run, settle])

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!SITE_KEY) return undefined
    if (loadError) {
      // Try loading again for the next press (a blip, or a blocker turned off).
      setLoadError(false)
      setAttempt((n) => n + 1)
      throw new CaptchaError(LOAD_FAILED_MESSAGE)
    }
    const ready = tokenRef.current
    if (ready && Date.now() - ready.at < TOKEN_FRESH_MS) {
      tokenRef.current = null
      // Fetch the next one now, so a retry doesn't wait.
      setTimeout(run, 0)
      return ready.value
    }
    const token = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.current = waiters.current.filter((w) => w.resolve !== done)
        runningRef.current = false   // the next press starts a fresh challenge
        reject(new CaptchaError('The security check took too long. Please try again.'))
      }, WAIT_MS)
      const done = (t: string) => { clearTimeout(timer); resolve(t) }
      waiters.current.push({ resolve: done, reject: (e) => { clearTimeout(timer); reject(e) } })
      run()
    })
    setTimeout(run, 0)
    return token
  }, [loadError, run])

  const element = SITE_KEY
    ? <div
        ref={setBox}
        className={shown
          ? 'flex w-full max-w-full justify-center overflow-hidden'
          : 'pointer-events-none absolute h-0 w-0 overflow-hidden'}
        aria-hidden={shown ? undefined : true}
      />
    : null

  return { element, getToken }
}

