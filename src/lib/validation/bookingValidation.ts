import type { CargoMode, ItemGroup, DropoffSection } from '@/lib/store/slice/booking.slice'
import { nowDate } from '@/app/utils/serverTime'
import { phDayPlus, phDayPlusYear, dayOfWeek } from '@/lib/ph-date'

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

/** Sunday — the fleet's rest day. The API rejects a Sunday `schedule_date`. */
const REST_WEEKDAY = 0

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
    // "tomorrow" is, and about which dates are Sundays.
    const selected = date.slice(0, 10)
    const serverNow = nowDate()

    const earliest = phDayPlus(serverNow, 1)
    const latest   = phDayPlusYear(serverNow)

    // The picker cannot offer a Sunday, but a date restored from a stale draft
    // still can be — catch it here rather than losing the wizard to a 400.
    if (dayOfWeek(selected) === REST_WEEKDAY) {
      errors.date = 'Deliveries are not scheduled on Sundays — please pick another day'
    } else if (selected < earliest) {
      errors.date = `Booking must be at least a day ahead (earliest: ${earliest})`
    } else if (selected > latest) {
      errors.date = 'Date cannot be more than 1 year in the future'
    }
  }

  if (!time.trim()) errors.time = 'Time is required'
  return errors
}

export function validateRoute(pickup: string, dropoffs: string[]): RouteErrors {
  const errors: RouteErrors = { dropoffs: {} }
  if (!pickup.trim()) errors.pickup = 'Pickup location is required'
  dropoffs.forEach((d, i) => {
    if (!d.trim()) errors.dropoffs[i] = `Drop-off ${i + 1} location is required`
  })
  return errors
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
): Omit<BookingErrors, 'touched'> {
  const errors: Omit<BookingErrors, 'touched'> = {
    schedule: validateSchedule(date, time),
    route:    validateRoute(pickup, dropoffs),
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