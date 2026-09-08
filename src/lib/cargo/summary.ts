import type { CargoMode, DropoffSection, ItemGroup } from '@/lib/store/slice/booking.slice'

/**
 * The one cargo summary calculation.
 *
 * There used to be three, and they disagreed with each other. The Redux selector
 * fed the figures the client saw on screen and the truck overload check; a
 * private copy in the review step produced the `required_*` fields actually sent
 * to the API; a third pass built the per-line cargo rows. Between them:
 *
 *  - the review step's copy never computed volume for PALLETIZED cargo at all,
 *    so a palletized booking was submitted with no volume requirement even
 *    though the client had just picked a truck against a volume figure;
 *  - neither summary converted pounds to kilograms for pallet weights, though
 *    the unit toggle is right there in the form and the per-line rows did
 *    convert — so a booking could carry a header weight 2.2x its own line items;
 *  - loose cargo was dropped from the totals ENTIRELY if any single dimension
 *    was blank, taking its weight with it.
 *
 * Everything now derives from here. `buildCargoItems` still writes the per-line
 * rows, but off the same helpers, so a line and the header cannot disagree.
 */

const LBS_TO_KG = 0.453592

const toKg = (value: number, unit: 'kg' | 'lbs'): number =>
  unit === 'lbs' ? value * LBS_TO_KG : value

/** A finite number strictly greater than zero, or null. */
function positive(raw: string | number | undefined): number | null {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A finite number of zero or more, or null. Net weight may legitimately be 0. */
function nonNegative(raw: string | number | undefined): number | null {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** cm³ -> m³. */
const toCbm = (lengthCm: number, widthCm: number, heightCm: number): number =>
  (lengthCm * widthCm * heightCm) / 1_000_000

/** One group's box, for fitting items onto a truck bed. */
export interface CargoFootprint {
  lengthCm:  number
  widthCm:   number
  heightCm:  number
  /** Pallets, or pieces for loose cargo. */
  count:     number
  stackable: boolean
  /**
   * Whether the item may be turned onto another face.
   *
   * A tiltable box can present any of its three dimensions as the vertical one,
   * which often decides whether it fits under the roof at all. A non-tiltable
   * one — and every loaded pallet — must keep the height it was measured with
   * pointing up. The form has always asked this; nothing used to read it.
   */
  tiltable:  boolean
}

export interface CargoSummary {
  /** Pallets in palletized mode, pieces in loose mode. */
  totalPieces:     number
  grossWeightKg:   number
  /** Palletized only; loose cargo has no separate net figure. */
  netWeightKg:     number
  volumeCbm:       number
  /** kg per CBM. Zero when there is no volume to divide by. */
  densityKgCbm:    number
  /**
   * The longest single edge of any one item, across every group.
   *
   * The old code took the maximum of the LENGTH field alone, so a six-metre pipe
   * entered as its width was invisible to the "will it fit on the bed" check.
   */
  maxDimensionCm:  number
  /** True when anything in the load must not be stacked. */
  hasNonStackable: boolean
  footprints:      CargoFootprint[]
}

export const EMPTY_CARGO_SUMMARY: CargoSummary = {
  totalPieces:     0,
  grossWeightKg:   0,
  netWeightKg:     0,
  volumeCbm:       0,
  densityKgCbm:    0,
  maxDimensionCm:  0,
  hasNonStackable: false,
  footprints:      [],
}

/** Gross kg, volume in CBM and footprint for one palletized group. */
export function palletizedGroup(g: ItemGroup) {
  const pallets = positive(g.numPallets)
  if (pallets === null) return null

  const grossPer = nonNegative(g.grossWeightPerPallet)
  const netPer   = nonNegative(g.netWeightPerPallet)
  const l        = positive(g.palletLength)
  const w        = positive(g.palletWidth)
  const h        = positive(g.palletHeight)

  const hasDims = l !== null && w !== null && h !== null

  return {
    count:         pallets,
    grossWeightKg: grossPer !== null ? pallets * toKg(grossPer, g.palletWeightUnit) : 0,
    netWeightKg:   netPer   !== null ? pallets * toKg(netPer,   g.palletWeightUnit) : 0,
    volumeCbm:     hasDims ? pallets * toCbm(l!, w!, h!) : 0,
    lengthCm:      l,
    widthCm:       w,
    heightCm:      h,
    // A pallet the client did not mark stackable must not be double-decked.
    stackable:     !!g.stackable,
    // A loaded pallet is never turned onto its side.
    tiltable:      false,
  }
}

/** Gross kg, volume in CBM and footprint for one loose group. */
export function looseGroup(g: ItemGroup) {
  const pieces = positive(g.pieces)
  if (pieces === null) return null

  const weight = positive(g.weight)
  const l      = positive(g.looseLength)
  const w      = positive(g.looseWidth)
  const h      = positive(g.looseHeight)

  const hasDims = l !== null && w !== null && h !== null

  // Weight and volume are independent: a group missing its dimensions still
  // contributes its weight, which the old all-or-nothing guard silently threw
  // away along with the group's pieces.
  const weightKg = weight !== null ? toKg(weight, g.weightUnit) : 0

  return {
    count:         pieces,
    grossWeightKg: g.perItem === 'Per Item' ? pieces * weightKg : weightKg,
    netWeightKg:   0,
    volumeCbm:     hasDims ? pieces * toCbm(l!, w!, h!) : 0,
    lengthCm:      l,
    widthCm:       w,
    heightCm:      h,
    stackable:     !g.nonStackable,
    tiltable:      !g.nonTiltable,
  }
}

export function calcCargoSummary(sections: DropoffSection[], mode: CargoMode): CargoSummary {
  let totalPieces     = 0
  let grossWeightKg   = 0
  let netWeightKg     = 0
  let volumeCbm       = 0
  let maxDimensionCm  = 0
  let hasNonStackable = false
  const footprints: CargoFootprint[] = []

  for (const section of sections) {
    for (const g of section.groups) {
      const r = mode === 'palletized' ? palletizedGroup(g) : looseGroup(g)
      if (!r) continue

      totalPieces   += r.count
      grossWeightKg += r.grossWeightKg
      netWeightKg   += r.netWeightKg
      volumeCbm     += r.volumeCbm

      maxDimensionCm = Math.max(maxDimensionCm, r.lengthCm ?? 0, r.widthCm ?? 0, r.heightCm ?? 0)
      if (!r.stackable) hasNonStackable = true

      // All three dimensions are needed to decide whether a box fits a body;
      // with any of them missing we simply have nothing to place, and the fit
      // check skips this group rather than guessing.
      if (r.lengthCm !== null && r.widthCm !== null && r.heightCm !== null) {
        footprints.push({
          lengthCm:  r.lengthCm,
          widthCm:   r.widthCm,
          heightCm:  r.heightCm,
          count:     r.count,
          stackable: r.stackable,
          tiltable:  r.tiltable,
        })
      }
    }
  }

  return {
    totalPieces,
    grossWeightKg,
    netWeightKg,
    volumeCbm,
    densityKgCbm: volumeCbm > 0 ? grossWeightKg / volumeCbm : 0,
    maxDimensionCm,
    hasNonStackable,
    footprints,
  }
}
