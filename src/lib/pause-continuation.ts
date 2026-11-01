/**
 * The continuation of a paused delivery, as the booking record carries it.
 *
 * While a delivery is paused (a typhoon, a closed road) the Company
 * Administrator or Operations Manager sets the day and driver call time it moves
 * again. The planned arrival (`estimated_delivery`) is then re-planned from that
 * call time, so it is a real window on the new day. Without a date — or once
 * the date has passed with the delivery still paused — the planned arrival is
 * only "now plus the rest of the trip" and keeps moving, so it is shown as "To
 * be confirmed" instead. The live ETA is blank throughout: it only exists while
 * the truck is moving.
 */

export interface PauseContinuationRow {
  expected_resume_date:      string | null
  expected_resume_call_time: string | null
  resumed_at:                string | null
}

export interface PauseContinuation {
  /** YYYY-MM-DD, Manila. */
  date:     string
  /** HH:MM[:SS]. */
  callTime: string
  /** That call time as an instant. */
  at:       number
}

/** The open pause's continuation, or null (not paused, or no date set). */
export function openContinuation(
  booking: { paused_at?: string | null; pauses?: PauseContinuationRow[] | null } | null | undefined,
): PauseContinuation | null {
  if (!booking?.paused_at) return null
  const open = (booking.pauses ?? []).find((p) => !p.resumed_at && p.expected_resume_date && p.expected_resume_call_time)
  if (!open) return null
  const hm = String(open.expected_resume_call_time).slice(0, 5)
  const at = Date.parse(`${String(open.expected_resume_date).slice(0, 10)}T${hm}:00+08:00`)
  if (!Number.isFinite(at)) return null
  return { date: String(open.expected_resume_date).slice(0, 10), callTime: hm, at }
}

/**
 * How a paused delivery's planned arrival should read:
 *   'moving'  — not paused; show the plan as usual
 *   'planned' — paused with a continuation still ahead; the plan is real
 *   'tbc'     — paused with no date, or the date passed still paused
 */
export function pausedPlanState(
  booking: { paused_at?: string | null; pauses?: PauseContinuationRow[] | null } | null | undefined,
  now = Date.now(),
): 'moving' | 'planned' | 'tbc' {
  if (!booking?.paused_at) return 'moving'
  const c = openContinuation(booking)
  return c && c.at > now ? 'planned' : 'tbc'
}

/** "Nov 5, 2026" from YYYY-MM-DD, as a calendar day. */
export function continuationDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  })
}
