import type { BlowbagetsKey } from '@/lib/services/client/booking.service'

/**
 * The fleet manager's BLOWBAGETS vehicle inspection.
 *
 * The inspection belongs to the VEHICLE, not to a booking: the fleet manager
 * records it in Vehicle Management, and only a vehicle whose most recent
 * inspection passed can be selected by operations for a booking. Every item must
 * pass for the inspection as a whole to pass.
 *
 * `key` is the stable identifier — note that Battery and Brakes share the letter
 * B, so the letter alone can't identify an item.
 */
export const BLOWBAGETS_ITEMS: {
  key:    BlowbagetsKey
  letter: string
  label:  string
  hint:   string
}[] = [
  { key: 'battery', letter: 'B', label: 'Battery', hint: 'Terminals clean, charge holding' },
  { key: 'lights',  letter: 'L', label: 'Lights',  hint: 'Head, tail, signal & hazard working' },
  { key: 'oil',     letter: 'O', label: 'Oil',     hint: 'Engine oil at proper level' },
  { key: 'water',   letter: 'W', label: 'Water',   hint: 'Radiator coolant topped up' },
  { key: 'brakes',  letter: 'B', label: 'Brakes',  hint: 'Pedal firm, no leaks' },
  { key: 'air',     letter: 'A', label: 'Air',     hint: 'Tyre pressure within range' },
  { key: 'gas',     letter: 'G', label: 'Gas',     hint: 'Fuel sufficient for the route' },
  { key: 'engine',  letter: 'E', label: 'Engine',  hint: 'Starts clean, no warning lights' },
  { key: 'tires',   letter: 'T', label: 'Tires',   hint: 'Tread & sidewalls sound, spare present' },
  { key: 'self',    letter: 'S', label: 'Self',    hint: 'Driver fit, rested & licensed' },
]

export const BLOWBAGETS_COUNT = BLOWBAGETS_ITEMS.length

/** Turn a partial tick-state into the complete payload the API expects. */
export function toBlowbagetsItems(checked: Record<string, boolean>) {
  return Object.fromEntries(
    BLOWBAGETS_ITEMS.map((it) => [it.key, !!checked[it.key]]),
  ) as Record<BlowbagetsKey, boolean>
}
