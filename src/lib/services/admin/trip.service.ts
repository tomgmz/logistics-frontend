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
  /** Planned arrival (drive time + unloading at earlier stops). */
  planned_arrival_at?: string | null
  proof_photo_url: string | null
  proof_at:        string | null
  /** How much of each cargo line this stop unloads on this run. */
  booking_trip_cargo?: TripCargo[]
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

/** One cargo line's share of one run. */
export interface TripCargo {
  trip_cargo_id: string
  item_id:       string
  planned_qty:   number
  /** Null until the run is loaded; what the driver actually put on the truck. */
  loaded_qty:    number | null
}

export interface Trip {
  trip_id:     string
  booking_id:  string
  trip_number: number
  status:      TripStatus
  /** Proof of loading for THIS run. One photo per run, never one per booking. */
  pickup_proof_photo_url: string | null
  pickup_proof_at:        string | null
  /** The planned estimate, chained run to run — see backend planned-eta.service.ts. */
  planned_departure_at?: string | null
  planned_arrival_at?:   string | null
  planned_return_at?:    string | null
  notes:       string | null
  booking_trip_stops: TripStop[]
}

/** One run as operations plans it: its drop-offs and how much goes to each. */
export interface TripPlanEntry {
  trip_number?:    number
  destination_ids: string[]
  stops?:          Array<{ destination_id: string; items: Array<{ item_id: string; quantity: number }> }>
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
   * Replace the runs not loaded yet.
   *
   * A replace rather than a diff: the plan is small and edited as a whole in one
   * panel. Runs already loaded or finished are kept by the server exactly as
   * they are — a driver holding a loaded truck never has their route redefined
   * underneath them — and their quantities count as already delivered.
   */
  setTripPlan: async (bookingId: string, trips: TripPlanEntry[]) => {
    await initCsrf()
    const { data } = await proxyApi.put<ApiResponse<Trip[]>>(`${B}/${bookingId}/trips`, { trips })
    return data.data
  },

  /**
   * When the driver should be at the pickup point (`HH:MM`, PH time), or null
   * to follow the client's call time. Only before the delivery starts. The
   * driver is reminded an hour ahead and may still start earlier.
   */
  setDriverCallTime: async (bookingId: string, driverCallTime: string | null) => {
    await initCsrf()
    const { data } = await proxyApi.put<ApiResponse<{ driver_call_time: string | null }>>(
      `${B}/${bookingId}/driver-call-time`, { driver_call_time: driverCallTime },
    )
    return data.data.driver_call_time
  },
}

/* ── Reading a plan ───────────────────────────────────────────────────────── */

/** A run that has been loaded, or run and returned, can no longer be re-planned. */
export function isStartedTrip(t: Pick<Trip, 'status'>): boolean {
  return t.status === 'in_transit' || t.status === 'completed'
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
