import type {
  BookingWithRelations,
  BookingDestination,
} from '@/lib/store/slice/routeMap.slice'

/**
 * Formatters and field readers shared by the client and staff transaction
 * history pages.
 *
 * `BookingWithRelations` is deliberately loose (an index signature over
 * unknown), which is why every accessor here casts at the boundary. Keeping
 * those casts in one file means the two pages cannot disagree about what a
 * field is.
 */

/**
 * Many columns are `timestamp WITHOUT time zone` holding UTC (bookings.created_at,
 * booking_destinations.delivered_at, …), so the API returns them with no zone.
 * `new Date()` reads a zoneless string as the BROWSER's local time, which put a
 * drop-off delivered at 4:03 PM in Manila on screen as 8:03 AM. Treat a zoneless
 * string as the UTC it is; leave real offsets and Date objects alone.
 */
function parseServerTime(iso: string | Date): Date {
  if (iso instanceof Date) return iso
  const zoned = /([zZ]|[+-]\d\d:?\d\d)$/.test(iso) || !iso.includes('T')
  return new Date(zoned ? iso : `${iso}Z`)
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return parseServerTime(iso).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return parseServerTime(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/** A row's amount. Treats 0 as "no price yet", which is right on a booking. */
export function formatPeso(n: number | null | undefined): string {
  if (!n) return '—'
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

/**
 * An aggregate's amount. A totals tile reading "—" because the filtered range
 * genuinely sums to zero is a bug, so this only dashes on a missing number.
 */
export function formatPesoExact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fileNameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/')
    const raw = decodeURIComponent(parts[parts.length - 1] || url)
    return raw.replace(/(\.[a-zA-Z0-9]+)\1+$/i, '$1')
  } catch { return url }
}

export function buildCargoSummary(booking: BookingWithRelations): string {
  const parts: string[] = []
  const weight = booking.required_weight_kg as number | null | undefined
  const volume = booking.required_volume_cbm as number | null | undefined
  if (weight)  parts.push(`${weight} KG`)
  if (volume)  parts.push(`${volume.toFixed(2)} CBM`)
  return parts.length > 0 ? parts.join(' · ') : 'No cargo details'
}

export function getDropoffs(booking: BookingWithRelations): string[] {
  const destinations = booking.booking_destinations as BookingDestination[] | undefined
  return (destinations ?? [])
    .slice()
    .sort((a, b) => {
      const ao = a.sequence_order as number | undefined ?? 0
      const bo = b.sequence_order as number | undefined ?? 0
      return ao - bo
    })
    .map((d) => d.address)
}

export function getDriverName(booking: BookingWithRelations): string | null {
  // Main driver first, then the optional second driver ("Juan Cruz & Pedro Reyes").
  const assignments = (booking.driver_assignments as Array<{
    crew_role?: 'lead' | 'second'
    drivers?: { users?: { first_name?: string; last_name?: string } }
  }> | undefined) ?? []
  const names = [...assignments]
    .sort((a, b) => (a.crew_role === 'second' ? 1 : 0) - (b.crew_role === 'second' ? 1 : 0))
    .map((a) => `${a.drivers?.users?.first_name ?? ''} ${a.drivers?.users?.last_name ?? ''}`.trim())
    .filter(Boolean)
  return names.length ? names.join(' & ') : null
}

export function getPlateNumber(booking: BookingWithRelations): string | null {
  const assignments = booking.truck_assignments as Array<{
    trucks?: { plate_number?: string }
  }> | undefined
  return assignments?.[0]?.trucks?.plate_number ?? null
}

export function getTruckModel(booking: BookingWithRelations): string | null {
  const assignments = booking.truck_assignments as Array<{
    trucks?: { truck_models?: { name?: string; vehicle_type?: string } }
  }> | undefined
  const m = assignments?.[0]?.trucks?.truck_models
  return m ? `${m.name ?? ''} (${m.vehicle_type ?? ''})` : null
}

/**
 * The company behind a booking. Staff pages show this column; the client page
 * never needs it, since every row is their own.
 */
export function getCompanyName(booking: BookingWithRelations): string {
  const c = booking.clients as {
    company_name?: string | null
    registered_name?: string | null
  } | null | undefined
  return c?.registered_name?.trim() || c?.company_name?.trim() || 'Unknown client'
}
