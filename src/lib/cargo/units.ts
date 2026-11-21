import type { DimensionUnit } from '@/lib/store/booking.store'

/**
 * Cargo sizes: stored and calculated in cm, shown in the unit the client typed.
 *
 * A cargo line keeps one size (length_cm / width_cm / height_cm) plus
 * `dimension_unit`, the unit the client wrote it in. Every calculation reads the
 * cm figures; every screen turns them back into the typed unit with `fromCm`, so
 * a carton entered as 18 × 12 × 10 in reads 18 × 12 × 10 IN everywhere. NULL
 * (lines from before 2026-11-21, older web builds) means cm.
 *
 * toCm keeps 6 decimals and fromCm rounds to 4, so anything typed with up to
 * 4 decimals comes back exactly as typed (1 in = 2.54 cm exactly).
 */

export const CM_PER_UNIT: Record<DimensionUnit, number> = { cm: 1, m: 100, in: 2.54 }

export const DIMENSION_UNIT_NAME: Record<DimensionUnit, string> = { cm: 'centimetres', m: 'metres', in: 'inches' }

/** The stored unit, read safely: anything unknown or missing is cm. */
export function dimensionUnit(raw: unknown): DimensionUnit {
  return raw === 'm' || raw === 'in' ? raw : 'cm'
}

/** A size typed in `unit` -> cm. */
export function toCm(value: number, unit: DimensionUnit | null | undefined): number {
  return Math.round(value * CM_PER_UNIT[dimensionUnit(unit)] * 1e6) / 1e6
}

/** A stored cm size -> the unit the client typed it in. */
export function fromCm(cm: number, unit: DimensionUnit | null | undefined): number {
  return Math.round((cm / CM_PER_UNIT[dimensionUnit(unit)]) * 1e4) / 1e4
}

/**
 * "18 × 12 × 10 IN" from a stored line, or null when any side is missing.
 * `upper` matches screens that write units in capitals (KG, CBM).
 */
export function formatSize(
  l: unknown, w: unknown, h: unknown,
  unit: unknown,
  { upper = false }: { upper?: boolean } = {},
): string | null {
  const sides = [l, w, h].map((v) => (v == null || v === '' ? NaN : Number(v)))
  if (sides.some((n) => !Number.isFinite(n))) return null
  const u = dimensionUnit(unit)
  const [a, b, c] = sides.map((n) => fromCm(n, u))
  return `${a} × ${b} × ${c} ${upper ? u.toUpperCase() : u}`
}
