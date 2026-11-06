'use client'

import { useEffect, useRef, useState } from 'react'
import { subscribeBroadcast } from '@/lib/realtime/sharedBroadcast'
import authApi from '@/lib/api/auth.api'
import { formatDuration } from '@/lib/duration'

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

/**
 * An ETA older than this is no ETA: the truck stopped reporting, so its clock
 * time is history, not a prediction. Same limit the server's delay check uses
 * (delay.scheduler FRESH_ETA_MS), so the panel and the Delayed flag agree.
 */
const ETA_FRESH_MS = 15 * 60 * 1000

/** Fallback cadence, used only while the realtime channel is not connected. */
const POLL_MS = 30_000
/** Safety read while the channel claims to be up (see the catch-up poll). */
const CATCHUP_MS = 60_000

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
  /** When the server computed `etaStops` (ms). A broadcast is fresh on arrival. */
  const [etaAtMs,    setEtaAtMs]    = useState<number | null>(null)
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
        const row = res.data?.data as (DriverPosition & { eta_stops?: StopEta[] | null; eta_computed_at?: string | null }) | null
        accept(row)
        if (row?.eta_stops) {
          setEtaStops(row.eta_stops)
          setEtaAtMs(row.eta_computed_at ? Date.parse(row.eta_computed_at) : null)
        }
      })
      .catch(() => {})

    // Shared, ref-counted channel: a fresh supabase.channel() + removeChannel()
    // per effect run raced the async teardown and went silent (sharedBroadcast).
    const unsubscribe = subscribeBroadcast(
      `tracking:booking:${bookingId}`,
      {
        driver_position: (payload) => accept(payload as DriverPosition),
        driver_eta: (payload) => {
          if (cancelled) return
          const p = payload as { eta_stops?: StopEta[] }
          if (p?.eta_stops) {
            setEtaStops(p.eta_stops)
            setEtaAtMs(Date.now())
          }
        },
      },
      (ok) => { if (!cancelled) setSubscribed(ok) },
    )

    return () => {
      cancelled = true
      setSubscribed(false)
      easedRef.current = null
      unsubscribe()
    }
  }, [bookingId, active])

  /* ── Catch-up poll ────────────────────────────────────────────────────────
   * Every POLL_MS while the channel is down. While it is up, a slower
   * CATCHUP_MS read anyway, plus one the moment the tab is shown again: a
   * socket in a backgrounded tab (or after the laptop slept) can report
   * "subscribed" while broadcasts sent meanwhile are simply gone, and without
   * this the truck and its line only moved again on a page refresh. */
  useEffect(() => {
    if (!active || !bookingId) return

    const read = () => {
      if (document.visibilityState !== 'visible') return
      authApi
        .get(`/booking/${bookingId}/live-position`)
        .then((res) => {
          const next = res.data?.data as (DriverPosition & { eta_stops?: StopEta[] | null; eta_computed_at?: string | null }) | null
          if (!next) return
          setLatest((prev) =>
            prev && Date.parse(next.recorded_at) <= Date.parse(prev.recorded_at) ? prev : next,
          )
          if (next.eta_stops) {
            setEtaStops(next.eta_stops)
            setEtaAtMs(next.eta_computed_at ? Date.parse(next.eta_computed_at) : null)
          }
        })
        .catch(() => {})
    }

    const id = setInterval(read, subscribed ? CATCHUP_MS : POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
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
  // A stale ETA (or one with no computed time) is dropped, so the panel says
  // there is no estimate instead of showing a clock time from days ago.
  const etaFresh  = etaAtMs !== null && (!now || now - etaAtMs <= ETA_FRESH_MS)
  const etaByStop = new Map<string, StopEta>()
  if (active && etaStops && etaFresh) {
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

/** "12 min" / "1 hr" / "2 days" / "arriving" — how an ETA is written (formatDuration). */
export function formatEta(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null
  if (seconds < 60) return 'arriving'
  return formatDuration(seconds / 60)
}

/**
 * The clock time the truck is expected, e.g. "2:45 PM" — in Manila time, where
 * the delivery is, whatever time zone the viewer's device happens to be set to.
 */
export function formatEtaClock(etaAt: string | null | undefined): string | null {
  if (!etaAt) return null
  const at = new Date(etaAt)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
}

/** "just now" / "8s ago" / "4 min ago" / "3 hrs ago" / "10 days ago" — the map's freshness line. */
export function formatAge(ageMs: number | null): string {
  if (ageMs === null) return 'no position yet'
  const seconds = Math.max(0, Math.floor(ageMs / 1000))
  if (seconds < 5)  return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  return `${formatDuration(seconds / 60)} ago`
}
