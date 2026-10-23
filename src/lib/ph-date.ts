/**
 * Philippine calendar days, on the client.
 *
 * The booking form used to do its date arithmetic in the BROWSER's timezone:
 * `new Date(year, month - 1, day)` and `.getDay()` are local-time operations, so
 * "is this a Sunday" and "is this at least tomorrow" were answered in whatever
 * zone the device happened to be set to. `nowDate()` corrects the clock against
 * the server but not the zone, so a device outside PH — or simply set wrong —
 * could pass this validator and be rejected by the API, or be refused a date the
 * API would have accepted.
 *
 * `schedule_date` is a plain calendar day and the fleet runs in Manila, so
 * Manila is the only correct frame. Mirrors `lib/ph-date.ts` on the API side;
 * the Philippines is a fixed UTC+8 with no DST, so the constant offset is exact.
 */
const PH_OFFSET_MS = 8 * 60 * 60 * 1000

/** A moment, as the `YYYY-MM-DD` calendar day it falls on in Philippine time. */
export function phDay(at: Date | number): string {
  const ms = typeof at === 'number' ? at : at.getTime()
  return new Date(ms + PH_OFFSET_MS).toISOString().slice(0, 10)
}

/** The same day, shifted by whole days, still as `YYYY-MM-DD`. */
export function phDayPlus(at: Date | number, days: number): string {
  const ms = typeof at === 'number' ? at : at.getTime()
  return phDay(ms + days * 24 * 60 * 60 * 1000)
}

/**
 * Same-day bookings close at 12:00 noon, Manila time, so the office (Monday to
 * Saturday, 8 AM – 5 PM) still has the afternoon to review and dispatch them.
 * Sunday has no office, so it never offers today. Mirrors the API.
 */
export const SAME_DAY_CUTOFF_HOUR = 12

export function sameDayBookingOpen(at: Date | number): boolean {
  const ms = typeof at === 'number' ? at : at.getTime()
  const ph = new Date(ms + PH_OFFSET_MS)
  return ph.getUTCDay() !== 0 && ph.getUTCHours() < SAME_DAY_CUTOFF_HOUR
}

/** The earliest bookable day: today while same-day is open, else tomorrow. */
export function phEarliestBookableDay(at: Date | number): string {
  return sameDayBookingOpen(at) ? phDay(at) : phDayPlus(at, 1)
}

/** Manila wall-clock time as `HH:MM`, comparable with the form's call time. */
export function phTimeHHMM(at: Date | number): string {
  const ms = typeof at === 'number' ? at : at.getTime()
  return new Date(ms + PH_OFFSET_MS).toISOString().slice(11, 16)
}

/**
 * Day of the week for a `YYYY-MM-DD` string, 0 = Sunday.
 *
 * Read as UTC so the answer depends only on the date itself, never on where the
 * browser thinks it is.
 */
export function dayOfWeek(isoDay: string): number {
  return new Date(`${isoDay.slice(0, 10)}T00:00:00Z`).getUTCDay()
}

/**
 * The same calendar day one month on, in Philippine time — the latest day a
 * booking can be scheduled for (mirrors the API's phDayPlusMonth). A day next
 * month doesn't have (Jan 31) becomes that month's last day.
 */
export function phDayPlusMonth(at: Date | number): string {
  const ms   = typeof at === 'number' ? at : at.getTime()
  const d    = new Date(ms + PH_OFFSET_MS)
  const day  = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + 1)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}
