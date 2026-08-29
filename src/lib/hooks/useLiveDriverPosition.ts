'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import authApi from '@/lib/api/auth.api'

/**
 * Where the truck is, live, for one booking.
 *
 * Updates arrive by Supabase broadcast on `tracking:booking:<id>` — the same
 * server-push convention notifications and messaging already use, so the
 * browser never reads a table directly and the policy-less RLS on
 * `driver_locations` stays intact. Polling is only a fallback for when that
 * channel will not connect.
 *
 * Two things this hook exists to get right, both of which matter more than the
 * raw update rate:
 *
 *   Interpolation — the marker is eased from its last position to the new one
 *   rather than snapped. A 10 s update that glides reads as continuous motion;
 *   a 3 s update that jumps reads as broken. This is where "real time" actually
 *   comes from.
 *
 *   Staleness — `isStale` goes true when nothing has arrived for a while, and
 *   the map must say so. Showing a last-known position as though it were live is
 *   the one way this feature could actively mislead someone: a receiving clerk
 *   planning around a truck that has in fact broken down is worse off than one
 *   who was told the position is old.
 */

export interface DriverPosition {
  booking_id:   string
  driver_id:    string
  latitude:     number
  longitude:    number
  accuracy_m:   number | null
  speed_mps:    number | null
  heading_deg:  number | null
  recorded_at:  string
}

/** Predicted arrival at one remaining stop. */
export interface StopEta {
  destination_id: string
  eta_seconds:    number
  eta_at:         string
}

/**
 * Nothing for this long and the position stops being presented as live. Comfortably
 * past the app's slowest tier (60 s while parked) plus a retry, so an idling truck
 * is never mislabelled.
 */
const STALE_AFTER_MS = 2 * 60 * 1000

/** Fallback cadence, used only while the realtime channel is not connected. */
const POLL_MS = 30_000

/** How long the marker takes to glide to a newly received position. */
const EASE_MS = 900

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

interface LiveDriverPosition {
  /** The eased position to draw. Null until the first fix arrives. */
  position:   { lat: number; lng: number } | null
  /** The newest fix as received, unsmoothed — for heading, speed and timestamps. */
  latest:     DriverPosition | null
  /** True when the newest fix is old enough that it must not be shown as live. */
  isStale:    boolean
  /** Milliseconds since the newest fix was recorded, or null before the first. */
  ageMs:      number | null
  /** Whether the realtime channel is connected (as opposed to polling). */
  isLive:     boolean
  /** Predicted arrival per remaining stop, keyed by destination_id. */
  etaByStop:  Map<string, StopEta>
  /** The soonest remaining arrival — the next stop the truck will reach. */
  nextEta:    StopEta | null
}

