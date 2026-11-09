'use client'

import { useAuthStore } from '@/lib/store/auth.store'

/**
 * In-memory cache of what the API last answered, so going back to a module
 * shows its rows at once while a quiet re-read brings them up to date
 * (stale-while-revalidate). Used by useServerTable and useCachedFetch.
 *
 * - Per browser tab, in memory only: nothing is written to storage, and a
 *   reload starts empty.
 * - Scoped to the signed-in account: every key carries the user id and the
 *   IT stand-in flag, and the whole cache is dropped when either changes or
 *   the user signs out, so the next person on this browser never sees the
 *   previous one's rows.
 * - Sealed file links (/api/files?…) expire 10–15 minutes after they are
 *   issued, so an answer that holds one is kept for 5 minutes only; anything
 *   else for 30. Past that the screen loads as if nothing were cached.
 * - At most MAX_ENTRIES answers; the least recently used goes first.
 *
 * A cached answer is only ever shown while a fresh read is on its way; it is
 * never a reason to skip one.
 */

const MAX_ENTRIES      = 50
const TTL_MS           = 30 * 60 * 1000
const TTL_WITH_FILES_MS = 5 * 60 * 1000
const FILE_LINK_MARK   = '/api/files'

interface Entry { value: unknown; expiresAt: number }

const store = new Map<string, Entry>()

function scope(): string | null {
  const u = useAuthStore.getState().user
  if (!u?.user_id) return null
  return `${u.user_id}:${u.it_standin ? 'standin' : 'self'}`
}

function holdsFileLink(value: unknown): boolean {
  try { return JSON.stringify(value)?.includes(FILE_LINK_MARK) ?? false } catch { return true }
}

/** Full key for `key` under the signed-in account, or null when signed out. */
export function scopedKey(key: string): string | null {
  const s = scope()
  return s ? `${s}|${key}` : null
}

export function readCache<T>(key: string): T | undefined {
  const k = scopedKey(key)
  if (!k) return undefined
  const e = store.get(k)
  if (!e) return undefined
  if (e.expiresAt <= Date.now()) { store.delete(k); return undefined }
  // Map keeps insertion order: re-insert so this entry counts as recently used.
  store.delete(k)
  store.set(k, e)
  return e.value as T
}

export function writeCache(key: string, value: unknown): void {
  const k = scopedKey(key)
  if (!k) return
  const ttl = holdsFileLink(value) ? TTL_WITH_FILES_MS : TTL_MS
  store.delete(k)
  store.set(k, { value, expiresAt: Date.now() + ttl })
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

export function clearQueryCache(): void {
  store.clear()
}

// Sign-out, a different account, or a stand-in switch: drop everything.
if (typeof window !== 'undefined') {
  let last = scope()
  useAuthStore.subscribe(() => {
    const now = scope()
    if (now !== last) { store.clear(); last = now }
  })
}
