'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * The page a person was on before Messages, so Messages' back arrow returns
 * to that module instead of the dashboard (user 2026-11-10). Every way into
 * Messages is covered (header button, floating panel, a push notification)
 * because this records each page as it is shown, not the button that left it.
 *
 * Per browser tab (sessionStorage); every storage call is wrapped, so private
 * browsing on iOS Safari or blocked site data just means "no page remembered".
 */
const KEY = 'nav:last-page'

// Pages whose address carries a one-time token (reset link, driver set-up
// link). Never copied into storage (2026-11-23); nobody returns to them from
// Messages anyway.
const NEVER_REMEMBER = ['/messages', '/reset-password', '/driver-setup', '/change-password']

export function useRememberLastPage(): void {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || NEVER_REMEMBER.some((p) => pathname === p || pathname.startsWith(p + '/'))) return
    try {
      sessionStorage.setItem(KEY, pathname + window.location.search)
    } catch { /* storage blocked: nothing remembered */ }
  }, [pathname])
}

/** The remembered page, or null. */
export function lastPage(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Mounted once at the app root. */
export function LastPageTracker(): null {
  useRememberLastPage()
  return null
}
