import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from './index'
import type { DropoffSection, ItemGroup } from './slice/booking.slice'
import { calcCargoSummary } from '@/lib/cargo/summary'

export const selectSections = (s: RootState): DropoffSection[] => s.booking.sections

export const selectAllGroups = createSelector(
  selectSections,
  (sections): ItemGroup[] => sections.flatMap((s) => s.groups),
)

/**
 * The cargo figures shown on screen.
 *
 * The calculation itself lives in `lib/cargo/summary` and is shared with the
 * review step, which used to keep its own divergent copy for the values it
 * actually submitted.
 */
export const selectCargoSummary = createSelector(
  selectSections,
  (s: RootState) => s.booking.mode,
  (sections, mode) => calcCargoSummary(sections, mode),
)
