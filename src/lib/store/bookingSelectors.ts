import type { BookingState, DropoffSection, ItemGroup } from './booking.store'
import { calcCargoSummary } from '@/lib/cargo/summary'

export const selectSections = (s: BookingState): DropoffSection[] => s.sections

// Same answer for the same sections: a store selector must not hand back a new
// array/object on every render, or the component re-renders without end.
let lastGroupsFor: DropoffSection[] | null = null
let lastGroups: ItemGroup[] = []
export const selectAllGroups = (s: BookingState): ItemGroup[] => {
  if (s.sections !== lastGroupsFor) {
    lastGroupsFor = s.sections
    lastGroups    = s.sections.flatMap((sec) => sec.groups)
  }
  return lastGroups
}

/**
 * The cargo figures shown on screen.
 *
 * The calculation itself lives in `lib/cargo/summary` and is shared with the
 * review step, which used to keep its own divergent copy for the values it
 * actually submitted.
 */
let lastSummaryFor: { sections: DropoffSection[]; mode: BookingState['mode'] } | null = null
let lastSummary: ReturnType<typeof calcCargoSummary> | null = null
export const selectCargoSummary = (s: BookingState): ReturnType<typeof calcCargoSummary> => {
  if (!lastSummary || !lastSummaryFor || lastSummaryFor.sections !== s.sections || lastSummaryFor.mode !== s.mode) {
    lastSummaryFor = { sections: s.sections, mode: s.mode }
    lastSummary    = calcCargoSummary(s.sections, s.mode)
  }
  return lastSummary
}
