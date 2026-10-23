'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import { Phone, PhoneOff, Mic, MicOff, Minimize2, Maximize2, MapPin, Gauge, Truck } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store/auth.store'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { emergencyCallService, type IncomingCall } from '@/lib/services/emergencyCall.service'

/**
 * The driver's in-app emergency call, on the staff side.
 *
 * Mounted once in the dashboard shell for Operations Managers and Company
 * Administrators. When a driver calls, every rung browser shows a full-screen
 * ringer with the driver's position on a map, so whoever answers already knows
 * where the truck is. The first to press Answer gets the call; the others are
 * told by the server and their ringers close.
 *
 * Decline only silences this browser. The other managers keep ringing, and the
 * driver's phone falls back to a normal call if nobody answers.
 */

const GOOGLE_MAPS_KEY    = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID!

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

/* ── Ringtone ────────────────────────────────────────────────────────────── */

/**
 * A two-tone ring made with Web Audio, so there is no audio file to load. A
 * browser that has not had a click on the page yet may refuse to play it; the
 * ringer is still on screen and the tab title still flashes.
 */
function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const Ctx = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return

    let ctx: AudioContext | null = null
    try { ctx = new Ctx() } catch { return }
    void ctx.resume().catch(() => {})

    const ring = () => {
      if (!ctx || ctx.state !== 'running') return
      const now = ctx.currentTime
      ;[0, 0.45].forEach((offset) => {
        const osc  = ctx!.createOscillator()
        const gain = ctx!.createGain()
        osc.frequency.value = offset === 0 ? 880 : 660
        gain.gain.setValueAtTime(0.0001, now + offset)
        gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.4)
        osc.connect(gain).connect(ctx!.destination)
        osc.start(now + offset)
        osc.stop(now + offset + 0.42)
      })
    }
    ring()
    const timer = window.setInterval(ring, 2000)

    return () => {
      window.clearInterval(timer)
      void ctx?.close().catch(() => {})
    }
  }, [active])
}

/** Flash the tab title so a manager on another tab sees the call. */
function useTitleFlash(text: string | null) {
  useEffect(() => {
    if (!text) return
    const original = document.title
    let on = false
    const timer = window.setInterval(() => {
      on = !on
      document.title = on ? text : original
    }, 1000)
    return () => {
      window.clearInterval(timer)
      document.title = original
    }
  }, [text])
}

function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  if (!startedAt) return '0:00'
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* ── Provider ────────────────────────────────────────────────────────────── */

