/**
 * Booking shapes as the booking API returns them (list rows and their
 * drop-offs). Moved here from the old Redux routeMap slice.
 */

export interface BookingDestination {
  address: string
  [key: string]: unknown
}

export interface BookingWithRelations {
  booking_id: string
  // The booking number people quote. Declared explicitly so it survives the
  // index signature below — read it through bookingRef(), never raw.
  reference_number?: string | null
  origin?: string
  status: string
  schedule_date?: string
  truck_type_needed?: string
  booking_destinations?: BookingDestination[]
  [key: string]: unknown
}
