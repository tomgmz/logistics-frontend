import type { CargoSummary, CargoFootprint } from './summary'

/**
 * Whether a load actually fits on a truck.
 *
 * The old check compared raw cargo volume against `max_volume_cbm` and called
 * anything under it a fit. Two things were wrong with that in practice:
 *
 *  1. `max_volume_cbm` is the bare geometric interior of the body — the Hino
 *     Wing Van's 48.96 CBM is exactly 8.5 x 2.4 x 2.4 m. Cargo does not
 *     tessellate, and nobody loads a van to 100% of its cube. A load calculated
 *     at 27 CBM will not go into a 28 CBM body.
 *  2. For palletized freight the binding constraint is usually FLOOR SPACE, not
 *     cube. Twelve non-stackable pallets at 0.5 CBM each total 6 CBM and "fit"
 *     a 28 CBM van comfortably — but they need twelve floor positions, and an
 *     Isuzu NQR bed holds about eight.
 *
 * Both are now modelled. The result is still advisory: it flags the problem
 * loudly and lets the client proceed, because a wrong refusal here blocks a
 * real booking and there is a human approval stage immediately downstream.
 */

/**
 * Share of a truck body's geometric volume that can actually be filled.
 *
 * 0.80 is the conservative end of the 65-85% that road freight plans to for
 * palletized and regular cased goods. Tune it here; nothing else hard-codes it.
 */
export const STOWAGE_FACTOR = 0.80

/** Utilisation above this reads as a comfortable match rather than a tight one. */
const COMFORTABLE_UTILISATION = 0.8

export interface VehicleCapacity {
  maxWeightKG:       number
  maxVolumeCBM:      number
  /** Longest item the body will take, in cm. */
  maxLengthCM?:      number | null
  /** Cargo bed dimensions in millimetres. Absent on older truck models. */
  bedLengthMM?:      number | null
  bedWidthMM?:       number | null
  bedHeightMM?:      number | null
  stackableFriendly: boolean
}

/**
 * The ways an item may be set down, as [floor dimension A, floor dimension B,
 * the dimension left pointing up].
 *
 * A tiltable box can rest on any of its three faces. One that is not — and every
 * loaded pallet — keeps the height it was measured with vertical. Both floor
 * rotations are handled by the caller, which tries each pair either way round.
 */
function orientations(f: CargoFootprint): Array<[number, number, number]> {
  const { lengthCm: l, widthCm: w, heightCm: h } = f
  if (!f.tiltable) return [[l, w, h]]
  return [[l, w, h], [l, h, w], [w, h, l]]
}

/**
 * How many of these items fit on the bed floor, in the best orientation.
 *
 * Returns 0 when a SINGLE item will not go in at all — which is a different
 * answer from "not many fit", and the caller must say so differently.
 *
 * The first version of this ignored height entirely: it laid length x width on
 * the floor and never asked whether the remaining dimension cleared the roof. A
 * 100 x 200 x 400 cm piece was reported as fitting a 280 x 160 x 140 cm van
 * "1 at a time", when in truth no orientation of it fits inside that body at
 * all. Height is now part of the test, and a bed whose height we do not know is
 * treated as unconstrained rather than assumed generous in the other direction.
 */
export function floorPositions(
  bedLengthMM: number,
  bedWidthMM:  number,
  footprint:   CargoFootprint,
  bedHeightMM?: number | null,
): number {
  const bedL = bedLengthMM / 10 // mm -> cm
  const bedW = bedWidthMM  / 10
  const bedH = bedHeightMM ? bedHeightMM / 10 : Infinity

  const fit = (a: number, b: number) =>
    Math.floor(bedL / a) * Math.floor(bedW / b)

  let best = 0
  for (const [a, b, up] of orientations(footprint)) {
    if (up > bedH) continue          // will not clear the roof this way up
    best = Math.max(best, fit(a, b), fit(b, a))
  }

  return Number.isFinite(best) && best > 0 ? best : 0
}

export interface FitAssessment {
  /** Body volume we are prepared to plan against, after the stowage factor. */
  usableVolumeCBM: number
  overWeight:      boolean
  overVolume:      boolean
  /** More items than the bed has room for, though each one does fit. */
  overFloorSpace:  boolean
  /**
   * A SINGLE item will not go into this body in any orientation.
   *
   * Wholly different from being over capacity: no number of trips solves it, so
   * the trip count is meaningless and is suppressed.
   */
  doesNotFit:      boolean
  /** The longest item is longer than the body will take. */
  overLength:      boolean
  /** Floor positions the bed offers, and how many the load needs. */
  positionsAvailable: number | null
  positionsNeeded:    number | null
  /** True if the load exceeds the vehicle on any axis. */
  isOverloaded:    boolean
  /** A sensible pick: fits, and not squeezed in. */
  isSuggested:     boolean
  tripsNeeded:     number
  /** Non-stackable cargo on a truck that is not stackable-friendly. */
  stackingMismatch: boolean
}

