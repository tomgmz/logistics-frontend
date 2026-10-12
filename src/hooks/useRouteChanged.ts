'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Re-read a booking's route when it changes on the road: a load picked up, a
 * drop-off confirmed, or the driver choosing which drop-off to do next. The
 * backend announces these on `route:booking:{bookingId}` (trip.service
 * announceRouteChanged); the payload carries nothing but the id, the re-read
 * fetches the real data.
 */
export function useRouteChanged(bookingId: string | null, onChange: () => void): void {
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    if (!bookingId) return
    const channel = supabase
      .channel(`route:booking:${bookingId}`)
      .on('broadcast', { event: 'route_changed' }, () => onChangeRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bookingId])
}
