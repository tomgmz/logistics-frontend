import authApi, { initCsrf } from './auth.api'

export interface DirectionsRequest {
  origin: {
    location: { latLng: { latitude: number; longitude: number } }
  }
  destination: {
    location: { latLng: { latitude: number; longitude: number } }
  }
  intermediates?: {
    location: { latLng: { latitude: number; longitude: number } }
  }[]
  travelMode: 'DRIVE' | 'WALK' | 'BICYCLE' | 'TWO_WHEELER'
  routingPreference?: 'TRAFFIC_AWARE' | 'TRAFFIC_AWARE_OPTIMAL' | 'TRAFFIC_UNAWARE'
}

export interface DirectionsResponse {
  routes: {
    polyline: {
      encodedPolyline: string
    }
  }[]
}

export async function computeDirections(
  payload: DirectionsRequest
): Promise<DirectionsResponse> {
  await initCsrf()
  const { data } = await authApi.post<{ status: string; data: DirectionsResponse }>(
    '/directions',
    payload
  )
  return data.data
}