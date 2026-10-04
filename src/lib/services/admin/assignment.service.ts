import proxyApi, { initCsrf } from '@/lib/api/auth.api'

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

const B = '/admin/assignments'

export const assignmentService = {
  getAll: () => get<AssignmentRecord[]>(B),

  getByBookingId: (bookingId: string) => get<AssignmentRecord>(`${B}/${bookingId}`),

  getHistoryByBookingId: (bookingId: string) => get<AssignmentRecord[]>(`${B}/${bookingId}/history`),

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
}
