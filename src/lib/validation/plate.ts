/**
 * Philippine plate rules, shared by every place a plate is typed: vehicle
 * creation and the vendor vehicle on an assignment. Mirrors PLATE_REGEX in the
 * backend's truck.schema.ts.
 *
 *   ABC 1234   current private / commercial
 *   ABC 123    older series
 *   AB 123     older two-letter series
 */
export const PLATE_REGEX = /^(?:[A-ZÑ]{3} \d{4}|[A-ZÑ]{2,3} \d{2,3})$/

export const PLATE_ERROR = 'Invalid plate format (e.g. ABC 1234). Only letters, and numbers allowed.'

/** Uppercases, drops anything but letters and digits, and puts the space after the letters. */
export function formatPlateNumber(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-ZÑ0-9]/g, '')
  const m = /^([A-ZÑ]{2,3})(\d+)/.exec(cleaned)
  if (m) return `${m[1]} ${m[2].slice(0, 4)}`
  return cleaned.slice(0, 7)
}

/** null when the plate is valid, otherwise the message to show. */
export function plateError(plate: string): string | null {
  const p = plate.trim()
  if (!p) return 'Plate number is required.'
  return PLATE_REGEX.test(p) ? null : PLATE_ERROR
}
