import authApi from '../auth.api'
import { getMe } from '../auth.api'

// ROUTE OPTIMIZATION

export async function optimizeRoute(bookingId: string) {
  const { data } = await authApi.post(`/route-optimization/optimize/${bookingId}`)
  return data.data
}

// BOOKING

export interface CreateBookingPayload {
  client_id: string
  origin: string
  truck_type_needed: string
  cargo_details?: string
  schedule_date: string
  call_time: string
  required_volume_cbm?: number
  required_weight_kg?: number
  required_length_cm?: number
  stackable_required?: boolean
  destinations: {
    address: string
    sequence_order: number
    notes?: string
  }[]
}

export async function createBooking(input: CreateBookingPayload) {
  const { data } = await authApi.post('/booking', input)
  return data.data
}

export async function updateDestinationStatus(
  destinationId: string,
  status: 'delivered' | 'failed',
  deliveredAt?: string
) {
  const { data } = await authApi.patch(`/booking/destinations/${destinationId}/status`, {
    status,
    ...(deliveredAt && { delivered_at: deliveredAt }),
  })
  return data.data
}

export async function getBookingById(bookingId: string) {
  const { data } = await authApi.get(`/booking/${bookingId}`)
  return data.data
}

export { getMe }
export default authApi