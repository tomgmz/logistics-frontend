/**
 * The fixed palette. Every badge, status and accent in the app is one of
 * these six colours; globals.css points Tailwind's colour families at the
 * same values, and the mobile app mirrors them in theme/palette.ts.
 */
export const PALETTE = {
  cyan:   '#4df9ed',
  green:  '#3af626',
  yellow: '#ffea00',
  orange: '#ff7a30',
  red:    '#f62626',
  purple: '#8a38f5',
} as const

/** Neutral for an unknown or not-yet-started state. Not one of the six on purpose. */
export const NEUTRAL = '#9f9c9c'

/** Assigned's violet in the Figma status legend (1122:820). Booking status only. */
export const ASSIGNED_VIOLET = '#a024ff'

/**
 * One colour per booking status, the same on every screen (and on mobile),
 * from the Figma status legend (1122:820, 2026-11-07): pending yellow,
 * approved orange, crew assigned violet, on the road cyan, delivered (waiting
 * on the client) white, completed green, cancelled red.
 */
export const BOOKING_STATUS_COLOR: Record<string, string> = {
  pending:    PALETTE.yellow,
  booked:     PALETTE.yellow,
  approved:   PALETTE.orange,
  assigned:   ASSIGNED_VIOLET,
  in_transit: PALETTE.cyan,
  arrived:    PALETTE.cyan,
  delivered:  '#ffffff',
  completed:  PALETTE.green,
  cancelled:  PALETTE.red,
}

export function bookingStatusColor(status: string | null | undefined): string {
  const key = String(status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return BOOKING_STATUS_COLOR[key] ?? NEUTRAL
}
