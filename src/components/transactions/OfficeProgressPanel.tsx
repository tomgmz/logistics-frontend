'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Lock, LockOpen, PackageCheck, Truck, Warehouse } from 'lucide-react'

import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import { tripService, type Trip } from '@/lib/services/admin/trip.service'
import { RemarksModal } from '@/components/layout/ReusableModal'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { PALETTE } from '@/lib/palette'
import { useLiveTable } from '@/lib/hooks/useLiveTable'

const INCIDENTS = [
  { key: 'truck_stolen',   label: 'Truck stolen' },
  { key: 'goods_stolen',   label: 'Goods stolen' },
  { key: 'accident',       label: 'Accident' },
  { key: 'goods_damaged',  label: 'Goods damaged' },
  { key: 'client_refused', label: 'Client refused the delivery' },
  { key: 'other',          label: 'Other' },
] as const

type Step =
  | { kind: 'pickup'; id: string; label: string }
  | { kind: 'stop';   id: string; label: string }
  | { kind: 'return'; id: 'return'; label: string }

/**
 * The office finishing the driver's steps when the driver can't (phone stolen,
 * dead), and recording a problem on the road (truck or goods stolen…).
 * Locked by default, like the crew Edit button: Unlock first, so nobody taps a
 * stop done by accident. Each step asks for a reason, which is kept on the stop
 * and in the audit log. The next pickup in order, and any drop-off not yet
 * recorded on a loaded run (any order, so a swap's leftovers can be cleared).
 */
export default function OfficeProgressPanel({ bookingId, status, fleetReturned, canAct, allowed, onUpdated }: {
  bookingId:     string
  /** Normalised booking status. */
  status:        string
  fleetReturned: boolean
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

  const live = status === 'assigned' || status === 'in_transit'
  const needsReturn = (status === 'delivered' || status === 'completed') && !fleetReturned

  const load = useCallback(() => {
    tripService.getTrips(bookingId).then(setTrips).catch(() => setTrips([]))
  }, [bookingId])
  useEffect(() => { if (live || needsReturn) load() }, [load, live, needsReturn, status])
  // Live: each drop-off the driver confirms moves the next step, so the office
  // never acts on a step that is already done.
  useLiveTable(['live:bookings'], load, { enabled: live || needsReturn })

  if (!canAct || (!live && !needsReturn)) return null

  // The next pickup, the vehicle's return, and any open drop-off on a loaded run.
  const steps: Step[] = []
  if (needsReturn) {
    steps.push({ kind: 'return', id: 'return', label: 'Vehicle is back at the yard' })
  } else {
    const current = [...trips].sort((a, b) => a.trip_number - b.trip_number)
      .find((t) => t.status !== 'completed' && t.status !== 'cancelled')
    if (current?.status === 'pending') {
      steps.push({ kind: 'pickup', id: current.trip_id, label: `Loaded at pickup (trip ${current.trip_number} of ${trips.length})` })
    }
    // Every drop-off not yet recorded on a loaded run, in any order (user
    // 2026-11-11): after a driver swap the office may need to record stop 4
    // before stop 2. The server only needs the run loaded.
    const multi = trips.length > 1
    for (const t of [...trips].sort((a, b) => a.trip_number - b.trip_number)) {
      if (t.status !== 'in_transit') continue
      for (const s of t.booking_trip_stops ?? []) {
        if (s.status !== 'pending') continue
        steps.push({
          kind: 'stop', id: s.trip_stop_id,
          label: `Delivered: ${s.booking_destinations?.address ?? 'drop-off'}${multi ? ` (trip ${t.trip_number})` : ''}`,
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

  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left'
  const locked = !unlocked || busy

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PackageCheck size={16} className="text-white/60 shrink-0" />
          <h3 className="text-sm font-bold text-white">Complete for the driver</h3>
        </div>
        <button
          type="button"
          onClick={() => setUnlocked((v) => !v)}
          aria-pressed={unlocked}
          {...writeAccess(allowed)}
          className="inline-flex items-center gap-1 shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={unlocked
            ? { borderColor: 'rgba(77,249,237,0.45)', color: 'var(--color-cyan)', background: 'rgba(77,249,237,0.10)' }
            : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
        >
          {unlocked ? <LockOpen size={11} /> : <Lock size={11} />}
          {unlocked ? 'Lock' : 'Unlock'}
        </button>
      </div>
      <p className="text-[11px] text-white/50">
        Use only when the driver can&apos;t (phone stolen, lost or dead). No photo or location is recorded; your reason is kept on the stop and in the audit log.
      </p>

      {steps.length > 0 ? (
        <div className="flex flex-col gap-2">
          {steps.map((s) => (
            <button key={s.id} type="button" disabled={locked} onClick={() => setStep(s)} {...writeAccess(allowed)}
              className={`${btn} border border-white/15 text-white/85 [@media(hover:hover)]:hover:text-white`}>
              {s.kind === 'return' ? <Warehouse size={13} className="shrink-0" />
                : s.kind === 'pickup' ? <Truck size={13} className="shrink-0" />
                : <CheckCircle2 size={13} className="shrink-0" />}
              <span className="min-w-0 break-words">{s.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-white/40">Nothing to confirm right now.</p>
      )}

      {status === 'in_transit' && openStops && (
        <button type="button" disabled={locked} onClick={() => setIncident(true)} {...writeAccess(allowed)}
          className={`${btn} w-fit`} style={{ background: PALETTE.red, color: '#fff' }}>
          <AlertTriangle size={13} /> Report a problem
        </button>
      )}

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