export default function EmergencyCallProvider() {
  const user   = useAuthStore((s) => s.user)
  const userId = user?.user_id

  const [ringing,   setRinging]   = useState<IncomingCall[]>([])
  const [active,    setActive]    = useState<ActiveCall | null>(null)
  const [answering, setAnswering] = useState<string | null>(null)
  const [ringError, setRingError] = useState<string | null>(null)
  const [minimised, setMinimised] = useState(false)

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
      setMinimised(false)
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

  const ringingNow  = !active ? ringing[0] ?? null : null
  const panelOpen   = !!ringingNow || (!!active && !minimised)

  useBodyScrollLock(panelOpen)
  useRingtone(!!ringingNow)
  useTitleFlash(ringingNow ? 'EMERGENCY CALL' : null)

  if (user?.role !== 'operations_manager' && user?.role !== 'admin') return null

  return (
    <>
      {/* Remote audio elements live here, out of sight. */}
      <div ref={audioHost} className="hidden" aria-hidden="true" />

      {ringingNow && (
        <CallSheet
          call={ringingNow}
          heading="Incoming emergency call"
          extraCount={ringing.length - 1}
          error={ringError}
          footer={(
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => decline(ringingNow)}
                disabled={!!answering}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 py-3 text-sm font-bold text-white/70 disabled:opacity-50"
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
          call={active.call}
          heading={
            active.phase === 'connecting' ? 'Connecting…'
            : active.phase === 'live'     ? 'On call'
            : 'Call ended'
          }
          timer={active.phase === 'live' ? active.startedAt : null}
          error={active.note}
          reportHref={reportHref(user?.role, active.call.report_id)}
          onMinimise={active.phase !== 'ended' ? () => setMinimised(true) : undefined}
          footer={active.phase === 'ended' ? (
            <button
              type="button"
              onClick={() => setActive(null)}
              className="w-full rounded-xl border border-white/15 py-3 text-sm font-bold text-white/80"
            >
              Close
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void toggleMute()}
                disabled={active.phase !== 'live'}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 py-3 text-sm font-bold text-white/80 disabled:opacity-50"
              >
                {active.muted ? <><MicOff size={16} /> Unmute</> : <><Mic size={16} /> Mute</>}
              </button>
              <button
                type="button"
                onClick={hangUp}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#f62626] bg-[#f62626]/20 py-3 text-sm font-bold text-[#f62626]"
              >
                <PhoneOff size={16} /> Hang up
              </button>
            </div>
          )}
        />
      )}

      {active && minimised && active.phase !== 'ended' && (
        <MiniCallBar
          name={active.call.driver_name}
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
  call, heading, extraCount = 0, timer = null, error, reportHref, onMinimise, footer,
}: {
  call:        IncomingCall
  heading:     string
  extraCount?: number
  timer?:      number | null
  error?:      string | null
  reportHref?: string | null
  onMinimise?: () => void
  footer:      React.ReactNode
}) {
  const elapsed = useElapsed(timer)
  const hasFix  = call.latitude != null && call.longitude != null
  const where   = hasFix ? { lat: call.latitude!, lng: call.longitude! } : null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div className="flex w-full max-w-md max-h-[90dvh] flex-col overflow-hidden rounded-2xl border border-[#f62626]/50 bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#f62626]">
              {heading}{timer ? ` · ${elapsed}` : ''}
            </p>
            <h2 className="truncate text-lg font-bold text-white">{call.driver_name}</h2>
            <p className="truncate text-xs text-white/50">
              {call.incident}{call.booking_ref ? ` · ${call.booking_ref}` : ''}
            </p>
          </div>
          {onMinimise && (
            <button
              type="button"
              onClick={onMinimise}
              className="shrink-0 rounded-lg p-2 text-white/50"
              aria-label="Minimise the call"
            >
              <Minimize2 size={16} />
            </button>
          )}
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          <div className="h-44 overflow-hidden rounded-xl border border-white/10 bg-black/30 sm:h-52">
            {where ? (
              <APIProvider apiKey={GOOGLE_MAPS_KEY}>
                <Map
                  mapId={GOOGLE_MAPS_MAP_ID}
                  defaultCenter={where}
                  defaultZoom={15}
                  gestureHandling="cooperative"
                  disableDefaultUI
                  colorScheme="DARK"
                  style={{ width: '100%', height: '100%' }}
                >
                  <AdvancedMarker position={where} />
                </Map>
              </APIProvider>
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-white/40">
                The phone sent no position with this alert.
              </div>
            )}
          </div>

          <ul className="space-y-1.5 text-sm text-white/80">
            {call.address && (
              <li className="flex gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-white/40" /><span className="min-w-0 break-words">{call.address}</span></li>
            )}
            {call.plate_number && (
              <li className="flex gap-2"><Truck size={15} className="mt-0.5 shrink-0 text-white/40" />{call.plate_number}</li>
            )}
            {call.speed_kmh != null && (
              <li className="flex gap-2"><Gauge size={15} className="mt-0.5 shrink-0 text-white/40" />{Math.round(call.speed_kmh)} km/h when the alert was sent</li>
            )}
            {where && (
              <li>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${where.lat},${where.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--color-cyan)]"
                >
                  Open in Google Maps
                </a>
              </li>
            )}
            {reportHref && (
              <li>
                <Link href={reportHref} className="text-xs text-[var(--color-cyan)]">Open the report</Link>
              </li>
            )}
          </ul>

          {extraCount > 0 && (
            <p className="text-xs text-[#ffea00]">
              {extraCount} more emergency {extraCount === 1 ? 'call is' : 'calls are'} waiting.
            </p>
          )}
          {error && <p className="text-xs text-[#ff7a30]">{error}</p>}
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
    <div className="fixed bottom-4 left-4 right-4 z-[80] flex items-center gap-2 rounded-2xl border border-[#f62626]/50 bg-[var(--color-surface)] px-3 py-2 shadow-2xl sm:left-auto sm:w-96">
      <button type="button" onClick={onExpand} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label="Show the call">
        <Maximize2 size={15} className="shrink-0 text-white/50" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{name}</span>
          <span className="block text-[11px] text-[#f62626]">On call · {elapsed}</span>
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
