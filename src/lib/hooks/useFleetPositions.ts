'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import authApi from '@/lib/api/auth.api'
import { subscribeLive } from '@/lib/hooks/useLiveTable'
import type { DriverPosition, StopEta } from '@/lib/hooks/useLiveDriverPosition'

/**
 * Every truck on the road, for the staff fleet map.
 *
 * The per-booking map gets coordinates pushed to it; this one cannot. Its topic
 * would have to carry every truck's position, and broadcast topics are public
 * (anon key), so `live:tracking` carries only "something moved" and the map
 * re-reads through the authenticated, staff-only fleet endpoint.
 *
 * That re-read is THROTTLED, not debounced: the topic fires on every ping from
 * every truck, so a debounce on a busy fleet would keep resetting and never
 * fire. At most one read per READ_GAP_MS, however many pings land in between —
 * positions arrive every 5-60 s per truck anyway, and the marker glide covers
 * the gap.
 */

export interface FleetPosition extends DriverPosition {
  eta_stops:        StopEta[] | null
  reference_number: string | null
  driver_name:      string | null
  plate_number:     string | null
}

export interface FleetTruck {
  /** The eased position to draw. */
  position: { lat: number; lng: number }
  latest:   FleetPosition
  isStale:  boolean
  ageMs:    number
  nextEta:  StopEta | null
}

const READ_GAP_MS     = 5_000
/** Fallback while the signal channel is quiet or down. */
const POLL_MS         = 30_000
/** Same threshold as the single-booking map, for the same reason. */
const STALE_AFTER_MS  = 2 * 60 * 1000
const EASE_MS         = 900

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function useFleetPositions(enabled = true): {
  trucks:  FleetTruck[]
  loading: boolean
  error:   string | null
  reload:  () => void
} {
  const [rows,    setRows]    = useState<FleetPosition[]>([])
  const [eased,   setEased]   = useState<Record<string, { lat: number; lng: number }>>({})
  const [loading, setLoading] = useState(enabled)
  const [error,   setError]   = useState<string | null>(null)
  const [now,     setNow]     = useState(0)

  const easedRef  = useRef<Record<string, { lat: number; lng: number }>>({})
  const frameRef  = useRef<number | null>(null)
  const lastRead  = useRef(0)
  const pending   = useRef<number | undefined>(undefined)
  const inFlight  = useRef(false)

  // Never sets state before the request returns, so the first load can run
  // straight from the effect; `reload` raises the spinner itself.
  const read = useCallback((quiet: boolean) => {
    if (inFlight.current) return
    inFlight.current = true
    lastRead.current = Date.now()
    authApi
      .get('/booking/fleet/live-positions')
      .then((res) => {
        setRows((res.data?.data ?? []) as FleetPosition[])
        setError(null)
        setNow(Date.now())
      })
      .catch((e) => {
        // A quiet re-read that fails keeps the trucks already on the map rather
        // than blanking it; only the first load reports.
        if (!quiet) setError(e?.response?.data?.message ?? 'Could not load vehicle positions')
      })
      .finally(() => {
        inFlight.current = false
        if (!quiet) setLoading(false)
      })
  }, [])

  /* ── First load, signal-driven re-reads, fallback poll ─────────────────── */
  useEffect(() => {
    if (!enabled) return

    read(false)

    const onSignal = () => {
      if (document.visibilityState !== 'visible') return
      if (pending.current !== undefined) return
      const wait = Math.max(0, READ_GAP_MS - (Date.now() - lastRead.current))
      pending.current = window.setTimeout(() => {
        pending.current = undefined
        read(true)
      }, wait)
    }
    const unsubscribe = subscribeLive('live:tracking', onSignal)

    const poll = window.setInterval(() => {
      if (Date.now() - lastRead.current >= POLL_MS) read(true)
    }, POLL_MS)

    const onVisible = () => { if (document.visibilityState === 'visible') read(true) }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      unsubscribe()
      window.clearInterval(poll)
      window.clearTimeout(pending.current)
      pending.current = undefined
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, read])

  /* ── Glide every truck to its new position together ────────────────────── */
  useEffect(() => {
    if (rows.length === 0) return
    const from: Record<string, { lat: number; lng: number }> = {}
    const to:   Record<string, { lat: number; lng: number }> = {}
    for (const r of rows) {
      const target = { lat: Number(r.latitude), lng: Number(r.longitude) }
      to[r.booking_id]   = target
      // A truck that just appeared starts where it is rather than flying in.
      from[r.booking_id] = easedRef.current[r.booking_id] ?? target
    }

    const startedAt = performance.now()
    const step = (frameTime: number) => {
      const k = easeOutCubic(Math.min(1, (frameTime - startedAt) / EASE_MS))
      const next: Record<string, { lat: number; lng: number }> = {}
      for (const id of Object.keys(to)) {
        next[id] = {
          lat: from[id].lat + (to[id].lat - from[id].lat) * k,
          lng: from[id].lng + (to[id].lng - from[id].lng) * k,
        }
      }
      easedRef.current = next
      setEased(next)
      if (k < 1) frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current) }
  }, [rows])

  /* ── Keep each truck's age honest between reads ────────────────────────── */
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [enabled])

  const trucks: FleetTruck[] = enabled
    ? rows.flatMap((latest) => {
        const position = eased[latest.booking_id]
        if (!position) return []
        const ageMs = now ? Math.max(0, now - Date.parse(latest.recorded_at)) : 0
        const nextEta = [...(latest.eta_stops ?? [])]
          .sort((a, b) => Date.parse(a.eta_at) - Date.parse(b.eta_at))[0] ?? null
        const remaining = nextEta && now
          ? { ...nextEta, eta_seconds: Math.max(0, Math.round((Date.parse(nextEta.eta_at) - now) / 1000)) }
          : nextEta
        return [{ position, latest, ageMs, isStale: ageMs > STALE_AFTER_MS, nextEta: remaining }]
      })
    : []

  const reload = useCallback(() => { setLoading(true); read(false) }, [read])

  return { trucks, loading, error, reload }
}
