import { phDay } from './ph-date'

/**
 * Where a driver's license stands against its expiry date, for flagging it in
 * Driver Management.
 *
 * "Expiring" starts one calendar month before the expiry date, in Philippine
 * time: the same window the backend's license-expiry scheduler uses to remind
 * the driver, so the Company Administrator sees the flag on the day the driver
 * gets the reminder.
 */
export type LicenseExpiryState =
  | { kind: 'ok' }
  | { kind: 'expiring'; daysLeft: number }
  | { kind: 'expired'; daysAgo: number }

const DAY_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD` plus one calendar month, clamped to the end of a shorter month. */
function addOneMonth(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const lastOfNext = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d, lastOfNext))).toISOString().slice(0, 10)
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS)
}

export function licenseExpiryState(
  expiry: string | null | undefined,
  now: Date | number = Date.now(),
): LicenseExpiryState {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}/.test(expiry)) return { kind: 'ok' }
  const day   = expiry.slice(0, 10)
  const today = phDay(now)
  if (day < today) return { kind: 'expired', daysAgo: daysBetween(day, today) }
  if (day <= addOneMonth(today)) return { kind: 'expiring', daysLeft: daysBetween(today, day) }
  return { kind: 'ok' }
}

/** True when the license needs the Company Administrator's attention. */
export function needsLicenseUpdate(expiry: string | null | undefined, now?: Date | number): boolean {
  return licenseExpiryState(expiry, now).kind !== 'ok'
}
