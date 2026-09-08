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
 * Day of the week for a `YYYY-MM-DD` string, 0 = Sunday.
 *
 * Read as UTC so the answer depends only on the date itself, never on where the
 * browser thinks it is.
 */
export function dayOfWeek(isoDay: string): number {
  return new Date(`${isoDay.slice(0, 10)}T00:00:00Z`).getUTCDay()
}

/** `YYYY-MM-DD` a year on from the given moment, in Philippine time. */
export function phDayPlusYear(at: Date | number): string {
  const ms = typeof at === 'number' ? at : at.getTime()
  const d = new Date(ms + PH_OFFSET_MS)
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString().slice(0, 10)
}
