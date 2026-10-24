import proxyApi, { initCsrf } from '@/lib/api/auth.api'

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}

/**
 * Pauses on a delivery in transit — weather, a breakdown, a closed pickup or
 * drop-off. Only the Operations Manager and the Company Administrator put one
 * on or end it; the driver can do neither. The pause in force is on the booking
 * itself (`paused_at`, `pause_reason`); this reads the history with its notes,
 * which are staff-only, and pauses / resumes from the office.
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
  /** Set by the office while paused: the day it should continue (YYYY-MM-DD). */
  expected_resume_date:      string | null
  /** The driver's call time for that day (HH:MM[:SS]). */
  expected_resume_call_time: string | null
  pauser:      PersonName | null
  resumer:     PersonName | null
}

const B = '/admin/assignments'

export const pauseService = {
  list: async (bookingId: string): Promise<BookingPause[]> => {
    const { data } = await proxyApi.get<ApiResponse<BookingPause[]>>(`${B}/${bookingId}/pauses`)
    return data.data ?? []
  },

  /** Pause the delivery from the office. The note is required (3–500). */
  pause: async (bookingId: string, reason: PauseReason, note: string) => {
    await initCsrf()
    const { data } = await proxyApi.patch<ApiResponse<unknown>>(`${B}/${bookingId}/pause`, { reason, note })
    return data.data
  },

  /**
   * While paused: when the delivery continues. The client is told the date,
   * the driver the date and the call time.
   */
  setContinuation: async (bookingId: string, date: string, callTime: string) => {
    await initCsrf()
    const { data } = await proxyApi.patch<ApiResponse<unknown>>(`${B}/${bookingId}/pause/continuation`, { date, call_time: callTime })
    return data.data
  },

  /** End the pause from the office. */
  resume: async (bookingId: string, note?: string | null) => {
    await initCsrf()
    const { data } = await proxyApi.patch<ApiResponse<unknown>>(`${B}/${bookingId}/resume`, { note: note || null })
    return data.data
  },
}
