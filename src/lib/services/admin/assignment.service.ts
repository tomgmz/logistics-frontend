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
  vendor_name?: string
  vendor_contact?: string
  vendor_driver_name?: string
  vendor_driver_license?: string
  vendor_driver_phone?: string
  vendor_vehicle_plate?: string
  vendor_vehicle_type?: string
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

  // The booking this delivery belongs to. Its status — not the delivery's — is
  // what says whether the crew is still tied up.
  bookings?: { booking_id: string; status: string; schedule_date?: string | null } | null
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

const B = '/admin/assignments'

export const assignmentService = {
  getAll: () => get<AssignmentRecord[]>(B),

  getByBookingId: (bookingId: string) => get<AssignmentRecord>(`${B}/${bookingId}`),

  getHistoryByBookingId: (bookingId: string) => get<AssignmentRecord[]>(`${B}/${bookingId}/history`),

  assignBooking: (bookingId: string, payload: AssignBookingPayload) =>
    post<AssignmentRecord>(`${B}/${bookingId}`, payload),

  updateDeliveryStatus: (bookingId: string, payload: UpdateDeliveryStatusPayload) =>
    patch<AssignmentRecord>(`${B}/${bookingId}/status`, payload),
}
