import proxyApi, { initCsrf } from '@/lib/api/auth.api'

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}

export interface AssignBookingPayload {
  driver_id: string
  truck_id: string
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
}

export type DeliveryStatus = 'pending' | 'in_transit' | 'completed' | 'cancelled'

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
