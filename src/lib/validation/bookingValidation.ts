import type { CargoMode, ItemGroup, DropoffSection } from '@/lib/store/slice/booking.slice'
import { nowDate } from '@/app/utils/serverTime'
import { phDay, phDayPlusMonth, phEarliestBookableDay, phTimeHHMM, SAME_DAY_LATEST_CALL_TIME } from '@/lib/ph-date'

export interface ScheduleErrors {
  date?: string
  time?: string
}

export interface RouteErrors {
  pickup?: string
  dropoffs: Record<number, string>
}

export interface GroupErrors {
  // loose
  pieces?: string
  looseLength?: string
  looseWidth?: string
  looseHeight?: string
  weight?: string
  // palletized
  numPallets?: string
  palletLength?: string
  palletWidth?: string
  palletHeight?: string
  grossWeightPerPallet?: string
  netWeightPerPallet?: string
  // shared
  commodity?: string
  product?: string
  shc?: string
}

export interface SectionErrors {
  dropoffIndex: number
  groups: Record<string, GroupErrors>
}

export interface BookingErrors {
  schedule:      ScheduleErrors
  route:         RouteErrors
  sections:      SectionErrors[]
  documents?:    string
  touched:       boolean
}

function isPositiveNumber(val: string): boolean {
  const n = Number(val)
  return val.trim() !== '' && Number.isFinite(n) && n > 0
}

function isNonNegNumber(val: string): boolean {
  const n = Number(val)
  return val.trim() !== '' && Number.isFinite(n) && n >= 0
}

export function validateSchedule(date: string, time: string): ScheduleErrors {
  const errors: ScheduleErrors = {}

  if (!date.trim()) {
    errors.date = 'Date is required'
  } else {
    // Compared as Philippine calendar days — plain YYYY-MM-DD strings, which
    // sort correctly — exactly as the API does. Doing this in browser-local time
    // meant a device in another zone disagreed with the server about which day
    // "today" is. Every weekday is open for transit, Sundays included; today is
    // bookable only until 12:00 noon, Monday to Saturday.
    const selected = date.slice(0, 10)
    const serverNow = nowDate()

    const today    = phDay(serverNow)
    const earliest = phEarliestBookableDay(serverNow)
    const latest   = phDayPlusMonth(serverNow)

    if (selected === today && earliest !== today) {
      errors.date = 'Same-day bookings close at 12:00 noon, Monday to Saturday. Please pick a later date.'
    } else if (selected < earliest) {
      errors.date = `Booking date cannot be in the past (earliest: ${earliest})`
    } else if (selected > latest) {
      errors.date = `Bookings can be made up to 1 month ahead (latest: ${latest})`
    } else if (selected === today && time.trim() && time.slice(0, 5) <= phTimeHHMM(serverNow)) {
      errors.time = 'For a same-day booking, the call time must be later than now'
    } else if (selected === today && time.trim() && time.slice(0, 5) > SAME_DAY_LATEST_CALL_TIME) {
      errors.time = 'For a same-day booking, the call time can be no later than 12:00 PM'
    }
  }

  if (!time.trim()) errors.time = 'Time is required'
  return errors
}

export interface LatLng {
  lat: number | null
  lng: number | null
}

export interface RouteCoords {
  pickup:   LatLng
  dropoffs: LatLng[]
}

// Two pins this close are the same place picked twice: a booking cannot drop
// off where it picks up. Kept in step with SAME_LOCATION_METERS in the
// backend's booking schema, which refuses the same thing.
export const SAME_LOCATION_METERS = 20
// Closer than this is allowed but unusual for a truck delivery, so the client
// is asked to confirm the pins before going on.
export const NEAR_DROPOFF_METERS = 1000

const normalizeAddress = (a: string) => a.trim().toLowerCase().replace(/\s+/g, ' ')

/** Straight-line distance in metres, or null when either pin is missing. */
export function distanceMeters(a: LatLng, b: LatLng): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

function isSameAsPickup(pickup: string, dropoff: string, coords: RouteCoords | undefined, i: number): boolean {
  if (normalizeAddress(pickup) === normalizeAddress(dropoff)) return true
  const meters = coords ? distanceMeters(coords.pickup, coords.dropoffs[i] ?? { lat: null, lng: null }) : null
  return meters != null && meters < SAME_LOCATION_METERS
}

