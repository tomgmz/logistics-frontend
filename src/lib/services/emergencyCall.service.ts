import proxyApi from '@/lib/api/auth.api'

/** A driver's in-app emergency call, as a ringing browser shows it. */
export interface IncomingCall {
  call_id:      string
  report_id:    string | null
  booking_id:   string | null
  booking_ref:  string | null
  driver_name:  string
  driver_phone: string | null
  plate_number: string | null
  incident:     string
  latitude:     number | null
  longitude:    number | null
  address:      string | null
  speed_kmh:    number | null
  created_at:   string
}

interface ApiResponse<T> {
  status: string
  data:   T
}

export const emergencyCallService = {
  /** Calls ringing for me right now — for a dashboard that just opened. */
  ringing: async (): Promise<IncomingCall[]> => {
    const { data } = await proxyApi.get<ApiResponse<IncomingCall[]>>('/admin/emergency-calls/ringing')
    return data.data ?? []
  },

  /** Claim the call. 409 when someone else got there first or it ended. */
  answer: async (callId: string): Promise<{ url: string; token: string; call: IncomingCall }> => {
    const { data } = await proxyApi.post<ApiResponse<{ url: string; token: string; call: IncomingCall }>>(
      `/admin/emergency-calls/${encodeURIComponent(callId)}/answer`,
    )
    return data.data
  },

  end: async (callId: string): Promise<void> => {
    await proxyApi.post(`/admin/emergency-calls/${encodeURIComponent(callId)}/end`)
  },
}
