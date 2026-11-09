import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Live tables — re-read a list when the rows behind it change, so nobody has to
 * press Refresh after someone else (or the driver app) updates something.
 *
 * Database triggers broadcast on public topics (see the backend migration
 * 20260928050000_live_table_signals):
 *   live:trucks  live:truck_models  live:driver_reports  live:bookings
 *   live:documents (20260930010000_document_management)
 *   live:users  live:password_resets  live:audit_logs  live:system_logs
 *   live:catalog (20261002000000_live_table_signals_more)
 *   live:tracking (sent by the backend's position ingest, not a trigger)
 * The payload is only { table, id } — anon-key channels are public, so the
 * signal never carries data. The screen re-reads from the API, which applies
 * every permission and scoping rule as usual.
 */
export type LiveTopic =
  | 'live:trucks' | 'live:truck_models' | 'live:driver_reports' | 'live:bookings' | 'live:documents'
  | 'live:users' | 'live:password_resets' | 'live:audit_logs' | 'live:system_logs' | 'live:catalog'
  | 'live:tracking' | 'live:support_tickets'

type Listener = () => void

// supabase.channel() hands back the same channel for the same topic, so every
// hook on a topic shares one subscription (same reason as useRecordLock).
const channels = new Map<string, { ch: ReturnType<typeof supabase.channel>; listeners: Set<Listener> }>()

/**
 * Raw subscription, for a screen that needs its own pacing instead of the
 * debounce below — the fleet map, whose topic fires on every truck's every
 * ping, so a debounce could be held off indefinitely by a busy fleet.
 */
export function subscribeLive(topic: LiveTopic, listener: Listener): () => void {
  return subscribe(topic, listener)
}

function subscribe(topic: LiveTopic, listener: Listener): () => void {
  let entry = channels.get(topic)
  if (!entry) {
    const listeners = new Set<Listener>()
    const ch = supabase
      .channel(topic)
      .on('broadcast', { event: 'changed' }, () => listeners.forEach((l) => l()))
      .subscribe()
    entry = { ch, listeners }
    channels.set(topic, entry)
  }
  entry.listeners.add(listener)

  return () => {
    const e = channels.get(topic)
    if (!e) return
    e.listeners.delete(listener)
    if (e.listeners.size === 0) {
      channels.delete(topic)
      void supabase.removeChannel(e.ch)
    }
  }
}

/** A tab hidden at least this long re-reads when shown again (see below). */
const STALE_AFTER_HIDDEN_MS = 30_000

/**
 * Calls `onChange` after rows on any of `topics` change. A burst (one save can
 * touch several rows) is coalesced into a single call. While the tab is hidden,
 * changes are remembered and replayed once when it is shown again.
 *
 * Also calls it (once) when the tab comes back after 30 s or more hidden, and
 * when the connection comes back online: a browser can pause a background
 * tab's socket, so signals sent meanwhile never arrive at all. Same idea as
 * refetch-on-focus / on-reconnect in SWR and TanStack Query; callers already
 * re-read quietly here, so nothing flashes.
 */
export function useLiveTable(
  topics: LiveTopic[],
  onChange: () => void,
  { enabled = true, debounceMs = 600 }: { enabled?: boolean; debounceMs?: number } = {},
): void {
  // Latest callback without re-subscribing on every render.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  const key = topics.join('|')

  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined
    let missed = false
    let hiddenAt: number | null = document.visibilityState === 'visible' ? null : Date.now()

    const fire = () => {
      if (document.visibilityState !== 'visible') { missed = true; return }
      window.clearTimeout(timer)
      timer = window.setTimeout(() => onChangeRef.current(), debounceMs)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        hiddenAt ??= Date.now()
        return
      }
      const longAway = hiddenAt !== null && Date.now() - hiddenAt >= STALE_AFTER_HIDDEN_MS
      hiddenAt = null
      if (missed || longAway) {
        missed = false
        onChangeRef.current()
      }
    }
    // Back online: signals sent while offline were lost.
    const onOnline = () => {
      if (document.visibilityState === 'visible') onChangeRef.current()
      else missed = true
    }

    const unsubs = (key.split('|') as LiveTopic[]).map((t) => subscribe(t, fire))
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      unsubs.forEach((u) => u())
    }
  }, [key, enabled, debounceMs])
}

/**
 * For history screens (logs, transactions, the document library): count changes
 * instead of re-reading, so rows never shift under someone reading the list and
 * a busy topic costs no API calls. The screen shows <NewEntriesBar count={pending}>
 * and calls `clear()` whenever it loads, for whatever reason (the bar, a filter,
 * a page change), since the list is current again at that point.
 */
export function useLivePending(
  topics: LiveTopic[],
  { enabled = true }: { enabled?: boolean } = {},
): { pending: number; clear: () => void } {
  const [pending, setPending] = useState(0)
  const key = topics.join('|')

  useEffect(() => {
    if (!enabled) return
    const bump = () => setPending((n) => n + 1)
    const unsubs = (key.split('|') as LiveTopic[]).map((t) => subscribe(t, bump))
    return () => unsubs.forEach((u) => u())
  }, [key, enabled])

  const clear = useCallback(() => setPending(0), [])
  return { pending, clear }
}
