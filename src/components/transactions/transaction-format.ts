import type {
  BookingWithRelations,
  BookingDestination,
} from '@/lib/store/slice/routeMap.slice'
import type { ParsedCargoDetails } from '@/app/types/maps/routemap.types'

/**
 * Formatters and field readers shared by the client and staff transaction
 * history pages.
 *
 * `BookingWithRelations` is deliberately loose (an index signature over
 * unknown), which is why every accessor here casts at the boundary. Keeping
 * those casts in one file means the two pages cannot disagree about what a
 * field is.
 */

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', {
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

export function parseCargoDetails(raw: string | null | undefined): ParsedCargoDetails | null {
  if (!raw) return null
  try { return JSON.parse(raw) as ParsedCargoDetails } catch { return null }
}

export function buildCargoSummary(booking: BookingWithRelations): string {
  const parsed = parseCargoDetails(booking.cargo_details as string | null | undefined)
  const pieces = parsed?.sections
    ?.flatMap((s) => s.groups)
    .reduce((sum, g) => sum + (parseInt(g.pieces || '0', 10)), 0) ?? 0

  const parts: string[] = []
  if (pieces > 0) {
    const mode = parsed?.mode ?? 'loose'
    parts.push(`${pieces} ${mode === 'palletized' ? 'pallet' : 'piece'}${pieces !== 1 ? 's' : ''}`)
  }
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
  const assignments = booking.driver_assignments as Array<{
    drivers?: { users?: { first_name?: string; last_name?: string } }
  }> | undefined
  const u = assignments?.[0]?.drivers?.users
  if (!u) return null
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || null
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
