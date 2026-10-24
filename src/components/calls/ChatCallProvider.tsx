'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client'
import { Phone, PhoneOff, Mic, MicOff, Minimize2, Maximize2 } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store/auth.store'
import { useChatCallStore, type CallRequest } from '@/lib/store/chatCall.store'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { chatCallService, type ChatCallView } from '@/lib/services/chatCall.service'
import { roleLabel } from '@/lib/roles'
import { useRingtone, useTitleFlash, useElapsed } from './callHooks'

/**
 * Voice calls from Messages, one person to one person.
 *
 * Mounted once per page tree (the dashboard shell and the /messages layout) for
 * everyone except clients. It places calls for the chat headers' call button
 * (through useChatCallStore), rings this browser when someone calls, and runs
 * the call itself: mute, hang up, minimise to a bar.
 *
 * The caller joins the LiveKit room as soon as the call is placed; the call is
 * live when the other person joins it. The caller's ring timer decides "no
 * answer". The emergency ringer (EmergencyCallProvider) is separate and draws
 * above this one.
 */

/** A ringer older than this is dropped even if no close event arrived. */
const RING_MAX_MS = 75_000
/** How long "Call ended" stays up before the sheet closes by itself. */
const ENDED_LINGER_MS = 4_000

type Phase = 'placing' | 'ringing' | 'connecting' | 'live' | 'ended'

interface ActiveCall {
  direction: 'out' | 'in'
  peerName:  string
  peerRole:  string
  phase:     Phase
  muted:     boolean
  startedAt: number | null
  ringLeft:  number | null
  note:      string | null
}

