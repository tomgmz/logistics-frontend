import authApi, { initCsrf } from './auth.api'

// ROUTE OPTIMIZATION

export async function optimizeRoute(bookingId: string) {
  const { data } = await authApi.post(`/route-optimization/optimize/${bookingId}`)
  return data.data
}

// BOOKING
export async function updateDestinationStatus(
  destinationId: string,
  status: 'pending' | 'delivered' | 'failed',
  deliveredAt?: string
) {
  await initCsrf()
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

export default authApi