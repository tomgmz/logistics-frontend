'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client'
import { Phone, PhoneIncoming, PhoneOff, Mic, MicOff } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store/auth.store'
import { useChatCallStore, type CallRequest } from '@/lib/store/chatCall.store'
import { chatCallService, type ChatCallView } from '@/lib/services/chatCall.service'
import { roleLabel } from '@/lib/roles'
import { appToast } from '@/lib/toast'
import { useRingtone, useTitleFlash, useElapsed } from './callHooks'
import { CallAlert, CallCircleButton } from './CallAlert'

/**
 * Voice calls from Messages, one person to one person.
 *
 * Mounted once per page tree (the dashboard shell and the /messages layout) for
 * everyone except clients. It places calls for the chat headers' call button
 * (through useChatCallStore), rings this browser when someone calls, and runs
 * the call itself: mute, hang up. All of it shows as a floating alert
 * (CallAlert), never a pop-up over the page.
 *
 * The caller joins the LiveKit room as soon as the call is placed; the call is
 * live when the other person joins it. The caller's ring timer decides "no
 * answer". The emergency ringer (EmergencyCallProvider) is separate and stacks
 * above this one.
 */

/** A ringer older than this is dropped even if no close event arrived. */
const RING_MAX_MS = 75_000
/** How long "Call ended" stays up before the sheet closes by itself. */
const ENDED_LINGER_MS = 4_000

type Phase = 'placing' | 'ringing' | 'connecting' | 'live' | 'ended'

interface ActiveCall {
  direction: 'out' | 'in'
  conversationId: string
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

export default function ChatCallProvider() {
  const user    = useAuthStore((s) => s.user)
  const userId  = user?.user_id
  const allowed = !!userId && user?.role !== 'client'

  const setPlaceCall = useChatCallStore((s) => s.setPlaceCall)
  const setInCall    = useChatCallStore((s) => s.setInCall)

  const [ringing,   setRinging]   = useState<ChatCallView[]>([])
  const [active,    setActive]    = useState<ActiveCall | null>(null)
  const [answering, setAnswering] = useState<string | null>(null)

  const roomRef    = useRef<Room | null>(null)
  const audioHost  = useRef<HTMLDivElement | null>(null)
  const dismissed  = useRef<Set<string>>(new Set())
  const activeRef  = useRef<ActiveCall | null>(null)
  const callIdRef  = useRef<string | null>(null)
  // Bumped whenever the current attempt is abandoned (hang up, decline, close),
  // so an await that finishes afterwards knows its call is no longer wanted.
  const attemptRef = useRef(0)

  const ringingRef = useRef<ChatCallView[]>([])

  useEffect(() => { activeRef.current = active }, [active])
  useEffect(() => { ringingRef.current = ringing }, [ringing])

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
    const current = activeRef.current && activeRef.current.phase !== 'ended' ? activeRef.current : null
    const ringIn  = ringingRef.current
    // Already on a call with them (or they are ringing us): never a second call.
    if (current?.conversationId === conversationId || ringIn.some((c) => c.conversation_id === conversationId)) return
    if (current || ringIn.length > 0) {
      appToast.error(`You can't call ${peerName} because you are currently on a call.`, { action: 'chat-call-busy' })
      return
    }
    const attempt = ++attemptRef.current
    callIdRef.current = null
    const draft: ActiveCall = {
      direction: 'out', conversationId, peerName, peerRole, phase: 'placing',
      muted: false, startedAt: null, ringLeft: null, note: null,
    }
    activeRef.current = draft
    setActive(draft)

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
      // Busy (either end already on a call): say so and drop the alert.
      if (!callId && (e as { response?: { status?: number } } | null)?.response?.status === 409) {
        attemptRef.current += 1
        teardownRoom()
        setActive(null)
        appToast.error(errorMessage(e, `${peerName} is currently on a call with someone else.`), { action: 'chat-call-busy' })
        return
      }
      finishLocal(errorMessage(e, 'The call could not be placed.'))
    }
  }, [joinRoom, finishLocal, teardownRoom])

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
      setActive({
        direction: 'in', conversationId: call.conversation_id, peerName: fresh?.caller_name ?? call.caller_name, peerRole: fresh?.caller_role ?? call.caller_role,
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
        direction: 'in', conversationId: call.conversation_id, peerName: call.caller_name, peerRole: call.caller_role,
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
  const callConversationId = busy ? active.conversationId : ringing[0]?.conversation_id ?? null
  useEffect(() => { setInCall(busy || ringing.length > 0, callConversationId) }, [busy, ringing.length, callConversationId, setInCall])

  const ringingNow = !busy ? ringing[0] ?? null : null
  const elapsed    = useElapsed(active?.phase === 'live' ? active.startedAt : null)

  useRingtone(!!ringingNow)
  useTitleFlash(ringingNow ? `Call from ${ringingNow.caller_name}` : null)

  if (!allowed) return null

  return (
    <>
      {/* Remote audio elements live here, out of sight. */}
      <div ref={audioHost} className="hidden" aria-hidden="true" />

      {ringingNow && (
        <CallAlert
          color="brand"
          icon={PhoneIncoming}
          label={`Incoming call from ${ringingNow.caller_name}`}
          title={ringingNow.caller_name}
          description={<p>Incoming call{ringingNow.caller_role ? ` · ${roleLabel(ringingNow.caller_role)}` : ''}</p>}
          pulse
          actions={(
            <>
              <CallCircleButton
                kind="answer"
                icon={Phone}
                label={answering === ringingNow.call_id ? 'Connecting…' : 'Answer'}
                onClick={() => void answer(ringingNow)}
                disabled={!!answering}
                busy={answering === ringingNow.call_id}
              />
              <CallCircleButton
                kind="decline"
                icon={PhoneOff}
                label="Decline"
                onClick={() => decline(ringingNow)}
                disabled={!!answering}
              />
            </>
          )}
        />
      )}

      {active && (
        <CallAlert
          color="brand"
          icon={Phone}
          label={`Call with ${active.peerName}`}
          title={active.peerName}
          pulse={active.phase === 'placing' || active.phase === 'ringing'}
          description={(
            <>
              <p>
                {active.phase === 'placing'      ? 'Calling…'
                : active.phase === 'ringing'     ? `Ringing…${active.ringLeft != null ? ` ${active.ringLeft}s` : ''}`
                : active.phase === 'connecting'  ? 'Connecting…'
                : active.phase === 'live'        ? `On call · ${elapsed}`
                : 'Call ended'}
                {active.peerRole ? ` · ${roleLabel(active.peerRole)}` : ''}
              </p>
              {active.note && <p className="text-[#ff7a30]">{active.note}</p>}
            </>
          )}
          onClose={active.phase === 'ended' ? closeSheet : undefined}
          actions={active.phase === 'ended' ? undefined : (
            <>
              <CallCircleButton
                kind="plain"
                icon={active.muted ? MicOff : Mic}
                label={active.muted ? 'Unmute' : 'Mute'}
                onClick={() => void toggleMute()}
                disabled={!roomRef.current}
              />
              <CallCircleButton
                kind="decline"
                icon={PhoneOff}
                label={active.phase === 'live' ? 'Hang up' : 'Cancel'}
                onClick={hangUp}
              />
            </>
          )}
        />
      )}
    </>
  )
}
