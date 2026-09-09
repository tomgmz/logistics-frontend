import proxyApi, { initCsrf } from '@/lib/api/auth.api'

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}

/**
 * How many runs the assigned vehicle makes for a booking, and which drop-offs
 * each run serves.
 *
 * A booking whose cargo is larger than the truck body is NOT crewed with a
 * second vehicle — it is the same truck shuttling: load at the origin, run to a
 * drop-off, come back empty, load again. Operations decides how many runs that
 * takes when it crews the booking, and the driver app works through them in
 * order, taking a fresh proof-of-loading photo at each one.
 */

export type TripStatus     = 'pending' | 'in_transit' | 'completed' | 'cancelled'
export type TripStopStatus = 'pending' | 'delivered' | 'failed'

export interface TripStop {
  trip_stop_id:    string
  trip_id:         string
  destination_id:  string
  /** Order of the unload points WITHIN this run — not the bay's order on the booking. */
  sequence_order:  number
  status:          TripStopStatus
  delivered_at:    string | null
  proof_photo_url: string | null
  proof_at:        string | null
  booking_destinations?: {
    destination_id: string
    address:        string
    sequence_order: number
    latitude:       number | null
    longitude:      number | null
    notes:          string | null
    status:         string
  } | null
}

export interface Trip {
  trip_id:     string
  booking_id:  string
  trip_number: number
  status:      TripStatus
  /** Proof of loading for THIS run. One photo per run, never one per booking. */
  pickup_proof_photo_url: string | null
  pickup_proof_at:        string | null
  notes:       string | null
  booking_trip_stops: TripStop[]
}

/** One run as operations plans it. */
export interface TripPlanEntry {
  trip_number?:    number
  destination_ids: string[]
  notes?:          string | null
}

const B = '/admin/assignments'

async function get<T>(url: string): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url)
  return data.data
}

export const tripService = {
  /**
   * The booking's runs.
   *
   * The server creates the default plan — one run over every drop-off — on the
   * first read if none was set, so a booking crewed before trips existed opens
   * here showing exactly the single run it has always been rather than a blank
   * planner.
   */
  getTrips: (bookingId: string) => get<Trip[]>(`${B}/${bookingId}/trips`),

  /**
   * Replace the plan wholesale.
   *
   * A replace rather than a diff: the plan is small, it is edited as a whole in
   * one panel, and a partial apply would leave a booking half-planned — a state
   * the driver app has no way to render. The server refuses once any run has
   * started, so a driver holding a loaded truck never has their route redefined
   * underneath them.
   */
  setTripPlan: async (bookingId: string, trips: TripPlanEntry[]) => {
    await initCsrf()
    const { data } = await proxyApi.put<ApiResponse<Trip[]>>(`${B}/${bookingId}/trips`, { trips })
    return data.data
  },
}

/* ── Reading a plan ───────────────────────────────────────────────────────── */

/** A run that has been loaded, or run and returned, can no longer be re-planned. */
export function planIsLocked(trips: Trip[]): boolean {
  return trips.some((t) => t.status !== 'pending' && t.status !== 'cancelled')
}

/**
 * Whether this booking is really a shuttle.
 *
 * One run over every drop-off is what every booking looked like before trips
 * existed, and it is what the server creates for one that was never planned.
 */
export function isMultiTrip(trips: Trip[]): boolean {
  return trips.filter((t) => t.status !== 'cancelled').length > 1
}
