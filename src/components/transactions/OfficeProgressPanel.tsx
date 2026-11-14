'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Lock, LockOpen } from 'lucide-react'

import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import { tripService, type Trip } from '@/lib/services/admin/trip.service'
import { RemarksModal } from '@/components/layout/ReusableModal'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { PALETTE } from '@/lib/palette'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { AssetIcon, CARD_CLASS, InfoTip, MUTED, TEAL_BUTTON_CLASS, TEAL_BUTTON_STYLE } from '@/app/admin/booking-management/BookingDetailParts'
import { formatDateTime } from './transaction-format'
import { usePanelSection } from '@/components/ui/PanelReady'

const INCIDENTS = [
  { key: 'truck_stolen',   label: 'Truck stolen' },
  { key: 'goods_stolen',   label: 'Goods stolen' },
  { key: 'accident',       label: 'Accident' },
  { key: 'goods_damaged',  label: 'Goods damaged' },
  { key: 'client_refused', label: 'Client refused the delivery' },
  { key: 'other',          label: 'Other' },
] as const

type Step =
  | { kind: 'pickup'; id: string; label: string; place: string }
  | { kind: 'stop';   id: string; label: string; place: string }
  | { kind: 'return'; id: 'return'; label: string; place: string }

/** What the driver does at each kind of place (the Activity picker). */
const ACTIVITY: Record<Step['kind'], string> = {
  pickup: 'Loaded at pickup',
  stop:   'Delivered',
  return: 'Vehicle is back at the yard',
}

/** One row of the booking's road events (GET /admin/assignments/:id/events). */
interface RoadEvent { at: string; kind: string; title: string; detail: string | null; by: string | null }

/**
 * The office finishing the driver's steps when the driver can't (phone stolen,
 * dead), and recording a problem on the road (truck or goods stolen…).
 * Locked by default, like the crew Edit button: Unlock first, so nobody taps a
 * stop done by accident. Each step asks for a reason, which is kept on the stop
 * and in the audit log. The next pickup in order, and any drop-off not yet
 * recorded on a loaded run (any order, so a swap's leftovers can be cleared).
 */
