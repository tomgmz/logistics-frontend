import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { makeDefaultGroup, type DropoffSection, type ItemGroup } from '@/lib/store/slice/booking.slice'

/**
 * Whether a booking is an 8338 rejection still waiting on the client — the
 * bookings that get Edit & Resubmit and Cancel buttons. Mirrors the backend's
 * `isAwaitingClientAfterRejection`: turned down by the General Manager or
 * cancelled by the Company Administrator, never crewed, not yet closed by the
 * client.
 */
export function isAwaitingResubmit(b: BookingWithRelations): boolean {
  return String(b.status).toLowerCase() === 'cancelled'
    && !b.client_closed_at
    && b.ops_status !== 'assigned'
    && (b.gm_status === 'rejected' || !!b.cancelled_by)
}

/** What the booking wizard is loaded with to correct a rejected booking. */
export interface ResubmitDraft {
  bookingId:        string
  reference:        string | null
  rejectionReason:  string | null
  existingDocuments: string[]
  date:             string
  time:             string
  pickup:           string
  pickupLat:        number | null
  pickupLng:        number | null
  dropoffs:         string[]
  dropoffCoords:    { lat: number | null; lng: number | null }[]
  sections:         DropoffSection[]
  allNonStackable:  boolean
}

type StoredDestination = {
  destination_id:  string
  address:         string
  sequence_order:  number
  latitude?:       number | string | null
  longitude?:      number | string | null
}

type StoredCargoItem = {
  destination_id?: string | null
  commodity_id?:   string | null
  commodity_text?: string | null
  product_id?:     string | null
  product_text?:   string | null
  shc_id?:         string | null
  shc_text?:       string | null
  ashc_id?:        string | null
  ashc_text?:      string | null
  quantity?:       number | null
  weight_kg?:      number | string | null
  length_cm?:      number | string | null
  width_cm?:       number | string | null
  height_cm?:      number | string | null
  products?:       { name: string } | null
  commodities?:    { name: string } | null
  shc?:            { code: string } | null
  ashc?:           { code: string } | null
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? n : null
}
const str = (v: unknown): string => (num(v) != null ? String(num(v)) : '')

/**
 * Turn a stored booking back into wizard state.
 *
 * The cargo lines come back as LOOSE items with their stored totals (pieces,
 * total weight, dimensions): the wizard's pallet/loose choice and per-item
 * stacking flags are not stored, only what they added up to. The client sees
 * every figure on the form and can change it before resubmitting.
 */
export function bookingToResubmitDraft(b: BookingWithRelations): ResubmitDraft {
  const stops = ((b.booking_destinations ?? []) as unknown as StoredDestination[])
    .slice()
    .sort((x, y) => x.sequence_order - y.sequence_order)

  const indexByDestination = new Map(stops.map((d, i) => [d.destination_id, i] as const))
  const nonStackable = !!b.non_stackable_cargo

  const groupsByIndex = new Map<number, ItemGroup[]>()
  for (const item of (b.booking_cargo_items ?? []) as StoredCargoItem[]) {
    // A line not tied to a stop belongs with the first one.
    const index = (item.destination_id && indexByDestination.get(item.destination_id)) || 0
    const group: ItemGroup = {
      ...makeDefaultGroup(),
      pieces:        str(item.quantity),
      looseLength:   str(item.length_cm),
      looseWidth:    str(item.width_cm),
      looseHeight:   str(item.height_cm),
      weight:        str(item.weight_kg),
      weightUnit:    'kg',
      // Stored weight is the line's total, not per piece.
      perItem:       'Total',
      nonStackable,
      commodity:     item.commodities?.name ?? item.commodity_text ?? '',
      commodityId:   item.commodity_id ?? '',
      product:       item.products?.name ?? item.product_text ?? '',
      productId:     item.product_id ?? '',
      shc:           item.shc?.code ?? item.shc_text ?? '',
      shcId:         item.shc_id ?? '',
      additionalShc: item.ashc?.code ?? item.ashc_text ?? '',
      ashcId:        item.ashc_id ?? '',
    }
    groupsByIndex.set(index, [...(groupsByIndex.get(index) ?? []), group])
  }

  const dropoffs = stops.length > 0 ? stops.map((d) => d.address) : ['']
  const sections: DropoffSection[] = dropoffs.map((_, i) => ({
    dropoffIndex: i,
    groups:       groupsByIndex.get(i) ?? [makeDefaultGroup()],
  }))

  return {
    bookingId:         b.booking_id,
    reference:         b.reference_number ?? null,
    rejectionReason:   (b.rejection_reason as string | null | undefined) ?? null,
    existingDocuments: ((b.transaction_documents as string[] | null | undefined) ?? []).filter(Boolean),
    date:              String(b.schedule_date ?? '').slice(0, 10),
    time:              String(b.call_time ?? '').slice(0, 5),
    pickup:            String(b.origin ?? ''),
    pickupLat:         num(b.origin_latitude),
    pickupLng:         num(b.origin_longitude),
    dropoffs,
    dropoffCoords:     stops.length > 0
      ? stops.map((d) => ({ lat: num(d.latitude), lng: num(d.longitude) }))
      : [{ lat: null, lng: null }],
    sections,
    allNonStackable:   nonStackable,
  }
}

/** A readable name for a stored document URL — its last path segment. */
export function documentName(url: string): string {
  const last = url.split('?')[0].split('/').pop() ?? url
  try { return decodeURIComponent(last) } catch { return last }
}
