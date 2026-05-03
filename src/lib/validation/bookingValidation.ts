import type { CargoMode, ItemGroup, DropoffSection } from '@/lib/store/slice/booking.slice'
import { nowDate } from '@/app/utils/serverTime'

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
  additionalShc?: string
}

export interface SectionErrors {
  dropoffIndex: number
  groups: Record<string, GroupErrors>
}

export interface BookingErrors {
  schedule: ScheduleErrors
  route: RouteErrors
  sections: SectionErrors[]
  touched: boolean
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
  } else if (!time.trim()) {
    errors.date = 'Date cannot be validated without a time'
  } else {
    const [year, month, day] = date.split('-').map(Number)
    const [hours, minutes]   = time.split(':').map(Number)
    const selectedDateTime   = new Date(year, month - 1, day, hours, minutes, 0, 0)

    const serverNow      = nowDate()
    const ONE_WEEK_MS    = 7 * 24 * 60 * 60 * 1000
    const oneWeekFromNow = new Date(serverNow.getTime() + ONE_WEEK_MS)
    const maxDate        = new Date(serverNow)
    maxDate.setFullYear(maxDate.getFullYear() + 1)

    if (selectedDateTime.getTime() < oneWeekFromNow.getTime()) {
      const pad = (n: number) => String(n).padStart(2, '0')
      const earliest =
        `${oneWeekFromNow.getFullYear()}-${pad(oneWeekFromNow.getMonth() + 1)}-${pad(oneWeekFromNow.getDate())} ` +
        `${pad(oneWeekFromNow.getHours())}:${pad(oneWeekFromNow.getMinutes())}`
      errors.date = `Booking must be at least 1 week in advance (earliest: ${earliest})`
    } else if (selectedDateTime > maxDate) {
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

  if (!group.commodity.trim()) errors.commodity = 'Commodity is required'
  if (!group.product.trim()) errors.product = 'Product is required'
  if (!group.shc.trim()) errors.shc = 'SHC is required'
  if (!group.additionalShc.trim()) errors.additionalShc = 'Additional SHC is required'

  if (mode === 'loose') {
    if (!isPositiveNumber(group.pieces))      errors.pieces      = 'Enter a valid piece count'
    if (!isPositiveNumber(group.looseLength)) errors.looseLength = 'Required'
    if (!isPositiveNumber(group.looseWidth))  errors.looseWidth  = 'Required'
    if (!isPositiveNumber(group.looseHeight)) errors.looseHeight = 'Required'
    if (!isPositiveNumber(group.weight))      errors.weight      = 'Enter a valid weight'
  } else {
    if (!isPositiveNumber(group.numPallets))           errors.numPallets           = 'Enter number of pallets'
    if (!isPositiveNumber(group.palletLength))         errors.palletLength         = 'Required'
    if (!isPositiveNumber(group.palletWidth))          errors.palletWidth          = 'Required'
    if (!isPositiveNumber(group.palletHeight))         errors.palletHeight         = 'Required'
    if (!isNonNegNumber(group.grossWeightPerPallet))   errors.grossWeightPerPallet = 'Required'
    if (!isNonNegNumber(group.netWeightPerPallet))     errors.netWeightPerPallet   = 'Required'

    // net must not exceed gross
    const gross = Number(group.grossWeightPerPallet)
    const net   = Number(group.netWeightPerPallet)
    if (
      !errors.grossWeightPerPallet &&
      !errors.netWeightPerPallet &&
      net > gross
    ) {
      errors.netWeightPerPallet = 'Net weight cannot exceed gross weight'
    }
  }

  return errors
}

export function validateSections(
  sections: DropoffSection[],
  mode: CargoMode,
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
  date: string,
  time: string,
  pickup: string,
  dropoffs: string[],
  sections: DropoffSection[],
  mode: CargoMode,
): Omit<BookingErrors, 'touched'> {
  return {
    schedule: validateSchedule(date, time),
    route:    validateRoute(pickup, dropoffs),
    sections: validateSections(sections, mode),
  }
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
    hasRouteErrors(errors.route) ||
    hasSectionErrors(errors.sections)
  )
}

/** Pull group-level errors for a specific group id inside a section list */
export function getGroupErrors(
  sectionErrors: SectionErrors[],
  dropoffIndex: number,
  groupId: string,
): GroupErrors {
  return sectionErrors.find((s) => s.dropoffIndex === dropoffIndex)?.groups[groupId] ?? {}
}