/**
 * The booking number to show people.
 *
 * `reference_number` IS the booking number — the one operations, the client and
 * the paperwork all quote. `booking_id` is an internal UUID and must never be
 * what a user reads. Only when a row predates the reference (or it somehow came
 * back blank) do we fall back to a slice of the UUID, marked with `#` so nobody
 * mistakes an internal id for a real reference.
 *
 * Same rule the server uses for notification titles and the mobile app uses for
 * the driver's cards — keep the three in step.
 */
export function bookingRef(
  booking:
    | { reference_number?: string | null; booking_id?: string | null }
    | null
    | undefined,
): string {
  if (!booking) return ''

  const ref = booking.reference_number
  if (typeof ref === 'string' && ref.trim() !== '') return ref.trim()

  const id = booking.booking_id
  return typeof id === 'string' && id ? `#${id.slice(0, 8).toUpperCase()}` : ''
}

/** Same rule, for rows that only reach us as loose records. */
export function bookingRefFromRecord(row: Record<string, unknown>): string {
  return bookingRef({
    reference_number: typeof row.reference_number === 'string' ? row.reference_number : null,
    booking_id:       typeof row.booking_id       === 'string' ? row.booking_id       : null,
  })
}
