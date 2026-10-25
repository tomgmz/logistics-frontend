'use client'

import { useSyncExternalStore } from 'react'

/**
 * Rows per page for every web table: 10 on phones, so a table is never a long
 * cramped scroll, and 20 from tablet width up.
 *
 * "Phone" is below Tailwind's `sm` (640px), the same line useIsMobile draws.
 * Read through useSyncExternalStore so a client-side navigation gets the right
 * size on its first render (no fetch with 20 followed by one with 10); the
 * server render assumes desktop.
 */
export const TABLE_PAGE_SIZE_PHONE   = 10
export const TABLE_PAGE_SIZE_DESKTOP = 20

const QUERY = '(max-width: 639.98px)'

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

const isPhone       = () => window.matchMedia(QUERY).matches
const isPhoneServer = () => false

export function useTablePageSize(): number {
  return useSyncExternalStore(subscribe, isPhone, isPhoneServer)
    ? TABLE_PAGE_SIZE_PHONE
    : TABLE_PAGE_SIZE_DESKTOP
}
