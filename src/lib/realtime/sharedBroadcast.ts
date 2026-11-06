import { supabase } from '@/lib/supabase'

/**
 * One shared Supabase broadcast channel per topic, ref-counted.
 *
 * Why this exists: supabase.channel(topic) hands back the EXISTING channel for
 * a topic, and supabase.removeChannel() is async. A hook that tears its channel
 * down and immediately subscribes again (React StrictMode, or a re-render that
 * flips `enabled` off and on, e.g. while the booking detail is re-read) got the
 * dying channel back, which was then torn down under it. Nothing arrived after
 * that until a page refresh: the truck stopped moving and the live route was
 * never trimmed or rerouted.
 *
 * Here every hook on a topic shares one subscription, and the last release
 * waits a moment before removing it, so a quick unsubscribe/subscribe reuses
 * the live channel instead of racing its teardown.
 */

type Handler = (payload: unknown) => void
type StatusListener = (subscribed: boolean) => void

interface Entry {
  ch:         ReturnType<typeof supabase.channel>
  handlers:   Map<string, Set<Handler>>
  statuses:   Set<StatusListener>
  subscribed: boolean
  refs:       number
  releaseTimer: ReturnType<typeof setTimeout> | null
}

const RELEASE_DELAY_MS = 5_000
const entries = new Map<string, Entry>()

function acquire(topic: string): Entry {
  const existing = entries.get(topic)
  if (existing) {
    if (existing.releaseTimer) {
      clearTimeout(existing.releaseTimer)
      existing.releaseTimer = null
    }
    existing.refs++
    return existing
  }

  const entry: Entry = {
    ch:         supabase.channel(topic),
    handlers:   new Map(),
    statuses:   new Set(),
    subscribed: false,
    refs:       1,
    releaseTimer: null,
  }
  // One catch-all listener; events are routed to whoever asked for them.
  entry.ch.on('broadcast', { event: '*' }, (msg: { event: string; payload: unknown }) => {
    entry.handlers.get(msg.event)?.forEach((h) => h(msg.payload))
  })
  entry.ch.subscribe((status) => {
    entry.subscribed = status === 'SUBSCRIBED'
    entry.statuses.forEach((l) => l(entry.subscribed))
  })
  entries.set(topic, entry)
  return entry
}

function release(topic: string, entry: Entry) {
  entry.refs--
  if (entry.refs > 0 || entry.releaseTimer) return
  entry.releaseTimer = setTimeout(() => {
    if (entry.refs > 0) return
    entries.delete(topic)
    void supabase.removeChannel(entry.ch)
  }, RELEASE_DELAY_MS)
}

/**
 * Listen for broadcast `events` on `topic`. `onStatus` (optional) hears whether
 * the channel is connected, immediately and on every change. Returns the
 * unsubscribe function.
 */
export function subscribeBroadcast(
  topic: string,
  events: Record<string, Handler>,
  onStatus?: StatusListener,
): () => void {
  const entry = acquire(topic)

  for (const [event, handler] of Object.entries(events)) {
    let set = entry.handlers.get(event)
    if (!set) { set = new Set(); entry.handlers.set(event, set) }
    set.add(handler)
  }
  if (onStatus) {
    entry.statuses.add(onStatus)
    onStatus(entry.subscribed)
  }

  let done = false
  return () => {
    if (done) return
    done = true
    for (const [event, handler] of Object.entries(events)) entry.handlers.get(event)?.delete(handler)
    if (onStatus) entry.statuses.delete(onStatus)
    release(topic, entry)
  }
}