export function assessFit(vehicle: VehicleCapacity, cargo: CargoSummary): FitAssessment {
  const usableVolumeCBM = vehicle.maxVolumeCBM > 0
    ? vehicle.maxVolumeCBM * STOWAGE_FACTOR
    : 0

  const overWeight = vehicle.maxWeightKG > 0 && cargo.grossWeightKg > vehicle.maxWeightKG
  const overVolume = usableVolumeCBM  > 0 && cargo.volumeCbm     > usableVolumeCBM

  // Floor space, when we know the bed and the cargo has footprints to place.
  let positionsAvailable: number | null = null
  let positionsNeeded:    number | null = null

  // Does one single item simply not go in? Checked first, because it changes
  // what every other number means.
  let doesNotFit = false

  if (vehicle.bedLengthMM && vehicle.bedWidthMM && cargo.footprints.length > 0) {
    positionsNeeded = 0
    // Every group is measured against the same bed; the smallest per-group
    // capacity is the honest bound, since a mixed load cannot do better than its
    // most awkward footprint.
    let worstCase = Infinity

    for (const f of cargo.footprints) {
      const perLayer = floorPositions(
        vehicle.bedLengthMM, vehicle.bedWidthMM, f, vehicle.bedHeightMM,
      )
      if (perLayer === 0) {
        // Not "too many" — this item does not fit this body, full stop.
        doesNotFit = true
        worstCase = 0
        positionsNeeded += f.count
        continue
      }
      worstCase = Math.min(worstCase, perLayer)
      // Stackable pallets double-deck, but only on a truck built for it.
      const layers = f.stackable && vehicle.stackableFriendly ? 2 : 1
      positionsNeeded += Math.ceil(f.count / layers)
    }

    positionsAvailable = Number.isFinite(worstCase) ? worstCase : null
  }

  // The longest edge of anything in the load, against what the body accepts.
  // This was computed on the cargo side and then never consulted here, so a
  // four-metre item on a two-and-a-half-metre body was reported as a shortage of
  // floor positions rather than as an item that does not fit.
  const overLength =
    !!vehicle.maxLengthCM &&
    cargo.maxDimensionCm > 0 &&
    cargo.maxDimensionCm > vehicle.maxLengthCM

  if (overLength) doesNotFit = true

  const overFloorSpace =
    !doesNotFit &&
    positionsAvailable !== null &&
    positionsNeeded    !== null &&
    positionsNeeded > positionsAvailable

  const isOverloaded = overWeight || overVolume || overFloorSpace || doesNotFit

  let tripsNeeded = 1
  if (vehicle.maxWeightKG > 0 && cargo.grossWeightKg > 0)
    tripsNeeded = Math.max(tripsNeeded, Math.ceil(cargo.grossWeightKg / vehicle.maxWeightKG))
  if (usableVolumeCBM > 0 && cargo.volumeCbm > 0)
    tripsNeeded = Math.max(tripsNeeded, Math.ceil(cargo.volumeCbm / usableVolumeCBM))
  if (positionsAvailable && positionsNeeded)
    tripsNeeded = Math.max(tripsNeeded, Math.ceil(positionsNeeded / positionsAvailable))

  const wUtil = vehicle.maxWeightKG > 0 ? cargo.grossWeightKg / vehicle.maxWeightKG : 0
  const vUtil = usableVolumeCBM     > 0 ? cargo.volumeCbm     / usableVolumeCBM     : 0

  return {
    usableVolumeCBM,
    overWeight,
    overVolume,
    overFloorSpace,
    doesNotFit,
    overLength,
    positionsAvailable,
    positionsNeeded,
    isOverloaded,
    isSuggested:
      !isOverloaded &&
      (wUtil > 0 || vUtil > 0) &&
      wUtil <= COMFORTABLE_UTILISATION &&
      vUtil <= COMFORTABLE_UTILISATION,
    // No number of trips loads an item that does not fit through the door.
    tripsNeeded: doesNotFit ? 0 : tripsNeeded,
    stackingMismatch: cargo.hasNonStackable && !vehicle.stackableFriendly,
  }
}
