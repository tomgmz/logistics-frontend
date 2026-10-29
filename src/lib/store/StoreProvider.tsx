'use client'

import { useEffect } from 'react'
import { Provider } from 'react-redux'
import { store } from '.'
import { useAuthStore } from './auth.store'
import { resetBooking } from './slice/booking.slice'
import { clearBookingDraft } from './booking-draft'

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  // A booking draft belongs to whoever was signed in. Signing out (or the
  // session ending) drops it, so the next person in this tab starts blank.
  useEffect(() => useAuthStore.subscribe((state, prev) => {
    if (prev.user && state.user?.user_id !== prev.user.user_id) {
      clearBookingDraft()
      store.dispatch(resetBooking())
    }
  }), [])

  return <Provider store={store}>{children}</Provider>
}
