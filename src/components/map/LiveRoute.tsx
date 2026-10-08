'use client'

import { useEffect, useRef, useState } from 'react'
import { useMap, MapControl, ControlPosition } from '@vis.gl/react-google-maps'
import type { OptimizedStop } from '@/app/types/maps/routemap.types'
import type { DriverPosition } from '@/lib/hooks/useLiveDriverPosition'
import { decodePolyline } from './DirectionsRenderer'

/**
 * The road the truck is actually taking, rather than the one planned before it
 * left.
 *
 * The planned polyline is computed once, from the pickup, before departure. The
 * driver navigates with the Google Navigation SDK, which reroutes on its own —
 * a missed exit, a closed road, a faster way through traffic — and the web map
 * went on drawing the original line underneath a truck that had left it. While
 * a booking is in transit the map now asks Google for the route from the
 * truck's live position and heading to the stops it has not reached yet, and
 * asks again when the truck leaves that route, the same trigger the Nav SDK
 * itself reroutes on.
 *
 * The line is Google's HIGH_QUALITY polyline drawn as-is — no Roads snap of
 * our own, which drifted off the road.
 *
 * Cost: each fetch is one Routes API call (fast mode — no Roads snap, no
 * traffic intervals). It happens on the first fix, when the remaining stops
 * change, and on a detected reroute, never more often than MIN_REFETCH_MS. A
 * truck that stays on its route costs one call per stop it delivers, not one
 * per ping. Trimming the driven part off the line is done locally on every
 * frame and costs nothing.
 */

/** How far off the line a fix may sit before it counts as off-route. */
const OFF_ROUTE_M = 50
/** GPS accuracy widens that tolerance, but only up to this much. */
const MAX_ACCURACY_ALLOWANCE_M = 50
/** Off-route fixes in a row before refetching — one bad fix is not a reroute. */
const OFF_ROUTE_FIXES = 2
/** Floor between two fetches, whatever triggers them. */
const MIN_REFETCH_MS = 20_000
/** Below this speed the device's heading is noise, so it is not sent. */
const HEADING_MIN_SPEED_MPS = 2

type LatLng = google.maps.LatLngLiteral

/**
 * The stops the truck still has to reach, in delivery order.
 *
 * The page loads stops once and does not re-read them while it is open, so a
 * stop delivered after page load still says 'pending' here. The server's ETA
 * list does track that — confirming a drop-off invalidates it, and the next
 * recompute leaves the delivered stop out — so when there is one, it decides.
 */
export function remainingStops(stops: OptimizedStop[], etaIds: Set<string>): OptimizedStop[] {
  const pending = stops.filter((s) => s.status === 'pending')
  return etaIds.size > 0 ? pending.filter((s) => etaIds.has(s.destination_id)) : pending
}

/* ── Planar geometry, good enough at street scale ─────────────────────── */

const M_PER_DEG_LAT = 111_320

function toXY(p: LatLng, refLat: number) {
  return { x: p.lng * M_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180), y: p.lat * M_PER_DEG_LAT }
}

/** The point on `path` closest to `p`, the segment it lies on, and how far away it is. */
function nearestOnPath(path: LatLng[], p: LatLng): { index: number; point: LatLng; distanceM: number } | null {
  if (path.length === 0) return null
  if (path.length === 1) {
    const a = toXY(path[0], p.lat), q = toXY(p, p.lat)
    return { index: 0, point: path[0], distanceM: Math.hypot(a.x - q.x, a.y - q.y) }
  }

  const q = toXY(p, p.lat)
  let best = { index: 0, point: path[0], distanceM: Infinity }

  for (let i = 0; i < path.length - 1; i++) {
    const a  = toXY(path[i], p.lat)
    const b  = toXY(path[i + 1], p.lat)
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2))
    const d = Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y)
    if (d < best.distanceM) {
      best = {
        index:     i,
        point:     {
          lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t,
          lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t,
        },
        distanceM: d,
      }
    }
  }
  return best
}

/**
 * Fetches and keeps the live route. Call it ONCE per page: the delivery
 * tracking page mounts the map in up to three responsive layouts at once, and
 * fetching per map would multiply the Routes bill.
 *
 * Returns the full route path; `LiveRoutePolyline` trims and draws it.
 */
