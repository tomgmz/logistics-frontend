'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { decryptString, encryptString } from '@/lib/secure-storage'

/**
 * Unsent text per chat, like WhatsApp Web / Slack / Teams: leave a chat with
 * something typed and it is still in the box when you come back, including
 * after a reload.
 *
 * Kept in memory (instant on reopen, and shared by the Messages page and the
 * floating chat of the same conversation) and in localStorage, ENCRYPTED with
 * the browser's non-extractable key (lib/secure-storage), as the profile is.
 * Keys carry the signed-in user; signing out or switching accounts clears
 * every draft (StoreProvider).
 *
 * Every storage call is wrapped: private browsing / blocked site data keep the
 * draft for this tab only and never throw.
 */

const PREFIX = 'msg-draft:'
const SAVE_DELAY_MS = 400

const memory = new Map<string, string>()

function storageKey(userId: string, chatKey: string) {
  return `${PREFIX}${userId}:${chatKey}`
}

function local(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

async function persist(key: string, value: string) {
  const ls = local()
  if (!ls) return
  try {
    if (!value.trim()) { ls.removeItem(key); return }
    const sealed = await encryptString(value, key)
    if (sealed) ls.setItem(key, sealed)
    else ls.removeItem(key) // no key available: never store it as plain text
  } catch { /* quota / blocked: the in-memory copy still works */ }
}

/** Every saved draft in this browser (sign-out, account change). */
export function clearAllMessageDrafts(): void {
  memory.clear()
  const ls = local()
  if (!ls) return
  try {
    const keys: string[] = []
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach(k => ls.removeItem(k))
  } catch { /* non-fatal */ }
}

/**
 * The chat box's text with its draft restored and saved.
 * `chatKey` names the chat ('dm:<conversation id>', 'group:<id>'); empty = no draft.
 */
export function useMessageDraft(chatKey: string | undefined) {
  const userId = useAuthStore(s => s.user?.user_id ?? '')
  const key = userId && chatKey ? storageKey(userId, chatKey) : ''
  const [text, setTextState] = useState(() => (key ? memory.get(key) ?? '' : ''))
  const latest = useRef(text)
  const touched = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Not in memory (page reloaded since): open the saved copy, unless the user
  // has already started typing.
  useEffect(() => {
    if (!key || memory.has(key)) return
    const ls = local()
    let stored: string | null = null
    try { stored = ls?.getItem(key) ?? null } catch { stored = null }
    if (!stored) return
    let cancelled = false
    void decryptString(stored, key).then((plain) => {
      if (cancelled || touched.current) return
      if (plain === null) { try { ls?.removeItem(key) } catch { /* */ } return }
      memory.set(key, plain)
      latest.current = plain
      setTextState(plain)
    })
    return () => { cancelled = true }
  }, [key])

  // Leaving the chat: write what is in the box now.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (key) void persist(key, latest.current)
  }, [key])

  const setText = useCallback((next: string | ((prev: string) => string)) => {
    setTextState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      touched.current = true
      latest.current = value
      if (key) {
        if (value.trim()) memory.set(key, value)
        else memory.delete(key)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => { void persist(key, value) }, SAVE_DELAY_MS)
      }
      return value
    })
  }, [key])

  return [text, setText] as const
}
