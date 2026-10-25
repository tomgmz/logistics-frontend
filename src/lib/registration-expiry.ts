import { phDay } from './ph-date'

/**
 * Where a vehicle's registration stands against its expiry date. The server
 * sends the same answer as `registration_status` on every truck row (see
 * logistics-backend/src/lib/registration-expiry.ts); this copy exists for the
 * one question the server cannot answer ahead of time — is it still valid on a
 * particular booking's delivery day.
 *
 *   missing  — no date entered yet (older vehicles); flagged, not blocked
 *   ok       — valid for more than a calendar month
 *   expiring — expires within one calendar month (when the reminder goes out)
 *   expired  — past the date; cannot be assigned
 */
export type RegistrationState = 'missing' | 'ok' | 'expiring' | 'expired'

export interface RegistrationStatus {
  state:      RegistrationState
  /** `YYYY-MM-DD` */
  expires_on: string | null
  days_left:  number | null
}

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

/** `today` defaults to the Philippine calendar day now. */
export function registrationStatus(expiry: string | null | undefined, today: string = phDay(Date.now())): RegistrationStatus {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}/.test(expiry)) return { state: 'missing', expires_on: null, days_left: null }
  const expires_on = expiry.slice(0, 10)
  const state: RegistrationState =
    expires_on < today                 ? 'expired'
    : expires_on <= addOneMonth(today) ? 'expiring'
    : 'ok'
  return { state, expires_on, days_left: daysBetween(today, expires_on) }
}

/** True when the registration has expired by `onDay` (a delivery day), or today if that is later. */
export function registrationExpiredBy(expiry: string | null | undefined, onDay?: string | null): boolean {
  const today = phDay(Date.now())
  const day   = onDay && onDay > today ? onDay : today
  return registrationStatus(expiry, day).state === 'expired'
}

/** "November 4, 2026" for a `YYYY-MM-DD` day (formatted as UTC so it never shifts a day). */
export function formatRegistrationDay(day: string): string {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${day.slice(0, 10)}T00:00:00Z`))
}
