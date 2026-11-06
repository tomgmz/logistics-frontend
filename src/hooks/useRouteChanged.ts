'use client'

import { useEffect, useRef } from 'react'
import { subscribeBroadcast } from '@/lib/realtime/sharedBroadcast'

/**
 * Re-read a booking's route when it changes on the road: a load picked up, a
 * drop-off confirmed, or the driver choosing which drop-off to do next. The
 * backend announces these on `route:booking:{bookingId}` (trip.service
 * announceRouteChanged); the payload carries nothing but the id, the re-read
 * fetches the real data.
 *
 * Uses the shared, ref-counted channel (sharedBroadcast): a per-effect
 * supabase.channel() + removeChannel() raced the async teardown and went silent.
 */
export function useRouteChanged(bookingId: string | null, onChange: () => void): void {
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    if (!bookingId) return
    return subscribeBroadcast(`route:booking:${bookingId}`, {
      route_changed: () => onChangeRef.current(),
    })
  }, [bookingId])
}
