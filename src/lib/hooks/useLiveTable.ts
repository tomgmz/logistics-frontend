import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Live tables — re-read a list when the rows behind it change, so nobody has to
 * press Refresh after someone else (or the driver app) updates something.
 *
 * Database triggers broadcast on public topics (see the backend migration
 * 20260928050000_live_table_signals):
 *   live:trucks  live:truck_models  live:driver_reports  live:bookings
 * The payload is only { table, id } — anon-key channels are public, so the
 * signal never carries data. The screen re-reads from the API, which applies
 * every permission and scoping rule as usual.
 */
export type LiveTopic = 'live:trucks' | 'live:truck_models' | 'live:driver_reports' | 'live:bookings'

type Listener = () => void

// supabase.channel() hands back the same channel for the same topic, so every
// hook on a topic shares one subscription (same reason as useRecordLock).
const channels = new Map<string, { ch: ReturnType<typeof supabase.channel>; listeners: Set<Listener> }>()

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

/**
 * Calls `onChange` after rows on any of `topics` change. A burst (one save can
 * touch several rows) is coalesced into a single call. While the tab is hidden,
 * changes are remembered and replayed once when it is shown again.
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

    const fire = () => {
      if (document.visibilityState !== 'visible') { missed = true; return }
      window.clearTimeout(timer)
      timer = window.setTimeout(() => onChangeRef.current(), debounceMs)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && missed) {
        missed = false
        onChangeRef.current()
      }
    }

    const unsubs = (key.split('|') as LiveTopic[]).map((t) => subscribe(t, fire))
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      unsubs.forEach((u) => u())
    }
  }, [key, enabled, debounceMs])
}
