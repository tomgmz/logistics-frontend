import proxyApi, { initCsrf } from '@/lib/api/auth.api'

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}

/**
 * Pauses the driver put on a delivery — weather, a breakdown, a closed pickup or
 * drop-off. The pause in force is on the booking itself (`paused_at`,
 * `pause_reason`); this reads the history with the driver's notes, which are
 * staff-only, and ends a pause from the office.
 */

export { PAUSE_REASON_LABEL, pauseReasonLabel, type PauseReason } from '@/lib/pause-reasons'
import type { PauseReason } from '@/lib/pause-reasons'

interface PersonName { first_name: string | null; last_name: string | null }

export interface BookingPause {
  pause_id:    string
  booking_id:  string
  trip_id:     string | null
  reason:      PauseReason
  note:        string
  paused_at:   string
  latitude:    number | null
  longitude:   number | null
  report_id:   string | null
  resumed_at:  string | null
  resumed_via: 'driver' | 'staff' | 'auto' | null
  resume_note: string | null
  pauser:      PersonName | null
  resumer:     PersonName | null
}

const B = '/admin/assignments'

export const pauseService = {
  list: async (bookingId: string): Promise<BookingPause[]> => {
    const { data } = await proxyApi.get<ApiResponse<BookingPause[]>>(`${B}/${bookingId}/pauses`)
    return data.data ?? []
  },

  /** End the pause from the office. */
  resume: async (bookingId: string, note?: string | null) => {
    await initCsrf()
    const { data } = await proxyApi.patch<ApiResponse<unknown>>(`${B}/${bookingId}/resume`, { note: note || null })
    return data.data
  },
}
