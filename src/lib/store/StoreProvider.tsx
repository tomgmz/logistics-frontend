'use client'

import { useEffect } from 'react'
import { useAuthStore } from './auth.store'
import { resetBooking, restoreBookingDraft } from './booking.store'
import { clearBookingDraft } from './booking-draft'

/**
 * Screen-state stores (Zustand) that need wiring at the app root. Server data
 * lives in TanStack Query (lib/query/QueryProvider).
 */
export default function StoreProvider({ children }: { children: React.ReactNode }) {
  // The booking form comes back after the first render, as before, so the
  // server's page and the first browser render match.
  useEffect(() => { restoreBookingDraft() }, [])

  // A booking draft belongs to whoever was signed in. Signing out (or the
  // session ending) drops it, so the next person in this tab starts blank.
  useEffect(() => useAuthStore.subscribe((state, prev) => {
    if (prev.user && state.user?.user_id !== prev.user.user_id) {
      clearBookingDraft()
      resetBooking()
    }
  }), [])

  return <>{children}</>
}