function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string } }; message?: string } | null
  return err?.response?.data?.message ?? err?.message ?? fallback
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export default function ChatCallProvider() {
  const user    = useAuthStore((s) => s.user)
  const userId  = user?.user_id
  const allowed = !!userId && user?.role !== 'client'

  const setPlaceCall = useChatCallStore((s) => s.setPlaceCall)
  const setInCall    = useChatCallStore((s) => s.setInCall)

  const [ringing,   setRinging]   = useState<ChatCallView[]>([])
  const [active,    setActive]    = useState<ActiveCall | null>(null)
  const [answering, setAnswering] = useState<string | null>(null)
  const [minimised, setMinimised] = useState(false)

  const roomRef    = useRef<Room | null>(null)
  const audioHost  = useRef<HTMLDivElement | null>(null)
  const dismissed  = useRef<Set<string>>(new Set())
  const activeRef  = useRef<ActiveCall | null>(null)
  const callIdRef  = useRef<string | null>(null)
  // Bumped whenever the current attempt is abandoned (hang up, decline, close),
  // so an await that finishes afterwards knows its call is no longer wanted.
  const attemptRef = useRef(0)

  useEffect(() => { activeRef.current = active }, [active])

  const dropRinging = useCallback((callId: string) => {
    setRinging((list) => list.filter((c) => c.call_id !== callId))
  }, [])

  const addRinging = useCallback((call: ChatCallView) => {
    if (!call?.call_id || call.callee_id !== userId || dismissed.current.has(call.call_id)) return
    setRinging((list) => (list.some((c) => c.call_id === call.call_id) ? list : [call, ...list]))
  }, [userId])

  const teardownRoom = useCallback(() => {
    const room = roomRef.current
    roomRef.current = null
    if (room) {
      room.removeAllListeners()
      void room.disconnect().catch(() => {})
    }
    if (audioHost.current) audioHost.current.innerHTML = ''
  }, [])

  // Leave the room if the page goes away mid-call.
  useEffect(() => () => teardownRoom(), [teardownRoom])

  /** Stop the current call on this side and show why. */
  const finishLocal = useCallback((note: string) => {
    attemptRef.current += 1
    teardownRoom()
    setActive((a) => (a && a.phase !== 'ended' ? { ...a, phase: 'ended', note, ringLeft: null } : a))
  }, [teardownRoom])

  const joinRoom = useCallback(async (url: string, token: string) => {
    const room = new Room({ adaptiveStream: false, dynacast: false })
    roomRef.current = room

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return
      const el = track.attach()
      el.setAttribute('playsinline', 'true')
      audioHost.current?.appendChild(el)
    })
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove())
    })
    // The callee joining is what "answered" means to the caller.
    room.on(RoomEvent.ParticipantConnected, () => {
      setActive((a) => (a && a.phase === 'ringing' ? { ...a, phase: 'live', startedAt: Date.now(), ringLeft: null } : a))
    })
    room.on(RoomEvent.ParticipantDisconnected, () => {
      const id = callIdRef.current
      // Closes the row if the other side dropped without hanging up; a no-op otherwise.
      if (id) void chatCallService.end(id).catch(() => {})
      finishLocal(`${activeRef.current?.peerName ?? 'They'} hung up.`)
    })
    room.on(RoomEvent.Disconnected, () => finishLocal('The call ended.'))

    await room.connect(url, token)
    await room.startAudio().catch(() => {})
    try {
      await room.localParticipant.setMicrophoneEnabled(true)
    } catch {
      setActive((a) => a && { ...a, note: 'Your microphone is blocked. Allow it in the browser to be heard.' })
    }
    return room
  }, [finishLocal])

  /* ── Calling out ───────────────────────────────────────────────────────── */

  const placeCall = useCallback(async ({ conversationId, peerName, peerRole }: CallRequest) => {
    if (activeRef.current && activeRef.current.phase !== 'ended') return
    const attempt = ++attemptRef.current
    callIdRef.current = null
    const draft: ActiveCall = {
      direction: 'out', peerName, peerRole, phase: 'placing',
      muted: false, startedAt: null, ringLeft: null, note: null,
    }
    activeRef.current = draft
    setActive(draft)
    setMinimised(false)

    let callId: string | null = null
    try {
      const started = await chatCallService.start(conversationId)
      callId = started.call.call_id
      if (attempt !== attemptRef.current) {
        // Cancelled while the server was still ringing them up.
        void chatCallService.end(callId).catch(() => {})
        return
      }
      callIdRef.current = callId
      setActive((a) => a && { ...a, peerName: started.call.callee_name, peerRole: started.call.callee_role })

      const room = await joinRoom(started.url, started.token)
      if (attempt !== attemptRef.current) return

      setActive((a) => (a && a.phase === 'placing' ? { ...a, phase: 'ringing', ringLeft: started.ring_seconds } : a))
      // They may have answered while we were still connecting.
      if (room.remoteParticipants.size > 0) {
        setActive((a) => (a && a.phase !== 'ended' ? { ...a, phase: 'live', startedAt: Date.now(), ringLeft: null } : a))
      }
    } catch (e) {
      if (attempt !== attemptRef.current) return
      if (callId) void chatCallService.end(callId, 'failed', errorMessage(e, 'connect failed')).catch(() => {})
      finishLocal(errorMessage(e, 'The call could not be placed.'))
    }
  }, [joinRoom, finishLocal])

  // Ring countdown → no answer.
  useEffect(() => {
    if (!active || active.direction !== 'out' || active.phase !== 'ringing' || active.ringLeft == null) return
    if (active.ringLeft <= 0) {
      const id = callIdRef.current
      if (id) void chatCallService.end(id, 'no_answer').catch(() => {})
      finishLocal('No answer.')
      return
    }
    const t = window.setTimeout(() => setActive((a) => a && a.ringLeft != null ? { ...a, ringLeft: a.ringLeft - 1 } : a), 1000)
    return () => window.clearTimeout(t)
  }, [active, finishLocal])

  /* ── Calls coming in ───────────────────────────────────────────────────── */

  const answer = useCallback(async (call: ChatCallView) => {
    if (answering || (activeRef.current && activeRef.current.phase !== 'ended')) return
    setAnswering(call.call_id)
    const attempt = ++attemptRef.current

    let joined = false
    try {
      const { url, token, call: fresh } = await chatCallService.answer(call.call_id)
      joined = true
      dropRinging(call.call_id)
      callIdRef.current = call.call_id
      setMinimised(false)
      setActive({
        direction: 'in', peerName: fresh?.caller_name ?? call.caller_name, peerRole: fresh?.caller_role ?? call.caller_role,
        phase: 'connecting', muted: false, startedAt: null, ringLeft: null, note: null,
      })

      await joinRoom(url, token)
      if (attempt !== attemptRef.current) return
      setActive((a) => (a && a.phase === 'connecting' ? { ...a, phase: 'live', startedAt: Date.now() } : a))
    } catch (e) {
      dropRinging(call.call_id)
      if (attempt !== attemptRef.current) return
      if (joined) void chatCallService.end(call.call_id, 'failed', errorMessage(e, 'connect failed')).catch(() => {})
      attemptRef.current += 1
      teardownRoom()
      setActive({
        direction: 'in', peerName: call.caller_name, peerRole: call.caller_role,
        phase: 'ended', muted: false, startedAt: null, ringLeft: null,
        note: errorMessage(e, 'The call could not be answered.'),
      })
    } finally {
      setAnswering(null)
    }
  }, [answering, dropRinging, joinRoom, teardownRoom])

  const decline = useCallback((call: ChatCallView) => {
    dismissed.current.add(call.call_id)
    dropRinging(call.call_id)
    void chatCallService.decline(call.call_id).catch(() => {})
  }, [dropRinging])

  /* ── On the call ───────────────────────────────────────────────────────── */

  const hangUp = useCallback(() => {
    const a  = activeRef.current
    const id = callIdRef.current
    if (id) void chatCallService.end(id).catch(() => {})
    finishLocal(a?.phase === 'live' ? 'You ended the call.' : 'Call cancelled.')
  }, [finishLocal])

  const toggleMute = useCallback(async () => {
    const room = roomRef.current
    const a    = activeRef.current
    if (!room || !a) return
    const next = !a.muted
    try {
      await room.localParticipant.setMicrophoneEnabled(!next)
      setActive((cur) => cur && { ...cur, muted: next })
    } catch {}
  }, [])

  const closeSheet = useCallback(() => {
    callIdRef.current = null
    setActive(null)
    setMinimised(false)
  }, [])

  // "Call ended" closes by itself after a moment.
  useEffect(() => {
    if (active?.phase !== 'ended') return
    const t = window.setTimeout(closeSheet, ENDED_LINGER_MS)
    return () => window.clearTimeout(t)
  }, [active?.phase, closeSheet])

  /* ── Wiring ────────────────────────────────────────────────────────────── */

  // Live: incoming calls, and the server saying a call was answered, declined or closed.
  useEffect(() => {
    if (!allowed || !userId) return

    chatCallService.ringing().then((calls) => calls.forEach(addRinging)).catch(() => {})

    const idOf = (msg: { [key: string]: unknown }) => (msg.payload as { call_id?: string } | undefined)?.call_id ?? ''

    const channel = supabase
      .channel(`chat-calls:user:${userId}`)
      .on('broadcast', { event: 'chat_call_incoming' }, (msg) => addRinging(msg.payload as ChatCallView))
      // Answered on another of this person's tabs or devices: stop ringing here.
      .on('broadcast', { event: 'chat_call_answered' }, (msg) => dropRinging(idOf(msg)))
      .on('broadcast', { event: 'chat_call_declined' }, (msg) => {
        const id = idOf(msg)
        dropRinging(id)
        if (id && id === callIdRef.current && activeRef.current?.direction === 'out') {
          finishLocal(`${activeRef.current.peerName} declined the call.`)
        }
      })
      .on('broadcast', { event: 'chat_call_closed' }, (msg) => {
        const id = idOf(msg)
        dropRinging(id)
        const a = activeRef.current
        if (id && id === callIdRef.current && a && a.phase !== 'ended') {
          finishLocal(a.phase === 'live' ? `${a.peerName} hung up.` : 'The call ended.')
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [allowed, userId, addRinging, dropRinging, finishLocal])

  // Drop ringers that outlived any real ring, in case a close event was missed.
  useEffect(() => {
    if (ringing.length === 0) return
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - RING_MAX_MS
      setRinging((list) => list.filter((c) => Date.parse(c.created_at) > cutoff))
    }, 5000)
    return () => window.clearInterval(timer)
  }, [ringing.length])

  // Hand the call button its trigger.
  useEffect(() => {
    if (!allowed) return
    setPlaceCall((req) => { void placeCall(req) })
    return () => setPlaceCall(null)
  }, [allowed, placeCall, setPlaceCall])

  const busy = !!active && active.phase !== 'ended'
  useEffect(() => { setInCall(busy || ringing.length > 0) }, [busy, ringing.length, setInCall])

  const ringingNow = !busy ? ringing[0] ?? null : null
  const sheetOpen  = !!ringingNow || (!!active && !minimised)

  useBodyScrollLock(sheetOpen)
  useRingtone(!!ringingNow)
  useTitleFlash(ringingNow ? `Call from ${ringingNow.caller_name}` : null)

  if (!allowed) return null

  return (
    <>
      {/* Remote audio elements live here, out of sight. */}
      <div ref={audioHost} className="hidden" aria-hidden="true" />

      {ringingNow && (
        <CallSheet
          name={ringingNow.caller_name}
          role={ringingNow.caller_role}
          status="Incoming call"
          pulse
          footer={(
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => decline(ringingNow)}
                disabled={!!answering}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#f62626] bg-[#f62626]/20 py-3 text-sm font-bold text-[#f62626] disabled:opacity-50"
              >
                <PhoneOff size={16} /> Decline
              </button>
              <button
                type="button"
                onClick={() => void answer(ringingNow)}
                disabled={!!answering}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#3af626] bg-[#3af626]/20 py-3 text-sm font-bold text-[#3af626] disabled:opacity-60"
              >
                <Phone size={16} /> {answering === ringingNow.call_id ? 'Connecting…' : 'Answer'}
              </button>
            </div>
          )}
        />
      )}

      {active && !minimised && (
        <CallSheet
          name={active.peerName}
          role={active.peerRole}
          status={
            active.phase === 'placing'    ? 'Calling…'
            : active.phase === 'ringing'  ? `Ringing…${active.ringLeft != null ? ` ${active.ringLeft}s` : ''}`
            : active.phase === 'connecting' ? 'Connecting…'
            : active.phase === 'live'     ? null
            : 'Call ended'
          }
          timer={active.phase === 'live' ? active.startedAt : null}
          pulse={active.phase === 'placing' || active.phase === 'ringing'}
          note={active.note}
          onMinimise={active.phase === 'live' ? () => setMinimised(true) : undefined}
          footer={active.phase === 'ended' ? (
            <button
              type="button"
              onClick={closeSheet}
              className="w-full rounded-xl border border-white/15 py-3 text-sm font-bold text-white/80"
            >
              Close
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void toggleMute()}
                disabled={!roomRef.current}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 py-3 text-sm font-bold text-white/80 disabled:opacity-50"
              >
                {active.muted ? <><MicOff size={16} /> Unmute</> : <><Mic size={16} /> Mute</>}
              </button>
              <button
                type="button"
                onClick={hangUp}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#f62626] bg-[#f62626]/20 py-3 text-sm font-bold text-[#f62626]"
              >
                <PhoneOff size={16} /> {active.phase === 'live' ? 'Hang up' : 'Cancel'}
              </button>
            </div>
          )}
        />
      )}

      {active && minimised && active.phase === 'live' && (
        <MiniCallBar
          name={active.peerName}
          startedAt={active.startedAt}
          muted={active.muted}
          onExpand={() => setMinimised(false)}
          onMute={() => void toggleMute()}
          onHangUp={hangUp}
        />
      )}
    </>
  )
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function CallSheet({
  name, role, status, timer = null, pulse = false, note, onMinimise, footer,
}: {
  name:        string
  role:        string
  status:      string | null
  timer?:      number | null
  pulse?:      boolean
  note?:       string | null
  onMinimise?: () => void
  footer:      React.ReactNode
}) {
  const elapsed = useElapsed(timer)

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${name}`}
    >
      <div className="flex w-full max-w-sm max-h-[90dvh] flex-col overflow-hidden rounded-2xl border border-[var(--color-cyan)]/40 bg-[var(--color-surface)] shadow-2xl">
        <div className="flex justify-end px-3 pt-3">
          {onMinimise ? (
            <button
              type="button"
              onClick={onMinimise}
              className="rounded-lg p-2 text-white/50"
              aria-label="Minimise the call"
            >
              <Minimize2 size={16} />
            </button>
          ) : <span className="h-8" />}
        </div>

        <div className="flex min-h-0 flex-col items-center gap-2 overflow-y-auto px-5 pb-5 text-center">
          <div className="relative">
            {pulse && <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-cyan)]/20" />}
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-[var(--color-surface-dark)]">
              <span className="font-card text-xl text-white/80">{initialsOf(name)}</span>
            </div>
          </div>
          <h2 className="ff-body mt-2 max-w-full break-words text-lg font-bold text-white">{name}</h2>
          {role && <p className="ff-body text-xs text-[var(--color-muted)]">{roleLabel(role)}</p>}
          <p className="ff-body text-sm text-[var(--color-cyan)]">{timer ? elapsed : status}</p>
          {note && <p className="ff-body text-xs text-[#ff7a30]">{note}</p>}
        </div>

        <div className="border-t border-white/[0.07] p-4">{footer}</div>
      </div>
    </div>
  )
}

function MiniCallBar({
  name, startedAt, muted, onExpand, onMute, onHangUp,
}: {
  name:      string
  startedAt: number | null
  muted:     boolean
  onExpand:  () => void
  onMute:    () => void
  onHangUp:  () => void
}) {
  const elapsed = useElapsed(startedAt)
  return (
    // Top of the screen, so it never covers the chat bubbles or the message box.
    <div className="fixed left-4 right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-[75] flex items-center gap-2 rounded-2xl border border-[var(--color-cyan)]/40 bg-[var(--color-surface)] px-3 py-2 shadow-2xl sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2">
      <button type="button" onClick={onExpand} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label="Show the call">
        <Maximize2 size={15} className="shrink-0 text-white/50" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{name}</span>
          <span className="block text-[11px] text-[var(--color-cyan)]">On call · {elapsed}</span>
        </span>
      </button>
      <button type="button" onClick={onMute} className="rounded-lg border border-white/15 p-2 text-white/80" aria-label={muted ? 'Unmute' : 'Mute'}>
        {muted ? <MicOff size={16} /> : <Mic size={16} />}
      </button>
      <button type="button" onClick={onHangUp} className="rounded-lg border border-[#f62626] bg-[#f62626]/20 p-2 text-[#f62626]" aria-label="Hang up">
        <PhoneOff size={16} />
      </button>
    </div>
  )
}
