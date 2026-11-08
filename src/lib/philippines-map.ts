/**
 * Every map in the web app shows the Philippines only.
 *
 * `strictBounds` keeps the whole visible area inside the box, so the map can't
 * be panned away and zooming out stops once the country fills the view. The
 * box runs from Tawi-Tawi (south) to Batanes (north) and Balabac/Palawan (west)
 * to Davao Oriental (east), with a small margin. The Kalayaan islands are left
 * out on purpose (no deliveries there, and including them adds a large stretch
 * of open sea to the west).
 */
export const PH_BOUNDS = {
  north: 21.4,
  south: 4.4,
  west:  116.0,
  east:  127.0,
} as const

export const PH_RESTRICTION: google.maps.MapRestriction = {
  latLngBounds: PH_BOUNDS,
  strictBounds: true,
}

/** The most a map may zoom out; strictBounds usually stops it sooner. */
export const PH_MIN_ZOOM = 5