export default function OfficeProgressPanel({ bookingId, status, fleetReturned, paused = false, canAct, allowed, onUpdated }: {
  bookingId:     string
  /** Normalised booking status. */
  status:        string
  fleetReturned: boolean
  /** An open pause: shown as the transit status. */
  paused?:       boolean
  /** Operations Manager / Company Administrator, and nobody else is editing the booking. */
  canAct:        boolean
  /** The Booking Management tier allows it. Read Only sees the buttons disabled. */
  allowed:       boolean
  onUpdated:     () => void
}) {
  const [trips,    setTrips]    = useState<Trip[]>([])
  const [unlocked, setUnlocked] = useState(false)
  const [step,     setStep]     = useState<Step | null>(null)
  const [incident, setIncident] = useState(false)
  const [type,     setType]     = useState<(typeof INCIDENTS)[number]['key']>('truck_stolen')
  const [busy,     setBusy]     = useState(false)
  // The Location / Activity pickers (Figma 2026-11-14): a step, then what was done there.
  const [placeId,  setPlaceId]  = useState('')
  const [activity, setActivity] = useState('')
  const [office,   setOffice]   = useState<RoadEvent[]>([])
  const [showEarlier, setShowEarlier] = useState(false)

  // Not on an Assigned booking (user 2026-11-13): the delivery starts only when
  // the driver presses Start Navigation. Before that, a driver without a phone
  // signs in on another one, or the office assigns another driver.
  const live = status === 'in_transit'
  // A Failed booking (nothing delivered) still has a vehicle to bring back,
  // unless it was stolen (then the office records it when settled).
  const needsReturn = (status === 'delivered' || status === 'completed' || status === 'failed') && !fleetReturned

  const [loaded, setLoaded] = useState(false)
  usePanelSection((live || needsReturn) && !loaded)
  const load = useCallback(() => {
    tripService.getTrips(bookingId).then(setTrips).catch(() => setTrips([])).finally(() => setLoaded(true))
    // "Earlier updates": the steps the office already recorded for the driver.
    proxyApi.get<{ data: RoadEvent[] }>(`/admin/assignments/${bookingId}/events`)
      .then(({ data }) => setOffice((data.data ?? []).filter((e) => e.by === 'The office').reverse()))
      .catch(() => {})
  }, [bookingId])
  useEffect(() => { if (live || needsReturn) load() }, [load, live, needsReturn, status])
  // Live: each drop-off the driver confirms moves the next step, so the office
  // never acts on a step that is already done.
  useLiveTable(['live:bookings'], load, { enabled: live || needsReturn })

  if (!canAct || (!live && !needsReturn)) return null

  // The next pickup, the vehicle's return, and any open drop-off on a loaded run.
  const steps: Step[] = []
  if (needsReturn) {
    steps.push({ kind: 'return', id: 'return', label: 'Vehicle is back at the yard', place: 'The yard (vehicle return)' })
  } else {
    const current = [...trips].sort((a, b) => a.trip_number - b.trip_number)
      .find((t) => t.status !== 'completed' && t.status !== 'cancelled')
    if (current?.status === 'pending') {
      steps.push({
        kind: 'pickup', id: current.trip_id,
        label: `Loaded at pickup (trip ${current.trip_number} of ${trips.length})`,
        place: `Pickup · trip ${current.trip_number} of ${trips.length}`,
      })
    }
    // Every drop-off not yet recorded on a loaded run, in any order (user
    // 2026-11-11): after a driver swap the office may need to record stop 4
    // before stop 2. The server only needs the run loaded.
    const multi = trips.length > 1
    for (const t of [...trips].sort((a, b) => a.trip_number - b.trip_number)) {
      if (t.status !== 'in_transit') continue
      for (const s of t.booking_trip_stops ?? []) {
        if (s.status !== 'pending') continue
        const where = s.booking_destinations?.address ?? 'drop-off'
        const n = s.booking_destinations?.sequence_order
        steps.push({
          kind: 'stop', id: s.trip_stop_id,
          label: `Delivered: ${where}${multi ? ` (trip ${t.trip_number})` : ''}`,
          place: `Drop-off${n != null ? ` ${n}` : ''} · ${where}${multi ? ` (trip ${t.trip_number})` : ''}`,
        })
      }
    }
  }
  const openStops = trips.some((t) => (t.booking_trip_stops ?? []).some((s) => s.status === 'pending'))

  async function confirm(reason: string) {
    if (!step) return
    setBusy(true)
    try {
      await initCsrf()
      const base = `/admin/assignments/${bookingId}/office`
      const url = step.kind === 'pickup' ? `${base}/trips/${step.id}/pickup`
        : step.kind === 'stop' ? `${base}/trip-stops/${step.id}/delivered`
        : `${base}/fleet-return`
      await proxyApi.post(url, { reason })
      appToast.success('Step confirmed for the driver.')
      setStep(null)
      setPlaceId('')
      setActivity('')
      load()
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not confirm this step.'))
    } finally {
      setBusy(false)
    }
  }

  async function report(note: string) {
    setBusy(true)
    try {
      await initCsrf()
      await proxyApi.post(`/admin/assignments/${bookingId}/office/incident`, { incident_type: type, note })
      appToast.success('Problem recorded. The open drop-offs were marked failed and the client was told.')
      setIncident(false)
      load()
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not record the problem.'))
    } finally {
      setBusy(false)
    }
  }

  const locked = !unlocked || busy
  const picked = steps.find((x) => x.id === placeId) ?? null
  const activities = picked ? [ACTIVITY[picked.kind]] : []
  const transitStatus = paused ? 'Paused'
    : status === 'in_transit' ? 'On the road'
    : status === 'failed' ? 'Failed, vehicle not back yet'
    : 'Delivered, vehicle not back yet'
  // Locked: everything greyed (Figma "pick up locked"); unlocked: orange labels.
  const labelColor = unlocked ? PALETTE.orange : MUTED
  const selectClass = 'w-full min-h-[46px] rounded-[10px] border border-[#424242] bg-[#141414] px-3 text-sm font-bold text-white ' +
    'disabled:opacity-60 disabled:cursor-not-allowed [color-scheme:dark]'

  function save() {
    if (!picked || !activity) {
      appToast.error('Pick the location and the activity first.')
      return
    }
    setStep(picked)
  }

  // Figma "complete for the driver" (2026-11-14): Location + Activity, Save
  // transit update, earlier updates, "The delivery failed?", Unlock / Lock.
  return (
    <div className={`${CARD_CLASS} px-3.5 sm:px-4 pt-3 pb-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <AssetIcon name="steering-wheel" />
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white leading-tight">Complete for the driver</h3>
            <p className="text-xs font-bold leading-tight mt-0.5">
              <span style={{ color: PALETTE.orange }}>Transit status:</span>{' '}
              <span className="text-white">{transitStatus}</span>
            </p>
          </div>
        </div>
        <InfoTip text="Use only when the driver can't (phone stolen, lost or dead). No photo or location is recorded; your reason is kept on the stop and in the audit log." />
      </div>

      <p className="text-sm font-bold" style={{ color: unlocked ? '#ffffff' : MUTED }}>Complete a driver activity time stamp?</p>
      {steps.length > 0 ? (
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 min-w-0">
            <span className="text-sm font-bold" style={{ color: labelColor }}>Location</span>
            <select value={placeId} disabled={locked} {...writeAccess(allowed)}
              onChange={(e) => {
                setPlaceId(e.target.value)
                const next = steps.find((x) => x.id === e.target.value)
                setActivity(next ? ACTIVITY[next.kind] : '')
              }}
              className={selectClass}>
              <option value="" disabled>Choose</option>
              {steps.map((x) => <option key={x.id} value={x.id}>{x.place}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 min-w-0">
            <span className="text-sm font-bold" style={{ color: labelColor }}>Activity</span>
            <select value={activity} disabled={locked || !picked} {...writeAccess(allowed)}
              onChange={(e) => setActivity(e.target.value)}
              className={selectClass}>
              <option value="" disabled>{picked ? 'Choose' : ''}</option>
              {activities.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <p className="text-sm font-bold" style={{ color: MUTED }}>Nothing to record right now.</p>
      )}

      {unlocked && steps.length > 0 && (
        <button type="button" disabled={busy || !picked || !activity} onClick={save} {...writeAccess(allowed)}
          className={`${TEAL_BUTTON_CLASS} min-h-[56px] text-lg`}
          style={{ background: '#4a3020', borderColor: PALETTE.orange, color: PALETTE.orange }}>
          Save transit update
        </button>
      )}

      {office.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowEarlier((v) => !v)} aria-expanded={showEarlier}
            className="inline-flex items-center gap-1 text-base font-bold cursor-pointer"
            style={{ color: unlocked ? PALETTE.cyan : MUTED }}>
            Earlier updates ({office.length})
            <ChevronDown size={16} className={`transition-transform ${showEarlier ? 'rotate-180' : ''}`} />
          </button>
          {showEarlier && (
            <ul className="mt-2 flex flex-col">
              {office.map((e, i) => (
                <li key={`${e.at}-${i}`} className="py-2 border-b border-dashed border-[#818181]/60 last:border-b-0">
                  <p className="text-xs font-bold text-white break-words">{e.title}{e.detail ? ` · ${e.detail}` : ''}</p>
                  <p className="text-xs font-bold" style={{ color: MUTED }}>{formatDateTime(e.at)} · By: the office</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {status === 'in_transit' && openStops && (
        <>
          <div aria-hidden className="border-t border-[#424242]" />
          <div className="rounded-[10px] border px-3.5 pt-2.5 pb-3.5 flex flex-col gap-3"
            style={unlocked
              ? { borderColor: PALETTE.red, background: '#2a0606' }
              : { borderColor: '#424242', background: '#2a2828' }}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-base font-bold" style={{ color: unlocked ? PALETTE.red : MUTED }}>The delivery failed?</p>
              <InfoTip text="Truck or goods stolen, an accident, goods damaged, or the client refused: every drop-off not yet delivered is marked failed and the client and the office are told. This can't be undone." />
            </div>
            <button type="button" disabled={locked} onClick={() => setIncident(true)} {...writeAccess(allowed)}
              className={`${TEAL_BUTTON_CLASS} min-h-[56px] text-lg`}
              style={unlocked
                ? { background: '#5a0e0e', borderColor: PALETTE.red, color: PALETTE.red }
                : { background: 'transparent', borderColor: MUTED, color: MUTED }}>
              Report a problem
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => { setUnlocked((v) => !v); setPlaceId(''); setActivity('') }}
        aria-pressed={unlocked}
        {...writeAccess(allowed)}
        className={`${TEAL_BUTTON_CLASS} min-h-[40px]`}
        style={TEAL_BUTTON_STYLE}
      >
        {unlocked ? <Lock size={16} /> : <LockOpen size={16} />}
        {unlocked ? 'Lock' : 'Unlock'}
      </button>

      <RemarksModal
        open={!!step}
        tone="approve"
        title="Confirm for the driver?"
        description={step ? `${step.label}. This is recorded as done by the office, not the driver.` : ''}
        remarksLabel="Reason"
        remarksPlaceholder="e.g. Driver's phone was stolen; the client confirmed receipt by phone."
        confirmLabel={busy ? 'Saving…' : 'Confirm'}
        cancelLabel="Cancel"
        busy={busy}
        disableBackdropClose={busy}
        onConfirm={(text) => { void confirm(text) }}
        onCancel={() => { if (!busy) setStep(null) }}
      />

      <RemarksModal
        open={incident}
        tone="danger"
        title="Report a problem on this delivery?"
        description="Every drop-off not yet delivered is marked failed. The client and the office are told. This can't be undone."
        remarksLabel="What happened"
        remarksPlaceholder="e.g. Truck taken at gunpoint on NLEX near Bocaue; police report filed."
        confirmLabel={busy ? 'Saving…' : 'Record problem'}
        cancelLabel="Cancel"
        busy={busy}
        disableBackdropClose={busy}
        onConfirm={(text) => { void report(text) }}
        onCancel={() => { if (!busy) setIncident(false) }}
      >
        <label className="mt-3 block text-xs font-bold text-white/70">
          Problem
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-white/15 bg-[#0a0a0a] px-3 text-sm text-white"
            style={{ colorScheme: 'dark' }}
          >
            {INCIDENTS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
          </select>
        </label>
      </RemarksModal>
    </div>
  )
}
