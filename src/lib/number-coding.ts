/**
 * Metro Manila number coding — the MMDA's Unified Vehicular Volume Reduction
 * Program — as a FLAG for the crew picker, never a block.
 *
 * The plate's last digit fixes the weekday a vehicle is coded:
 *   Mon 1·2   Tue 3·4   Wed 5·6   Thu 7·8   Fri 9·0   (no coding Sat/Sun)
 * during 7–10 AM and 5–8 PM. Makati enforces it 7 AM–7 PM with no window.
 *
 * Whether it matters for a booking depends on where the run goes: coding only
 * exists inside Metro Manila, so a Laguna → Batangas booking is never flagged.
 * That is read from the addresses (Google's formatted addresses carry the city
 * and "Metro Manila"), not from coordinates — a bounding box around NCR would
 * also take in Cainta, Bacoor and Meycauayan.
 *
 * Deliberately a flag: cities change their hours, public holidays suspend it,
 * and some vehicles are exempt, none of which this knows. The operator does.
 */

export interface CodingFlag {
  /** "Monday" */
  day:        string
  digit:      number
  /** Metro Manila cities the route touches, or ['Metro Manila'] when only the region is named. */
  cities:     string[]
  /** The coding hours that apply, e.g. "7–10 AM and 5–8 PM". */
  hours:      string
  /** True when the call time itself falls inside a coding window. */
  callTimeCoded: boolean
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Weekday (0 = Sunday) on which a plate ending in `digit` is coded. */
const CODED_WEEKDAY: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 0: 5 }

type Window = [startMin: number, endMin: number]
const STANDARD_WINDOWS: Window[] = [[7 * 60, 10 * 60], [17 * 60, 20 * 60]]
const MAKATI_WINDOWS:   Window[] = [[7 * 60, 19 * 60]]

/**
 * Metro Manila cities, matched in an address. "Manila" and "San Juan" are left
 * out on their own: "Manila" is inside "Metro Manila", and there is a San Juan
 * in Batangas and La Union. Both still count once "Metro Manila" is in the
 * address.
 */
const NCR_CITIES: Array<{ name: string; re: RegExp }> = [
  { name: 'Caloocan',    re: /\bcaloocan\b/i },
  { name: 'Las Piñas',   re: /\blas pi[ñn]as\b/i },
  { name: 'Makati',      re: /\bmakati\b/i },
  { name: 'Malabon',     re: /\bmalabon\b/i },
  { name: 'Mandaluyong', re: /\bmandaluyong\b/i },
  { name: 'Marikina',    re: /\bmarikina\b/i },
  { name: 'Muntinlupa',  re: /\bmuntinlupa\b/i },
  { name: 'Navotas',     re: /\bnavotas\b/i },
  { name: 'Parañaque',   re: /\bpara[ñn]aque\b/i },
  { name: 'Pasay',       re: /\bpasay\b/i },
  { name: 'Pasig',       re: /\bpasig\b/i },
  { name: 'Pateros',     re: /\bpateros\b/i },
  { name: 'Quezon City', re: /\bquezon city\b/i },
  { name: 'Taguig',      re: /\btaguig\b/i },
  { name: 'Valenzuela',  re: /\bvalenzuela\b/i },
]
const METRO_RE = /\b(metro manila|ncr|national capital region)\b/i

/** Last digit on the plate ("NBC 1234", "NBC-1234", "ABC 123"), or null if it has none. */
export function plateLastDigit(plate: string | null | undefined): number | null {
  const digits = String(plate ?? '').replace(/\D/g, '')
  return digits ? Number(digits[digits.length - 1]) : null
}

/** "Monday" for a plate ending in 1 or 2, etc.; null when the plate has no digit. */
export function codingDayOf(plate: string | null | undefined): string | null {
  const digit = plateLastDigit(plate)
  return digit == null ? null : WEEKDAY[CODED_WEEKDAY[digit]]
}

/** The Metro Manila cities named across these addresses (see NCR_CITIES). */
export function metroManilaCities(addresses: Array<string | null | undefined>): string[] {
  const found = new Set<string>()
  let metro = false
  for (const raw of addresses) {
    const a = String(raw ?? '')
    if (!a) continue
    if (METRO_RE.test(a)) metro = true
    for (const c of NCR_CITIES) if (c.re.test(a)) found.add(c.name)
  }
  if (found.size > 0) return [...found]
  return metro ? ['Metro Manila'] : []
}

/** Weekday (0 = Sunday) of a `YYYY-MM-DD` calendar day, read in Manila. */
function weekdayOf(scheduleDate: string): number | null {
  const day = scheduleDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  // Noon Manila is the same calendar day in UTC, so getUTCDay is that weekday.
  const at = new Date(`${day}T12:00:00+08:00`)
  return Number.isNaN(at.getTime()) ? null : at.getUTCDay()
}

function minutesOf(callTime: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(callTime ?? ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * The coding flag for putting this plate on this booking, or null when coding
 * does not touch it (wrong weekday, weekend, route outside Metro Manila, or a
 * plate with no digit).
 */
export function codingFlagFor(
  plate: string | null | undefined,
  booking: {
    schedule_date?: string | null
    call_time?:     string | null
    origin?:        string | null
    booking_destinations?: Array<{ address?: string | null }> | null
  },
): CodingFlag | null {
  const digit = plateLastDigit(plate)
  if (digit == null || !booking.schedule_date) return null

  const weekday = weekdayOf(booking.schedule_date)
  if (weekday == null || CODED_WEEKDAY[digit] !== weekday) return null

  const cities = metroManilaCities([
    booking.origin,
    ...(booking.booking_destinations ?? []).map((d) => d.address),
  ])
  if (cities.length === 0) return null

  const makati  = cities.includes('Makati')
  const others  = cities.some((c) => c !== 'Makati')
  const windows = [...(others ? STANDARD_WINDOWS : []), ...(makati ? MAKATI_WINDOWS : [])]
  const hours   = [
    others ? '7–10 AM and 5–8 PM' : null,
    makati ? `${others ? 'Makati ' : ''}7 AM–7 PM, no window hours` : null,
  ].filter(Boolean).join('; ')

  const call = minutesOf(booking.call_time)
  const callTimeCoded = call != null && windows.some(([s, e]) => call >= s && call < e)

  return { day: WEEKDAY[weekday], digit, cities, hours, callTimeCoded }
}
