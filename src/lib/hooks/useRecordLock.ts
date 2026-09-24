'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { lockService, type LockType, type LockView } from '@/lib/services/lock.service'

/**
 * Hold the edit lock on one record while this screen is open, and tell the
 * screen when someone else holds it instead.
 *
 *   const lock = useRecordLock({ type: 'booking', id, enabled: canEdit, onStale: reload })
 *   <RecordLockBanner lock={lock} noun="booking" />
 *   <fieldset disabled={lock.readOnly}> … </fieldset>
 *
 * Lifecycle:
 *  - opens → acquire. Held by someone else → `locked`: render read-only, and
 *    the hook keeps trying so the screen unlocks by itself once they are done.
 *  - held → heartbeat every 20s (server TTL is 60s, so a dead tab frees the
 *    record within a minute).
 *  - no keyboard/mouse activity for `idleMs` → release and go `paused`, so an
 *    abandoned tab does not keep colleagues out. "Resume" re-acquires.
 *  - closes / tab hides for good → release.
 *
 * Whenever the lock is (re)gained after someone else wrote to the record, the
 * hook calls `onStale` so the screen reloads before its user edits a copy that
 * is no longer true.
 *
 * This is the courtesy half. The server refuses a write to a record someone
 * else has locked (HTTP 423) whatever this hook believes.
 */

export type RecordLockStatus =
  | 'off'          // not enabled (read-only user, nothing selected)
  | 'acquiring'
  | 'mine'
  | 'locked'       // someone else is editing
  | 'paused'       // released after inactivity
  | 'unavailable'  // server has no lock support — fail open

export interface RecordLock {
  status:     RecordLockStatus
  holderName: string | null
  /** Render fields and action buttons disabled. */
  readOnly:   boolean
  /** Take the lock again after `paused`. */
  resume:     () => void
}

const HEARTBEAT_MS = 20_000
const DEFAULT_IDLE_MS = 5 * 60_000

// ── One realtime subscription per lock type, shared by every hook ───────────
// supabase.channel() hands back the same channel for the same topic, so two
// hooks each removing "their" channel would unsubscribe each other.

type Listener = (id: string) => void
const channels = new Map<string, { ch: ReturnType<typeof supabase.channel>; listeners: Set<Listener> }>()

export function subscribeLockEvents(type: LockType, listener: Listener): () => void {
  const topic = `record-locks:${type}`
  let entry = channels.get(topic)
  if (!entry) {
    const listeners = new Set<Listener>()
    const ch = supabase
      .channel(topic)
      .on('broadcast', { event: 'changed' }, (msg) => {
        const id = (msg.payload as { id?: string })?.id
        if (id) listeners.forEach((l) => l(id))
      })
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

export function useRecordLock({
  type,
  id,
  enabled = true,
  onStale,
  idleMs = DEFAULT_IDLE_MS,
}: {
  type:     LockType
  id:       string | null | undefined
  enabled?: boolean
  onStale?: () => void
  idleMs?:  number
}): RecordLock {
  const [status, setStatus]         = useState<RecordLockStatus>('off')
  const [holderName, setHolderName] = useState<string | null>(null)

  const onStaleRef = useRef(onStale)
  onStaleRef.current = onStale

  // Write count this screen's copy reflects. null = not known yet.
  const seenSeq      = useRef<number | null>(null)
  const statusRef    = useRef<RecordLockStatus>('off')
  const lastActivity = useRef(Date.now())
  const inFlight     = useRef(false)

  const active = enabled && !!id

  const set = useCallback((s: RecordLockStatus, holder: string | null = null) => {
    statusRef.current = s
    setStatus(s)
    setHolderName(holder)
  }, [])

  /** Fold a server answer into local state. */
  const apply = useCallback((v: LockView) => {
    if (v.unavailable) { set('unavailable'); return }

    const known = seenSeq.current
    const stale = known !== null && v.write_seq > known && !v.last_write_by_me
    seenSeq.current = Math.max(known ?? 0, v.write_seq)

    if (v.held_by_me) {
      set('mine')
      if (stale) onStaleRef.current?.()
    } else {
      set('locked', v.holder_name)
      // Keep the read-only view current while watching someone else edit.
      if (stale) onStaleRef.current?.()
    }
  }, [set])

  const tryAcquire = useCallback(async () => {
    if (!id || inFlight.current) return
    inFlight.current = true
    try {
      apply(await lockService.acquire(type, id))
    } catch {
      // A lock-service outage must not freeze the admin: fail open. The server
      // still refuses writes that collide with a live lock.
      set('unavailable')
    } finally {
      inFlight.current = false
    }
  }, [type, id, apply, set])

  // Open / switch record / close.
  useEffect(() => {
    if (!active) { set('off'); return }

    seenSeq.current = null
    lastActivity.current = Date.now()
    set('acquiring')
    void tryAcquire()

    const lockedId = id!
    const onPageHide = () => {
      if (statusRef.current === 'mine') lockService.releaseOnUnload(type, lockedId)
    }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      if (statusRef.current === 'mine') void lockService.release(type, lockedId).catch(() => {})
      statusRef.current = 'off'
    }
  }, [active, type, id, tryAcquire, set])

  // Heartbeat while held; retry while someone else holds it (backup for a
  // missed realtime event); idle release.
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      const s = statusRef.current
      if (s === 'mine' && Date.now() - lastActivity.current > idleMs) {
        void lockService.release(type, id!).catch(() => {})
        set('paused')
        return
      }
      if (s === 'mine' || s === 'locked') void tryAcquire()
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [active, type, id, idleMs, tryAcquire, set])

  // Activity tracking for the idle release.
  useEffect(() => {
    if (!active) return
    const bump = () => { lastActivity.current = Date.now() }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, bump))
  }, [active])

  // Someone took or released this record's lock, or wrote to it.
  useEffect(() => {
    if (!active) return
    return subscribeLockEvents(type, (changedId) => {
      if (changedId !== id) return
      if (statusRef.current === 'locked') void tryAcquire()
    })
  }, [active, type, id, tryAcquire])

  const resume = useCallback(() => {
    lastActivity.current = Date.now()
    set('acquiring')
    void tryAcquire()
  }, [tryAcquire, set])

  return {
    status,
    holderName,
    readOnly: status === 'locked' || status === 'paused' || status === 'acquiring',
    resume,
  }
}

/**
 * Which records of a type are being edited right now, and by whom — for list
 * rows ("🔒 Maria is updating"). Excludes locks held by the current user.
 */
export function useRecordLocks(type: LockType, enabled = true): Map<string, string> {
  const [held, setHeld] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let debounce: number | undefined

    const load = async () => {
      try {
        const rows = await lockService.list(type)
        if (cancelled) return
        setHeld(new Map(
          rows.filter((r) => r.locked && !r.held_by_me)
              .map((r) => [r.resource_id, r.holder_name ?? 'Someone'] as const),
        ))
      } catch {
        /* badges are informational; keep the last known set */
      }
    }

    void load()
    const unsubscribe = subscribeLockEvents(type, () => {
      window.clearTimeout(debounce)
      debounce = window.setTimeout(() => void load(), 300)
    })
    // Locks lapse without an event when a tab dies; re-read now and then.
    const poll = window.setInterval(() => void load(), 30_000)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(poll)
      window.clearTimeout(debounce)
    }
  }, [type, enabled])

  return enabled ? held : NO_LOCKS
}

const NO_LOCKS: Map<string, string> = new Map()
