'use client'

import { useEffect, useRef } from 'react'

/**
 * File links from the API are signed and expire (backend lib/storage.ts):
 * licences and booking documents after 10–15 minutes, everything else after
 * 1–2 hours. A screen left open longer would be holding dead links, so this
 * calls `reload` shortly before the first link in `data` expires, or as soon
 * as the tab is shown again if it expired while hidden. The reload brings
 * freshly signed links; nothing else about the screen changes.
 */

const R2_LINK = /https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com\/[^"\s\\]+/g
const MARGIN_MS    = 60_000
const MIN_DELAY_MS = 30_000

/** When a signed link stops working (ms since epoch), or null if it is not one. */
export function signedLinkExpiry(url: string): number | null {
  try {
    const q    = new URL(url).searchParams
    const date = q.get('X-Amz-Date')            // 20261030T120000Z
    const secs = Number(q.get('X-Amz-Expires'))
    const m    = date && /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date)
    if (!m || !Number.isFinite(secs)) return null
    // Built from parts, never parsed from a string (Safari).
    const signedAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
    return signedAt + secs * 1000
  } catch {
    return null
  }
}

/** The earliest expiry among every signed link anywhere in `data`. */
export function earliestLinkExpiry(data: unknown): number | null {
  if (data == null) return null
  let text: string
  try { text = JSON.stringify(data) } catch { return null }
  let earliest: number | null = null
  for (const url of text.match(R2_LINK) ?? []) {
    const at = signedLinkExpiry(url)
    if (at != null && (earliest == null || at < earliest)) earliest = at
  }
  return earliest
}

/**
 * `current` with each signed link replaced by the fresh link to the same file
 * found anywhere in `fresh`; nothing else changes, and parts with no changed
 * link keep their identity. For screens that must not be re-read wholesale
 * (an open booking someone may be editing, a history list that must not
 * shift): fetch again, then swap in only the links.
 */
export function withFreshLinks<T>(current: T, fresh: unknown): T {
  let text: string
  try { text = JSON.stringify(fresh) } catch { return current }
  const byPath = new Map<string, string>()
  for (const url of text.match(R2_LINK) ?? []) {
    try { byPath.set(new URL(url).pathname, url) } catch { /* not a URL */ }
  }
  if (byPath.size === 0) return current

  const swap = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (!v.includes('.r2.cloudflarestorage.com/')) return v
      try { return byPath.get(new URL(v).pathname) ?? v } catch { return v }
    }
    if (Array.isArray(v)) {
      const out = v.map(swap)
      return out.some((x, i) => x !== v[i]) ? out : v
    }
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      let changed = false
      const out: Record<string, unknown> = {}
      for (const [k, child] of Object.entries(v)) {
        out[k] = swap(child)
        if (out[k] !== child) changed = true
      }
      return changed ? out : v
    }
    return v
  }
  return swap(current) as T
}

export function useSignedLinkRefresh(data: unknown, reload: () => void, enabled = true): void {
  const reloadRef = useRef(reload)
  useEffect(() => { reloadRef.current = reload })
  const expiresAt = enabled ? earliestLinkExpiry(data) : null

  useEffect(() => {
    if (expiresAt == null) return
    const due = expiresAt - MARGIN_MS
    const fire = () => {
      if (document.visibilityState === 'visible') reloadRef.current()
    }
    const timer = window.setTimeout(fire, Math.max(due - Date.now(), MIN_DELAY_MS))
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() >= due) {
        window.clearTimeout(timer)
        reloadRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [expiresAt])
}
