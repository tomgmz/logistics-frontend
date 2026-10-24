'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client'
import { AlertCircle, Phone, PhoneOff, Mic, MicOff } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store/auth.store'
import { emergencyCallService, type IncomingCall } from '@/lib/services/emergencyCall.service'
import { useRingtone, useTitleFlash, useElapsed } from './callHooks'
import { CallAlert, CallCircleButton } from './CallAlert'

/**
 * The driver's in-app emergency call, on the staff side.
 *
 * Mounted once in the dashboard shell for Operations Managers and Company
 * Administrators. When a driver calls, every rung browser shows a red floating
 * alert (CallAlert) with the incident, where the truck is and a Google Maps
 * link, so whoever answers already knows where it is. The first to press
 * Answer gets the call; the others are told by the server and their ringers
 * close.
 *
 * Decline only silences this browser. The other managers keep ringing, and the
 * driver's phone falls back to a normal call if nobody answers.
 */

/** A ringer older than this is dropped even if no close event arrived. */
const RING_MAX_MS = 90_000

type CallPhase = 'connecting' | 'live' | 'ended'

interface ActiveCall {
  call:      IncomingCall
  phase:     CallPhase
  muted:     boolean
  startedAt: number | null
  note:      string | null
}

function reportHref(role: string | undefined, reportId: string | null): string | null {
  if (!reportId) return null
  const base = role === 'operations_manager' ? '/operations_admin/reports' : '/admin/reports'
  return `${base}?report=${encodeURIComponent(reportId)}`
}

function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { message?: string } }; message?: string } | null
  return err?.response?.data?.message ?? err?.message ?? fallback
}

/* ── Provider ────────────────────────────────────────────────────────────── */

