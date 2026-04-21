import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from './index'
import type { DropoffSection, CargoMode, ItemGroup } from './slice/booking.slice'

export const selectSections = (s: RootState): DropoffSection[] => s.booking.sections

export const selectAllGroups = createSelector(
  selectSections,
  (sections): ItemGroup[] => sections.flatMap((s) => s.groups),
)

function calcSummary(sections: DropoffSection[], mode: CargoMode) {
  let totalPieces = 0, grossWeight = 0, netWeight = 0, volume = 0

  for (const section of sections) {
    for (const g of section.groups) {
      if (mode === 'palletized') {
        const pallets = Number(g.numPallets)           || 0
        const gross   = Number(g.grossWeightPerPallet) || 0
        const net     = Number(g.netWeightPerPallet)   || 0
        const length  = Number(g.palletLength)         || 0
        const width   = Number(g.palletWidth)          || 0
        const height  = Number(g.palletHeight)         || 0
        if (pallets <= 0) continue
        totalPieces += pallets
        grossWeight += pallets * gross
        netWeight   += pallets * net
        // Only accumulate volume when all three dimensions are present
        if (length > 0 && width > 0 && height > 0) {
          volume += pallets * (length * width * height) / 1_000_000
        }
      } else {
        const pieces = Number(g.pieces)
        const length = Number(g.looseLength)
        const width  = Number(g.looseWidth)
        const height = Number(g.looseHeight)
        const weight = Number(g.weight)
        if (!Number.isFinite(pieces) || pieces <= 0) continue
        if (
          !Number.isFinite(length) || length <= 0 ||
          !Number.isFinite(width)  || width  <= 0 ||
          !Number.isFinite(height) || height <= 0
        ) continue
        if (!Number.isFinite(weight) || weight <= 0) continue
        totalPieces += pieces
        const weightKG = g.weightUnit === 'lbs' ? weight * 0.453592 : weight
        grossWeight   += g.perItem === 'Per Item' ? pieces * weightKG : weightKG
        volume        += pieces * (length * width * height) / 1_000_000
      }
    }
  }

  const density = volume > 0 ? grossWeight / volume : 0
  return { totalPieces, grossWeight, netWeight, volume, density }
}

export const selectCargoSummary = createSelector(
  selectSections,
  (s: RootState) => s.booking.mode,
  (sections, mode) => calcSummary(sections, mode),
)