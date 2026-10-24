import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import type { TimelineStage, TimelineTrip } from '@/lib/services/client/booking.service'

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}

export interface AssignBookingPayload {
  driver_id?: string
  truck_id?: string

  is_vendor_supplied?: boolean
  /**
   * The registered vendor driver (User Management → Vendor Drivers). The server
   * copies their details and vendor onto the delivery; only the vehicle is typed.
   */
  vendor_driver_user_id?: string
  vendor_vehicle_plate?: string
  vendor_vehicle_type?: string
  /**
   * Optional second driver. Company: a drivers.driver_id from the assignable
   * pool. Vendor: a registered vendor driver's user_id. null removes them.
   */
  second_driver_id?: string | null
  second_vendor_driver_user_id?: string | null
  /** Helper's name on a route of 30 km or less. Information only. */
  helper_name?: string | null
}

/**
 * The route's road distance (pickup to every drop-off, one way) and the crew rule
 * it sets: over threshold_km a second driver is required, otherwise an optional
 * helper. distance_km null means it could not be measured, and neither is enforced.
 */
export interface RouteDistance {
  distance_km:            number | null
  threshold_km:           number
  requires_second_driver: boolean | null
}

/** The optional second driver on a booking. They see it in the app; the main driver runs it. */
export interface SecondDriverRecord {
  driver_id:      string
  license_number: string | null
  license_expiry: string | null
  is_external:    boolean
  vendor_name:    string | null
  users: {
    user_id:    string
    first_name: string | null
    last_name:  string | null
    phone:      string | null
    email:      string | null
  } | null
}

export interface AssignmentRecord {
  delivery_id: string
  booking_id: string
  driver_id: string | null
  truck_id: string | null
  status: DeliveryStatus
  pickup_time: string | null
  delivery_time: string | null
  created_at: string
  updated_at: string

  is_vendor_supplied: boolean
  vendor_name: string | null
  vendor_contact: string | null
  vendor_driver_name: string | null
  vendor_driver_license: string | null
  vendor_driver_phone: string | null
  vendor_vehicle_plate: string | null
  vendor_vehicle_type: string | null
  vendor_driver_email: string | null
  /** The provisioned account, when this driver was given app access. */
  vendor_driver_user_id: string | null
  second_driver?: SecondDriverRecord | null
  /** Optional helper on a short route, by name only. */
  helper_name?: string | null
  /** The fleet vehicle, when there is one. Its status flags a pulled vehicle. */
  trucks?: {
    truck_id:     string
    plate_number: string
    status:       string
  } | null

  // The booking this delivery belongs to. Its status — not the delivery's — is
  // what says whether the crew is still tied up, and a completed booking keeps
  // holding them until `fleet_return_at` says the vehicle reached the yard.
  bookings?: {
    booking_id:       string
    status:           string
    schedule_date?:   string | null
    fleet_return_at?: string | null
  } | null
}

/**
 * Statuses a person sets to take a vehicle off the road. A booking whose vehicle
 * has one of these needs another vehicle (or, on the road, a decision).
 */
export const OUT_OF_SERVICE_STATUSES = ['under_maintenance', 'inactive', 'archived'] as const

export function isOutOfServiceStatus(status: string | null | undefined): boolean {
  return !!status && (OUT_OF_SERVICE_STATUSES as readonly string[]).includes(status)
}

/** The pulled vehicle on a booking that is still running, or null. */
export function outOfServiceVehicle(
  record: AssignmentRecord | null | undefined,
): { plate: string; status: string } | null {
  const truck = record?.trucks
  if (!truck || !isOutOfServiceStatus(truck.status)) return null
  const booking = record?.bookings
  // Done and the truck is home: nothing left to act on.
  if (booking?.status === 'cancelled') return null
  if ((booking?.status === 'delivered' || booking?.status === 'completed') && booking.fleet_return_at) return null
  return { plate: truck.plate_number, status: truck.status }
}

// The four values the database permits. 'completed'/'cancelled' were accepted
// here and by the API, but writing either raised a constraint violation.
export type DeliveryStatus = 'pending' | 'in_transit' | 'delivered' | 'failed'

