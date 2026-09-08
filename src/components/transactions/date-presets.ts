import { phDay, phDayPlus } from '@/lib/ph-date'

/**
 * Date-range presets for the transaction history filter.
 *
 * Resolved here rather than on the API so the backend only ever receives two
 * concrete `YYYY-MM-DD` days — there is no preset vocabulary to keep in sync
 * across the two repos.
 *
 * Every boundary is a Philippine calendar day. The fleet runs in Manila and
 * `schedule_date` is a plain `date`, so "this month" has to mean the Manila
 * month regardless of where the browser sits.
 */

export type DatePreset =
  | 'all' | 'today' | 'last_7' | 'this_month'
  | 'last_month' | 'this_quarter' | 'ytd' | 'custom'

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all',          label: 'All time' },
  { key: 'today',        label: 'Today' },
  { key: 'last_7',       label: 'Last 7 days' },
  { key: 'this_month',   label: 'This month' },
  { key: 'last_month',   label: 'Last month' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'ytd',          label: 'Year to date' },
  { key: 'custom',       label: 'Custom range…' },
]

/** Split a `YYYY-MM-DD` into its numeric parts, no Date parsing involved. */
function parts(day: string): { y: number; m: number; d: number } {
  return { y: +day.slice(0, 4), m: +day.slice(5, 7), d: +day.slice(8, 10) }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function firstOfMonth(y: number, m: number): string {
  return `${y}-${pad(m)}-01`
}

/** Last day of a month, without leaving string arithmetic to a Date object. */
function lastOfMonth(y: number, m: number): string {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${pad(m)}-${pad(days)}`
}

/**
 * A preset resolved against now. `all` and `custom` return nulls — `all` because
 * there is no range, `custom` because the range is whatever the user typed.
 */
export function resolvePreset(
  preset: DatePreset,
  at: Date | number = Date.now(),
): { from: string | null; to: string | null } {
  const today = phDay(at)
  const { y, m } = parts(today)

  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'last_7':
      // Inclusive of today, so six days back is a seven-day window.
      return { from: phDayPlus(at, -6), to: today }
    case 'this_month':
      return { from: firstOfMonth(y, m), to: today }
    case 'last_month': {
      const py = m === 1 ? y - 1 : y
      const pm = m === 1 ? 12 : m - 1
      return { from: firstOfMonth(py, pm), to: lastOfMonth(py, pm) }
    }
    case 'this_quarter': {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1
      return { from: firstOfMonth(y, qStart), to: today }
    }
    case 'ytd':
      return { from: `${y}-01-01`, to: today }
    default:
      return { from: null, to: null }
  }
}
