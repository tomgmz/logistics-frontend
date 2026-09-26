'use client'

import { useEffect, useState } from 'react'
import { SIGNED_OUT_PARAM, SIGNED_OUT_REASON_PARAM } from '@/lib/auth-redirect'

/**
 * Explains an involuntary sign-out on the page the user is dropped onto.
 *
 * goHomeSignedOut() sends everyone here with '?signedout=1', which previously
 * said nothing about why. A user whose account was deactivated saw the ordinary
 * landing page and, having no reason to think otherwise, tried their password
 * again — and again — because nothing told them the account itself was off.
 *
 * Read from window rather than useSearchParams so this does not force the
 * marketing page into a Suspense boundary; it renders nothing on the server and
 * appears after hydration, which is soon enough for a message nobody is waiting
 * on.
 */
const MESSAGES: Record<string, string> = {
  inactive:
    'Your account is no longer active. Signing in again will not restore access — please contact your Administrator.',
}

const DEFAULT_MESSAGE = 'You have been signed out.'

export default function SignedOutNotice() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get(SIGNED_OUT_PARAM) !== '1') return

    const reason = params.get(SIGNED_OUT_REASON_PARAM)
    setMessage(reason ? (MESSAGES[reason] ?? DEFAULT_MESSAGE) : DEFAULT_MESSAGE)

    // Drop the markers so a refresh or a shared link does not replay the
    // notice. The proxy has already consumed '?signedout=1' by this point.
    params.delete(SIGNED_OUT_PARAM)
    params.delete(SIGNED_OUT_REASON_PARAM)
    const qs = params.toString()
    window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }, [])

  if (!message) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-4"
    >
      <div className="flex max-w-xl items-start gap-3 rounded-xl border border-[rgba(255,80,80,0.35)] bg-[#2a1616] px-4 py-3 text-sm text-[#ffd4d4] shadow-lg">
        <span className="leading-relaxed">{message}</span>
        <button
          onClick={() => setMessage(null)}
          aria-label="Dismiss"
          className="ml-auto shrink-0 text-[#ff9a9a] transition hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