export interface UpdateDeliveryStatusPayload {
  status: DeliveryStatus
  pickup_time?: string
  delivery_time?: string
}

async function get<T>(url: string): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url)
  return data.data
}

async function post<T>(url: string, payload: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.post<ApiResponse<T>>(url, payload)
  return data.data
}

async function put<T>(url: string, payload: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.put<ApiResponse<T>>(url, payload)
  return data.data
}

async function patch<T>(url: string, payload: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.patch<ApiResponse<T>>(url, payload)
  return data.data
}

/**
 * Why the server thinks this vehicle may not carry this load. Server-side mirror
 * of the client wizard's own check, run at assignment time — the point where a
 * real vehicle is finally chosen.
 */
export interface CapacityWarning {
  reasons:         string[]
  overWeight:      boolean
  overVolume:      boolean
  overLength:      boolean
  overFloorSpace:  boolean
  usableVolumeCbm: number | null
}

/** Replacing the crew of a delivery already on the road (it must be paused). */
/** The new crew: the 8338 fleet (driver_id + truck_id) or a vendor (vendor driver + typed vehicle). */
export interface ReplaceCrewPayload {
  driver_id?:        string
  truck_id?:         string
  second_driver_id?: string | null
  helper_name?:      string | null
  reason_note:       string
  is_vendor_supplied?:           boolean
  vendor_driver_user_id?:        string
  second_vendor_driver_user_id?: string | null
  vendor_vehicle_plate?:         string
  vendor_vehicle_type?:          string | null
}

type PersonRef = { driver_id: string; users: { first_name: string | null; last_name: string | null } | null } | null

/** One crew replacement on a booking, as the staff history lists it. */
export interface CrewReplacement {
  replacement_id:        string
  booking_id:            string
  reason_note:           string
  replaced_at:           string
  replaced_by_role:      string | null
  transfer_required:     boolean
  transfer_confirmed_at: string | null
  transfer_photo_url:    string | null
  old_vehicle_plate:     string | null
  /** A vendor's typed-in vehicle, when the new crew came from a vendor. */
  new_vehicle_plate:     string | null
  old_driver:            PersonRef
  new_driver:            PersonRef
  old_second_driver:     PersonRef
  new_second_driver:     PersonRef
  old_truck:             { plate_number: string } | null
  new_truck:             { plate_number: string } | null
  replaced_by_user:      { first_name: string | null; last_name: string | null } | null
}

const B = '/admin/assignments'

export const assignmentService = {
  getAll: () => get<AssignmentRecord[]>(B),

  getByBookingId: (bookingId: string) => get<AssignmentRecord>(`${B}/${bookingId}`),

  getHistoryByBookingId: (bookingId: string) => get<AssignmentRecord[]>(`${B}/${bookingId}/history`),

  getRouteDistance: (bookingId: string) => get<RouteDistance>(`${B}/${bookingId}/route-distance`),

  /**
   * Crew a booking. The reply carries `capacity_warning` when the chosen vehicle
   * may not actually fit the load — advisory, so the assignment still happened.
   */
  assignBooking: (bookingId: string, payload: AssignBookingPayload) =>
    post<AssignmentRecord & { capacity_warning?: CapacityWarning | null }>(
      `${B}/${bookingId}`, payload,
    ),

  updateDeliveryStatus: (bookingId: string, payload: UpdateDeliveryStatusPayload) =>
    patch<AssignmentRecord>(`${B}/${bookingId}/status`, payload),

  replaceCrew: (bookingId: string, payload: ReplaceCrewPayload) =>
    post<CrewReplacement>(`${B}/${bookingId}/replace-crew`, payload),

  getReplacements: (bookingId: string) => get<CrewReplacement[]>(`${B}/${bookingId}/replacements`),

  /** Stop times with the office's correction notes. */
  getTimeline: (bookingId: string) => get<TimelineTrip[]>(`${B}/${bookingId}/timeline`),

  /** Fill in or correct one stop time, with a reason. Returns the new timeline. */
  setStopTime: (bookingId: string, payload: {
    trip_id: string; trip_stop_id?: string | null; stage: TimelineStage; at: string; note: string
  }) => put<TimelineTrip[]>(`${B}/${bookingId}/timeline`, payload),
}
