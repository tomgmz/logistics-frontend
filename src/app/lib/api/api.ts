import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

export default api

export async function optimizeRoute(bookingId: string) {
  const { data } = await api.post(`/route-optimization/optimize/${bookingId}`)
  return data.data
}

export async function updateDestinationStatus(
  destinationId: string,
  status: 'delivered' | 'failed',
  deliveredAt?: string
) {
  const { data } = await api.patch(
    `/booking/destinations/${destinationId}/status`,
    {
      status,
      ...(deliveredAt && { delivered_at: deliveredAt }),
    }
  )
  return data.data
}

export async function getBookingById(bookingId: string) {
  const { data } = await api.get(`/booking/${bookingId}`)
  return data.data
}