export function useLiveDriverPosition(
  bookingId: string | null,
  /** Skip all of it for a booking that cannot be moving. */
  enabled = true,
): LiveDriverPosition {
  const [latest,     setLatest]     = useState<DriverPosition | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [eased,      setEased]      = useState<{ lat: number; lng: number } | null>(null)
  const [etaStops,   setEtaStops]   = useState<StopEta[] | null>(null)
  // The clock is held in state and advanced by a timer, rather than read during
  // render: `ageMs` has to keep climbing between fixes (otherwise the map would
  // claim "updated 4s ago" indefinitely), and reading a clock while rendering is
  // impure — it would produce a different answer on any incidental re-render.
  const [now, setNow] = useState(0)

  const easedRef = useRef<{ lat: number; lng: number } | null>(null)
  const frameRef = useRef<number | null>(null)

  const active = !!bookingId && enabled

  /* ── Ingest: one place every new fix goes through, whatever brought it ── */
  useEffect(() => {
    if (!active || !bookingId) return

    let cancelled = false

    const accept = (next: DriverPosition | null) => {
      if (cancelled || !next) return
      setLatest((prev) => {
        // Broadcast and poll can both deliver, and a poll can land behind a
        // broadcast. Device time decides which is newer.
        if (prev && Date.parse(next.recorded_at) <= Date.parse(prev.recorded_at)) return prev
        return next
      })
      // Age this fix from the moment it landed rather than from the previous
      // one-second tick, so a fresh position never renders as a second old.
      setNow(Date.now())
    }

    // First paint, and the seed the very first ease runs from. This is also the
    // only place the ETA arrives from on a healthy socket until the server
    // recomputes it, which is minutes away.
    authApi
      .get(`/booking/${bookingId}/live-position`)
      .then((res) => {
        const row = res.data?.data as (DriverPosition & { eta_stops?: StopEta[] | null }) | null
        accept(row)
        if (row?.eta_stops) setEtaStops(row.eta_stops)
      })
      .catch(() => {})

    const channel = supabase
      .channel(`tracking:booking:${bookingId}`)
      .on('broadcast', { event: 'driver_position' }, (msg) => {
        accept(msg.payload as DriverPosition)
      })
      .on('broadcast', { event: 'driver_eta' }, (msg) => {
        if (cancelled) return
        const payload = msg.payload as { eta_stops?: StopEta[] }
        if (payload?.eta_stops) setEtaStops(payload.eta_stops)
      })
      .subscribe((status) => {
        if (!cancelled) setSubscribed(status === 'SUBSCRIBED')
      })

    return () => {
      cancelled = true
      setSubscribed(false)
      easedRef.current = null
      supabase.removeChannel(channel)
    }
  }, [bookingId, active])

  /* ── Fallback poll: only while the channel is down ────────────────────── */
  useEffect(() => {
    if (!active || !bookingId || subscribed) return

    const id = setInterval(() => {
      authApi
        .get(`/booking/${bookingId}/live-position`)
        .then((res) => {
          const next = res.data?.data as (DriverPosition & { eta_stops?: StopEta[] | null }) | null
          if (!next) return
          setLatest((prev) =>
            prev && Date.parse(next.recorded_at) <= Date.parse(prev.recorded_at) ? prev : next,
          )
          if (next.eta_stops) setEtaStops(next.eta_stops)
        })
        .catch(() => {})
    }, POLL_MS)

    return () => clearInterval(id)
  }, [bookingId, active, subscribed])

  /* ── Ease the marker across, rather than teleporting it ───────────────── */
  useEffect(() => {
    if (!latest) return

    const target = { lat: latest.latitude, lng: latest.longitude }
    // The first fix has nothing to travel from, so it starts at its destination
    // and the loop below settles on frame one. Handled this way rather than by
    // placing it up front, because a state write in an effect body would cascade
    // a render; inside a frame callback it does not.
    const start = easedRef.current ?? target

    const startedAt = performance.now()

    const step = (frameTime: number) => {
      const t = Math.min(1, (frameTime - startedAt) / EASE_MS)
      const k = easeOutCubic(t)
      const next = {
        lat: start.lat + (target.lat - start.lat) * k,
        lng: start.lng + (target.lng - start.lng) * k,
      }
      easedRef.current = next
      setEased(next)
      if (t < 1) frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [latest])

  /* ── Keep the freshness readout honest between fixes ──────────────────── */
  useEffect(() => {
    if (!latest) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [latest])

  // Everything below is derived, so a booking that goes quiet or a hook that is
  // disabled reports nothing without any state having to be reset — and a fix
  // belonging to a previously selected booking can never leak into the new one.
  const current = active && latest && latest.booking_id === bookingId ? latest : null
  const ageMs   = current && now ? Math.max(0, now - Date.parse(current.recorded_at)) : null

  // `eta_at` is an absolute instant, so the countdown keeps running between the
  // server's recomputations — the client sees "18 min" tick down to "17 min"
  // rather than a number frozen until the next Routes call. Re-derived from the
  // one-second tick, which is why it is not memoised.
  const etaByStop = new Map<string, StopEta>()
  if (active && etaStops) {
    for (const stop of etaStops) {
      const remaining = now ? Math.round((Date.parse(stop.eta_at) - now) / 1000) : stop.eta_seconds
      etaByStop.set(stop.destination_id, { ...stop, eta_seconds: Math.max(0, remaining) })
    }
  }

  return {
    position: current ? eased : null,
    latest:   current,
    isStale:  ageMs !== null && ageMs > STALE_AFTER_MS,
    ageMs,
    isLive:   subscribed,
    etaByStop,
    nextEta:  etaByStop.size > 0 ? [...etaByStop.values()][0] : null,
  }
}

/** "12 min" / "1 h 40 m" / "arriving" — how an ETA is written on the panel. */
export function formatEta(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null
  if (seconds < 60) return 'arriving'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} m`
}

/** The clock time the truck is expected, e.g. "2:45 PM". */
export function formatEtaClock(etaAt: string | null | undefined): string | null {
  if (!etaAt) return null
  const at = new Date(etaAt)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "just now" / "8s ago" / "4m ago" — the map's freshness line. */
export function formatAge(ageMs: number | null): string {
  if (ageMs === null) return 'no position yet'
  const seconds = Math.max(0, Math.floor(ageMs / 1000))
  if (seconds < 5)  return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}