export function useLiveRoute({
  enabled,
  latest,
  stops,
}: {
  enabled: boolean
  /** The newest raw fix — never the eased marker position. */
  latest:  DriverPosition | null
  /** Remaining stops, in delivery order. */
  stops:   OptimizedStop[]
}): LatLng[] | null {
  const [path, setPath] = useState<{ key: string; points: LatLng[] } | null>(null)

  const pathRef      = useRef<LatLng[] | null>(null)
  const fetchedKey   = useRef<string | null>(null)
  const lastFetchAt  = useRef(0)
  const offRouteRun  = useRef(0)
  const inFlight     = useRef(false)
  const requestSeq   = useRef(0)

  const stopsKey = stops.map((s) => s.destination_id).join(',')

  useEffect(() => {
    if (!enabled || !latest || stops.length === 0) return

    const here = { lat: latest.latitude, lng: latest.longitude }

    // A stop added or delivered changes the destination, so the old line is
    // simply wrong — refetch even if the truck is on it.
    let reason: 'stops' | 'off-route' | null = fetchedKey.current !== stopsKey ? 'stops' : null

    if (!reason && pathRef.current) {
      const near      = nearestOnPath(pathRef.current, here)
      const tolerance = OFF_ROUTE_M + Math.min(latest.accuracy_m ?? 0, MAX_ACCURACY_ALLOWANCE_M)
      offRouteRun.current = near && near.distanceM > tolerance ? offRouteRun.current + 1 : 0
      if (offRouteRun.current >= OFF_ROUTE_FIXES) reason = 'off-route'
    }

    if (!reason || inFlight.current) return
    if (reason === 'off-route' && Date.now() - lastFetchAt.current < MIN_REFETCH_MS) return

    const useHeading =
      latest.heading_deg !== null && (latest.speed_mps ?? 0) >= HEADING_MIN_SPEED_MPS
    const toWaypoint = (s: OptimizedStop) => ({
      location: { latLng: { latitude: s.latitude, longitude: s.longitude } },
    })
    const last = stops[stops.length - 1]

    const seq = ++requestSeq.current
    inFlight.current    = true
    lastFetchAt.current = Date.now()
    offRouteRun.current = 0
    const key = stopsKey

    import('@/lib/api/directions.api')
      .then(({ computeDirections }) =>
        computeDirections({
          origin: {
            location: {
              latLng:  { latitude: here.lat, longitude: here.lng },
              // The direction of travel, so Google does not route a truck
              // doing 60 on an expressway via a U-turn behind it.
              ...(useHeading && { heading: Math.round(latest.heading_deg!) % 360 }),
            },
          },
          destination: toWaypoint(last),
          ...(stops.length > 1 && { intermediates: stops.slice(0, -1).map(toWaypoint) }),
          travelMode:        'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          fast:              true,
          polylineQuality:   'HIGH_QUALITY',
        }),
      )
      .then((data) => {
        if (seq !== requestSeq.current) return
        const encoded = data?.routes?.[0]?.polyline?.encodedPolyline
        if (!encoded) return
        const points = decodePolyline(encoded)
        pathRef.current    = points
        fetchedKey.current = key
        setPath({ key, points })
      })
      .catch((err) => {
        // Keep whatever is drawn. The next fix retries, after the floor.
        console.error('[LiveRoute] directions error —', err)
      })
      .finally(() => {
        if (seq === requestSeq.current) inFlight.current = false
      })
  }, [enabled, latest, stopsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Turning off (booking left transit, or another booking selected) drops the
  // route, so the next one starts from a fresh fetch rather than an old line.
  useEffect(() => {
    if (enabled) return
    requestSeq.current++
    inFlight.current    = false
    pathRef.current     = null
    fetchedKey.current  = null
    offRouteRun.current = 0
  }, [enabled])

  return enabled && path && path.key === stopsKey ? path.points : null
}

/**
 * Draws the live route from the truck forward. The part behind the truck is
 * cut off at the truck's position on every update, so the line always starts
 * under the marker the way it does in Google Maps navigation.
 */
export function LiveRoutePolyline({ path, truck }: { path: LatLng[] | null; truck: LatLng | null }) {
  const map  = useMap()
  const line = useRef<google.maps.Polyline | null>(null)

  useEffect(() => {
    if (!map) return
    line.current = new google.maps.Polyline({
      strokeColor:   '#06b6d4',
      strokeWeight:  5,
      strokeOpacity: 0.95,
      zIndex:        2,
      map,
    })
    return () => {
      line.current?.setMap(null)
      line.current = null
    }
  }, [map])

  useEffect(() => {
    if (!line.current) return
    if (!path || path.length === 0) {
      line.current.setPath([])
      return
    }
    const near = truck ? nearestOnPath(path, truck) : null
    line.current.setPath(near ? [near.point, ...path.slice(near.index + 1)] : path)
  }, [path, truck, map])

  return null
}

/**
 * Keeps the truck in view, the way Google Maps does while navigating: the
 * camera follows until the viewer drags the map, then stays where they put it
 * until they press "Follow truck" again.
 */
export function FollowTruck({
  position,
  following,
  onFollowingChange,
}: {
  /** The newest raw fix — panning on every eased frame would fight the pan animation. */
  position:          LatLng | null
  following:         boolean
  onFollowingChange: (following: boolean) => void
}) {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    const l = map.addListener('dragstart', () => onFollowingChange(false))
    return () => l.remove()
  }, [map, onFollowingChange])

  const lat = position?.lat
  const lng = position?.lng
  useEffect(() => {
    if (!map || !following || lat === undefined || lng === undefined) return
    map.panTo({ lat, lng })
  }, [map, following, lat, lng])

  if (!position || following) return null

  return (
    <MapControl position={ControlPosition.RIGHT_BOTTOM}>
      <button
        type="button"
        onClick={() => onFollowingChange(true)}
        className="m-3 mb-6 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider shadow-lg"
        style={{
          background:  'var(--color-bg)',
          borderColor: 'rgba(77,249,237,0.4)',
          color:       'var(--color-cyan)',
        }}
      >
        Follow truck
      </button>
    </MapControl>
  )
}