export function validateRoute(pickup: string, dropoffs: string[], coords?: RouteCoords): RouteErrors {
  const errors: RouteErrors = { dropoffs: {} }
  if (!pickup.trim()) errors.pickup = 'Pickup location is required'
  dropoffs.forEach((d, i) => {
    if (!d.trim()) errors.dropoffs[i] = `Drop-off ${i + 1} location is required`
    else if (pickup.trim() && isSameAsPickup(pickup, d, coords, i)) {
      errors.dropoffs[i] = `Drop-off ${i + 1} cannot be the same as the pickup location`
    }
  })
  return errors
}

/** Drop-offs that are not the pickup but are suspiciously close to it. */
export function dropoffsNearPickup(coords: RouteCoords): { index: number; meters: number }[] {
  return coords.dropoffs.flatMap((d, index) => {
    const meters = distanceMeters(coords.pickup, d)
    return meters != null && meters >= SAME_LOCATION_METERS && meters < NEAR_DROPOFF_METERS
      ? [{ index, meters }]
      : []
  })
}

export function validateGroup(group: ItemGroup, mode: CargoMode): GroupErrors {
  const errors: GroupErrors = {}

  if (!group.commodity.trim())    errors.commodity    = 'Commodity is required'
  if (!group.product.trim())      errors.product      = 'Product is required'
  if (!group.shc.trim())          errors.shc          = 'Special Handling Code is required'

  if (mode === 'loose') {
    if (!isPositiveNumber(group.pieces))      errors.pieces      = 'Enter a valid piece count'
    if (!isPositiveNumber(group.looseLength)) errors.looseLength = 'Required'
    if (!isPositiveNumber(group.looseWidth))  errors.looseWidth  = 'Required'
    if (!isPositiveNumber(group.looseHeight)) errors.looseHeight = 'Required'
    if (!isPositiveNumber(group.weight))      errors.weight      = 'Enter a valid weight'
  } else {
    if (!isPositiveNumber(group.numPallets))         errors.numPallets         = 'Enter number of pallets'
    if (!isPositiveNumber(group.palletLength))       errors.palletLength       = 'Required'
    if (!isPositiveNumber(group.palletWidth))        errors.palletWidth        = 'Required'
    if (!isPositiveNumber(group.palletHeight))       errors.palletHeight       = 'Required'
    if (!isNonNegNumber(group.grossWeightPerPallet)) errors.grossWeightPerPallet = 'Required'
    if (!isNonNegNumber(group.netWeightPerPallet))   errors.netWeightPerPallet   = 'Required'

    const gross = Number(group.grossWeightPerPallet)
    const net   = Number(group.netWeightPerPallet)
    if (
      !errors.grossWeightPerPallet &&
      !errors.netWeightPerPallet   &&
      net > gross
    ) {
      errors.netWeightPerPallet = 'Net weight cannot exceed gross weight'
    }
  }

  return errors
}

export function validateSections(
  sections: DropoffSection[],
  mode:     CargoMode,
): SectionErrors[] {
  return sections.map((section) => {
    const groupErrors: Record<string, GroupErrors> = {}
    section.groups.forEach((g) => {
      const errs = validateGroup(g, mode)
      if (Object.keys(errs).length > 0) groupErrors[g.id] = errs
    })
    return { dropoffIndex: section.dropoffIndex, groups: groupErrors }
  })
}

export function validateBooking(
  date:         string,
  time:         string,
  pickup:       string,
  dropoffs:     string[],
  sections:     DropoffSection[],
  mode:         CargoMode,
  fileCount:    number,
  coords?:      RouteCoords,
): Omit<BookingErrors, 'touched'> {
  const errors: Omit<BookingErrors, 'touched'> = {
    schedule: validateSchedule(date, time),
    route:    validateRoute(pickup, dropoffs, coords),
    sections: validateSections(sections, mode),
  }

  if (fileCount === 0) {
    errors.documents = 'At least one transaction document is required'
  }

  return errors
}

export function hasScheduleErrors(e: ScheduleErrors): boolean {
  return Object.keys(e).length > 0
}

export function hasRouteErrors(e: RouteErrors): boolean {
  return !!e.pickup || Object.keys(e.dropoffs).length > 0
}

export function hasSectionErrors(sections: SectionErrors[]): boolean {
  return sections.some((s) => Object.keys(s.groups).length > 0)
}

export function hasAnyErrors(errors: Omit<BookingErrors, 'touched'>): boolean {
  return (
    hasScheduleErrors(errors.schedule) ||
    hasRouteErrors(errors.route)       ||
    hasSectionErrors(errors.sections)  ||
    !!errors.documents
  )
}

export function getGroupErrors(
  sectionErrors: SectionErrors[],
  dropoffIndex:  number,
  groupId:       string,
): GroupErrors {
  return sectionErrors.find((s) => s.dropoffIndex === dropoffIndex)?.groups[groupId] ?? {}
}