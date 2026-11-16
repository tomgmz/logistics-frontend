'use client'

import { useEffect, useState } from 'react'
import authApi from '@/lib/api/auth.api'
import { appToast } from '@/lib/toast'

/**
 * Bookings in web addresses (user 2026-11-16: no internal ids in a URL).
 *
 * A link names a booking by its number without "BK-": `?booking=202611-00193`
 * (YYYYMM in Philippine time + that month's count; the database trigger
 * trg_booking_reference resets the count each month). The server turns it back
 * into the booking (GET /booking/resolve/:ref) after the same account check as
 * opening the booking, so another company's number reads as "not found".
 *
 * Older links (notifications already sent, emails, bookmarks) carry the
 * internal id; they still open, and the address is rewritten to the number.
 *
 * The backend has the same rule in lib/booking-ref.ts; keep the two in step.
 */

const URL_KEY = /^(?:BK-)?(\d{6})-(\d{1,9})$/i
const UUID    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What goes after `?booking=`: `202611-00193`. Falls back to the id only when a booking has no number. */
export function bookingUrlKey(b: { reference_number?: string | null; booking_id: string }): string {
  const m = b.reference_number ? URL_KEY.exec(b.reference_number.trim()) : null
  return m ? `${m[1]}-${m[2].padStart(5, '0')}` : b.booking_id
}

/** `?booking=` (or another name) with the booking's number, URL-encoded. */
export function bookingQuery(b: { reference_number?: string | null; booking_id: string }, name = 'booking'): string {
  return `?${name}=${encodeURIComponent(bookingUrlKey(b))}`
}

type Resolved = { id: string; key: string }

// One lookup per key per tab; a key never points at another booking.
const cache = new Map<string, Promise<Resolved | null>>()
// When each key was last reported, so two readers on one page (or React's
// double effect in development) give one message, while opening the same
// link again later says it again.
const notifiedAt = new Map<string, number>()

/** A lookup that failed for another reason than "not found" (offline, server error). */
export class BookingLookupError extends Error {}

/**
 * The booking a key from an address names, or null (not found, not yours, or
 * not a booking key). Rejects with BookingLookupError when the server couldn't
 * be asked (no connection, server error); that answer isn't kept.
 */
export function resolveBookingKey(raw: string): Promise<Resolved | null> {
  const key = raw.trim()
  if (!key) return Promise.resolve(null)
  const hit = cache.get(key)
  if (hit) return hit

  let p: Promise<Resolved | null>
  if (UUID.test(key)) {
    // An older link: read the booking for its number.
    p = authApi.get(`/booking/${encodeURIComponent(key)}`)
      .then((res) => {
        const b = res.data?.data as { booking_id?: string; reference_number?: string | null } | undefined
        return b?.booking_id ? { id: b.booking_id, key: bookingUrlKey({ booking_id: b.booking_id, reference_number: b.reference_number }) } : null
      })
  } else if (URL_KEY.test(key)) {
    p = authApi.get(`/booking/resolve/${encodeURIComponent(key)}`)
      .then((res) => {
        const d = res.data?.data as { booking_id?: string; reference_number?: string | null } | undefined
        return d?.booking_id ? { id: d.booking_id, key: bookingUrlKey({ booking_id: d.booking_id, reference_number: d.reference_number }) } : null
      })
  } else {
    p = Promise.resolve(null)
  }
  // A failed lookup (offline, server error) may be retried on the next visit.
  p = p
    // The tidied address reads the number next: answer it from here too.
    .then((r) => { if (r && r.key !== key && !cache.has(r.key)) cache.set(r.key, Promise.resolve(r)); return r })
    .catch((err: unknown) => {
      cache.delete(key)
      const status = (err as { response?: { status?: number } })?.response?.status
      // 404 = not found or not this account's; 400 = not a booking id. Both are "not found".
      if (status === 404 || status === 400) return null
      throw new BookingLookupError('lookup failed')
    })
  cache.set(key, p)
  return p
}

/** Put the number in the address in place of an older link's id, without a new history entry. */
function tidyAddress(name: string, from: string, to: string) {
  if (typeof window === 'undefined' || from === to) return
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get(name) !== from) return
    url.searchParams.set(name, to)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  } catch { /* the address stays as it was */ }
}

/**
 * The booking_id for a key read from the address (`?booking=` / `?resubmit=`):
 * undefined while it is being looked up, null when there is no key or the
 * booking isn't found (or isn't the viewer's).
 */
export function useResolvedBookingKey(
  key: string | null | undefined,
  param = 'booking',
  /** false: the caller says it itself (the booking wizard has its own message). */
  notifyNotFound = true,
): string | null | undefined {
  const [state, setState] = useState<{ key: string; id: string | null } | null>(null)

  useEffect(() => {
    if (!key) return
    let alive = true
    const label = URL_KEY.test(key) ? `Booking ${key.replace(/^BK-/i, '').toUpperCase()}` : 'That booking'
    const say = (message: string) => {
      if (!notifyNotFound) return
      const last = notifiedAt.get(key) ?? 0
      if (Date.now() - last < 5000) return
      notifiedAt.set(key, Date.now())
      appToast.error(message)
    }
    resolveBookingKey(key).then(
      (r) => {
        if (!alive) return
        setState({ key, id: r?.id ?? null })
        if (r) tidyAddress(param, key, r.key)
        // Same words whether it doesn't exist or belongs to someone else, so the
        // message never confirms another company's booking number.
        else say(`${label} was not found. Check the number, or pick the booking from the list.`)
      },
      () => {
        if (!alive) return
        setState({ key, id: null })
        say(`${label} could not be opened. Check your connection and try again.`)
      },
    )
    return () => { alive = false }
  }, [key, param, notifyNotFound])

  if (!key) return null
  return state?.key === key ? state.id : undefined
}
