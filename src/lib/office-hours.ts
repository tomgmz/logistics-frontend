/**
 * When the 8338 office accepts and processes bookings: Monday to Saturday,
 * 8:00 AM to 5:00 PM, Philippine time.
 *
 * This is NOT when trucks run — transit can be scheduled any day, Sundays
 * included, at any time. A client may still submit a booking outside these
 * hours; it simply waits in the queue until the office next opens, and the
 * booking form says so rather than refusing it.
 */
const PH_OFFSET_MS = 8 * 60 * 60 * 1000

export const OFFICE_OPEN_HOUR  = 8
export const OFFICE_CLOSE_HOUR = 17

export const OFFICE_HOURS_LABEL = 'Monday to Saturday, 8:00 AM – 5:00 PM'

/** Whether the office is accepting bookings at `at`, judged in Manila. */
export function isWithinOfficeHours(at: Date | number): boolean {
  const ms = typeof at === 'number' ? at : at.getTime()
  // Shifted into PH wall-clock time, so the UTC getters read Manila values.
  const ph   = new Date(ms + PH_OFFSET_MS)
  const day  = ph.getUTCDay()
  const hour = ph.getUTCHours()
  return day !== 0 && hour >= OFFICE_OPEN_HOUR && hour < OFFICE_CLOSE_HOUR
}

/** A moment as the `YYYY-MM-DD` day and hour it falls on in Manila. */
function phDayHour(ms: number): { day: string; hour: number } {
  const ph = new Date(ms + PH_OFFSET_MS)
  return { day: ph.toISOString().slice(0, 10), hour: ph.getUTCHours() }
}

/**
 * Whether a booking came in after the office closed TODAY (Manila time).
 *
 * Only true for the rest of the evening it was submitted: from midnight on, the
 * office is into the next day and the booking is ordinary work, so the flag
 * stops being news and drops away on its own.
 */
export function submittedAfterCloseToday(
  createdAt: string | null | undefined,
  now: Date | number,
): boolean {
  if (!createdAt) return false
  const created = parseDbTimestamp(createdAt).getTime()
  if (Number.isNaN(created)) return false
  const at    = phDayHour(created)
  const today = phDayHour(typeof now === 'number' ? now : now.getTime()).day
  return at.day === today && at.hour >= OFFICE_CLOSE_HOUR
}

/**
 * `bookings.created_at` is `timestamp without time zone` holding UTC (Postgres
 * `now()` in a UTC session), so it arrives with no offset. `new Date()` would
 * read that as browser-local time; pin it to UTC instead.
 */
function parseDbTimestamp(at: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(at)
  return new Date(hasZone ? at : `${at.replace(' ', 'T')}Z`)
}

/** A moment as Manila wall-clock time, e.g. "Sun, Oct 4, 2026, 7:42 PM". */
export function formatPhDateTime(at: string): string {
  return parseDbTimestamp(at).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
