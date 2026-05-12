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
  schedule:      ScheduleErrors
  route:         RouteErrors
  sections:      SectionErrors[]
  paymentTerms?: string
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
    const [year, month, day] = date.split('-').map(Number)
    const selectedDate = new Date(year, month - 1, day)

    const serverNow = nowDate()

    const oneWeekFromNow = new Date(serverNow)
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7)
    const earliestDate = new Date(
      oneWeekFromNow.getFullYear(),
      oneWeekFromNow.getMonth(),
      oneWeekFromNow.getDate(),
    )

    const maxDate = new Date(serverNow)
    maxDate.setFullYear(maxDate.getFullYear() + 1)
    const maxDateOnly = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())

    if (selectedDate < earliestDate) {
      const pad = (n: number) => String(n).padStart(2, '0')
      const earliest = `${earliestDate.getFullYear()}-${pad(earliestDate.getMonth() + 1)}-${pad(earliestDate.getDate())}`
      errors.date = `Booking must be at least 1 week in advance (earliest: ${earliest})`
    } else if (selectedDate > maxDateOnly) {
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
  if (!group.shc.trim())          errors.shc          = 'SHC is required'
  if (!group.additionalShc.trim()) errors.additionalShc = 'Additional SHC is required'

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
  paymentTerms: string,
  fileCount:    number,
): Omit<BookingErrors, 'touched'> {
  const errors: Omit<BookingErrors, 'touched'> = {
    schedule: validateSchedule(date, time),
    route:    validateRoute(pickup, dropoffs),
    sections: validateSections(sections, mode),
  }

  if (!paymentTerms) {
    errors.paymentTerms = 'Payment terms are required'
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
    !!errors.paymentTerms              ||
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