export default function EmergencyCallProvider() {
  const user   = useAuthStore((s) => s.user)
  const userId = user?.user_id

  const [ringing,   setRinging]   = useState<IncomingCall[]>([])
  const [active,    setActive]    = useState<ActiveCall | null>(null)
  const [answering, setAnswering] = useState<string | null>(null)
  const [ringError, setRingError] = useState<string | null>(null)

  const roomRef     = useRef<Room | null>(null)
  const audioHost   = useRef<HTMLDivElement | null>(null)
  const dismissed   = useRef<Set<string>>(new Set())

  const dropRinging = useCallback((callId: string) => {
    setRinging((list) => list.filter((c) => c.call_id !== callId))
  }, [])

  const addRinging = useCallback((call: IncomingCall) => {
    if (!call?.call_id || dismissed.current.has(call.call_id)) return
    setRinging((list) => (list.some((c) => c.call_id === call.call_id) ? list : [call, ...list]))
  }, [])

  // Live: incoming calls, and the server saying a call was taken or closed.
  useEffect(() => {
    if (!userId) return

    emergencyCallService.ringing().then((calls) => calls.forEach(addRinging)).catch(() => {})

    const channel = supabase
      .channel(`calls:user:${userId}`)
      .on('broadcast', { event: 'incoming_call' }, (msg) => addRinging(msg.payload as IncomingCall))
      .on('broadcast', { event: 'call_taken' },  (msg) => dropRinging((msg.payload as { call_id: string }).call_id))
      .on('broadcast', { event: 'call_closed' }, (msg) => dropRinging((msg.payload as { call_id: string }).call_id))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, addRinging, dropRinging])

  // Drop ringers that outlived any real ring, in case a close event was missed.
  useEffect(() => {
    if (ringing.length === 0) return
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - RING_MAX_MS
      setRinging((list) => list.filter((c) => Date.parse(c.created_at) > cutoff))
    }, 5000)
    return () => window.clearInterval(timer)
  }, [ringing.length])

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

  const endedBy = useCallback((note: string) => {
    teardownRoom()
    setActive((a) => (a ? { ...a, phase: 'ended', note } : a))
  }, [teardownRoom])

  const answer = useCallback(async (call: IncomingCall) => {
    if (answering || active) return
    setAnswering(call.call_id)
    setRingError(null)

    try {
      const { url, token, call: fresh } = await emergencyCallService.answer(call.call_id)
      dropRinging(call.call_id)
      setActive({ call: fresh ?? call, phase: 'connecting', muted: false, startedAt: null, note: null })

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
      room.on(RoomEvent.ParticipantDisconnected, () => endedBy('The driver hung up.'))
      room.on(RoomEvent.Disconnected, () => endedBy('The call ended.'))

      await room.connect(url, token)
      // Inside the Answer click, so Safari lets the driver's audio play.
      await room.startAudio().catch(() => {})
      try {
        await room.localParticipant.setMicrophoneEnabled(true)
      } catch {
        setActive((a) => a && { ...a, note: 'Your microphone is blocked. Allow it in the browser to be heard.' })
      }

      setActive((a) => a && { ...a, phase: 'live', startedAt: Date.now() })
    } catch (e) {
      teardownRoom()
      dropRinging(call.call_id)
      setActive(null)
      setRingError(errorMessage(e, 'The call could not be answered.'))
    } finally {
      setAnswering(null)
    }
  }, [answering, active, dropRinging, endedBy, teardownRoom])

  const decline = useCallback((call: IncomingCall) => {
    dismissed.current.add(call.call_id)
    dropRinging(call.call_id)
  }, [dropRinging])

  const hangUp = useCallback(() => {
    const callId = active?.call.call_id
    teardownRoom()
    setActive((a) => (a ? { ...a, phase: 'ended', note: 'You ended the call.' } : a))
    if (callId) void emergencyCallService.end(callId).catch(() => {})
  }, [active, teardownRoom])

  const toggleMute = useCallback(async () => {
    const room = roomRef.current
    if (!room || !active) return
    const next = !active.muted
    try {
      await room.localParticipant.setMicrophoneEnabled(!next)
      setActive((a) => a && { ...a, muted: next })
    } catch {}
  }, [active])

  const ringingNow = !active ? ringing[0] ?? null : null
  const elapsed    = useElapsed(active?.phase === 'live' ? active.startedAt : null)

  useRingtone(!!ringingNow)
  useTitleFlash(ringingNow ? 'EMERGENCY CALL' : null)

  if (user?.role !== 'operations_manager' && user?.role !== 'admin') return null

  return (
    <>
      {/* Remote audio elements live here, out of sight. */}
      <div ref={audioHost} className="hidden" aria-hidden="true" />

      {ringingNow && (
        <CallAlert
          color="error"
          icon={AlertCircle}
          priority
          pulse
          label={`Emergency call from ${ringingNow.driver_name}`}
          title={`Emergency call · ${ringingNow.driver_name}`}
          description={(
            <>
              <CallDetails call={ringingNow} />
              {ringing.length > 1 && (
                <p className="text-[#ffea00]">
                  {ringing.length - 1} more emergency {ringing.length === 2 ? 'call is' : 'calls are'} waiting.
                </p>
              )}
              {ringError && <p className="text-[#ff7a30]">{ringError}</p>}
            </>
          )}
          links={<CallLinks call={ringingNow} />}
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
          color="error"
          icon={AlertCircle}
          priority
          label={`Emergency call with ${active.call.driver_name}`}
          title={`${
            active.phase === 'connecting' ? 'Connecting…'
            : active.phase === 'live'     ? `On call · ${elapsed}`
            : 'Call ended'
          } · ${active.call.driver_name}`}
          description={(
            <>
              <CallDetails call={active.call} />
              {active.note && <p className="text-[#ff7a30]">{active.note}</p>}
            </>
          )}
          links={<CallLinks call={active.call} reportHref={reportHref(user?.role, active.call.report_id)} />}
          onClose={active.phase === 'ended' ? () => setActive(null) : undefined}
          actions={active.phase === 'ended' ? undefined : (
            <>
              <CallCircleButton
                kind="plain"
                icon={active.muted ? MicOff : Mic}
                label={active.muted ? 'Unmute' : 'Mute'}
                onClick={() => void toggleMute()}
                disabled={active.phase !== 'live'}
              />
              <CallCircleButton kind="decline" icon={PhoneOff} label="Hang up" onClick={hangUp} />
            </>
          )}
        />
      )}
    </>
  )
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function CallDetails({ call }: { call: IncomingCall }) {
  const facts = [
    call.plate_number,
    call.speed_kmh != null ? `${Math.round(call.speed_kmh)} km/h` : null,
  ].filter(Boolean).join(' · ')
  return (
    <>
      <p>{call.incident}{call.booking_ref ? ` · ${call.booking_ref}` : ''}</p>
      {call.address && <p className="break-words">{call.address}</p>}
      {facts && <p>{facts}</p>}
    </>
  )
}

function CallLinks({ call, reportHref }: { call: IncomingCall; reportHref?: string | null }) {
  const hasFix = call.latitude != null && call.longitude != null
  if (!hasFix && !reportHref) return null
  return (
    <>
      {hasFix && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${call.latitude},${call.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="text-[#f62626]"
        >
          Open in Google Maps
        </a>
      )}
      {reportHref && <Link href={reportHref} className="text-white/80">Open the report</Link>}
    </>
  )
}
