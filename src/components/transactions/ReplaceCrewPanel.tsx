'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, Repeat, X } from 'lucide-react'

import {
  assignmentService,
  type CrewReplacement,
} from '@/lib/services/admin/assignment.service'
import type { DriverUser } from '@/app/types/admin/user-management.types'
import { isAssignable, type Truck } from '@/app/types/truck.types'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { formatDateTime } from './transaction-format'
import { PALETTE } from '@/lib/palette'
import { BORDER_C, CYAN, MUTED } from './transaction-theme'

const ORANGE = PALETTE.orange

/**
 * Replacing the crew of a delivery that is already on the road.
 *
 * Once the driver has started, the ordinary "Change vehicle and driver" is gone:
 * re-assigning would wipe who did the pickup and send a loaded truck back to
 * "assigned". When something goes wrong out there the driver pauses the
 * delivery, and this is how the office sends a different driver, a different
 * vehicle, or both — the booking stays in transit, every proof stays with the
 * driver who took it, and the new crew continues from where it stopped. If the
 * load is on a vehicle being replaced, the new driver must confirm moving it
 * across, with a photo, before any drop-off.
 *
 * Also lists every replacement made on the booking (any status), so who drove
 * which part stays readable. Renders nothing when there is neither.
 */

type Person = { driver_id: string; users: { first_name: string | null; last_name: string | null } | null } | null

const nameOf = (p: Person | { first_name: string | null; last_name: string | null } | null) => {
  const u = p && 'users' in p ? p.users : p
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() || null
}

export default function ReplaceCrewPanel({
  bookingId, reference, inTransit, paused, canReplace, drivers, trucks,
  currentDriverId, currentSecondDriverId, currentTruckId, onReplaced,
}: {
  bookingId:              string
  reference:              string | null
  inTransit:              boolean
  /** An open pause — the only time the crew may be replaced. */
  paused:                 boolean
  /** Operations Manager / Company Administrator with booking edit rights. */
  canReplace:             boolean
  drivers:                DriverUser[]
  trucks:                 Truck[]
  currentDriverId:        string | null
  currentSecondDriverId:  string | null
  currentTruckId:         string | null
  onReplaced:             () => void
}) {
  const [history, setHistory] = useState<CrewReplacement[]>([])
  const [showHistory, setShowHistory] = useState(true)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [driverId, setDriverId] = useState('')
  const [secondId, setSecondId] = useState('')
  const [truckId, setTruckId]   = useState('')
  const [note, setNote]         = useState('')

  // Route over the second-driver threshold: true; at or under: false; unknown:
  // null. Measured when the pop-up opens — the same rule the server applies.
  const [secondRequired, setSecondRequired] = useState<boolean | null>(null)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSecondRequired(null)
    assignmentService.getRouteDistance(bookingId)
      .then((r) => { if (!cancelled) setSecondRequired(r.requires_second_driver) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, bookingId])

  const load = useCallback(async () => {
    try { setHistory(await assignmentService.getReplacements(bookingId)) } catch { setHistory([]) }
  }, [bookingId])
  useEffect(() => { void load() }, [load, paused])

  useBodyScrollLock(open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  // Company drivers who are free, plus whoever is on the booking now (kept).
  const driverOptions = useMemo(() => drivers.filter((d) => {
    const id = d.drivers?.driver_id
    if (!id || d.drivers?.is_external) return false
    return id === currentDriverId || id === currentSecondDriverId || d.drivers?.status === 'available'
  }), [drivers, currentDriverId, currentSecondDriverId])
  const truckOptions = useMemo(() => trucks.filter((t) =>
    t.truck_id === currentTruckId || (t.status === 'available' && isAssignable(t)),
  ), [trucks, currentTruckId])

  const canShowButton = inTransit && canReplace
  if (!canShowButton && history.length === 0) return null

  const openPicker = () => {
    setDriverId(currentDriverId ?? '')
    setSecondId(currentSecondDriverId ?? '')
    setTruckId(currentTruckId ?? '')
    setNote('')
    setOpen(true)
  }

  const changed = driverId !== (currentDriverId ?? '') || truckId !== (currentTruckId ?? '') ||
    secondId !== (currentSecondDriverId ?? '')
  const secondOk = secondRequired === true ? !!secondId : secondRequired === false ? !secondId : true
  const canSubmit = !!driverId && !!truckId && changed && secondOk && note.trim().length >= 3 &&
    (!secondId || secondId !== driverId)
  const truckChanged = truckId !== (currentTruckId ?? '')

  async function submit() {
    setBusy(true)
    try {
      await assignmentService.replaceCrew(bookingId, {
        driver_id:        driverId,
        truck_id:         truckId,
        second_driver_id: secondId || null,
        reason_note:      note.trim(),
      })
      appToast.success('Crew replaced. The drivers and the client have been told.', { action: 'assign', entityId: bookingId })
      setOpen(false)
      await load()
      onReplaced()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not replace the crew.'), { action: 'assign', entityId: bookingId })
    } finally {
      setBusy(false)
    }
  }

  const selectClass = 'w-full rounded-lg border border-white/10 bg-[#1b1b1b] px-2.5 py-2 text-sm text-white disabled:opacity-50'
  const driverLabel = (d: DriverUser) => `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() +
    (d.drivers?.driver_id === currentDriverId ? ' (current driver)' : d.drivers?.driver_id === currentSecondDriverId ? ' (current second driver)' : '')

  return (
    <div className="flex flex-col gap-2">
      {canShowButton && (
        <div className="rounded-xl border p-3.5 flex flex-col gap-2" style={{ borderColor: BORDER_C }}>
          <div className="flex items-center gap-2">
            <Repeat size={16} style={{ color: CYAN }} />
            <h3 className="text-sm font-bold text-white">Replace driver or vehicle</h3>
          </div>
          <p className="text-[12px] leading-snug" style={{ color: MUTED }}>
            {paused
              ? 'The delivery is paused. You can send another driver, another vehicle, or both — the delivery continues from where it stopped and everything done so far stays on record.'
              : 'Available only while the driver has the delivery paused (for example for a breakdown). The driver already started, so the crew can’t simply be changed.'}
          </p>
          <div>
            <button type="button" disabled={!paused || busy} onClick={openPicker}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              style={{ background: 'rgba(77,249,237,0.12)', border: '1px solid rgba(77,249,237,0.30)', color: CYAN }}>
              <Repeat size={13} />
              Replace driver or vehicle
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: BORDER_C }}>
          <button type="button" onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/50 cursor-pointer bg-transparent border-none p-0">
            {showHistory ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Crew history ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-2 flex flex-col gap-3 list-none p-0 m-0">
              {history.map((r) => {
                const oldPlate = r.old_truck?.plate_number ?? r.old_vehicle_plate
                const newPlate = r.new_truck?.plate_number
                return (
                  <li key={r.replacement_id} className="flex flex-col gap-0.5">
                    <span className="text-[12px] font-semibold text-white/85 flex flex-wrap items-center gap-1">
                      {nameOf(r.old_driver) ?? '—'}{oldPlate ? ` · ${oldPlate}` : ''}
                      <ArrowRight size={12} className="shrink-0" />
                      {nameOf(r.new_driver) ?? '—'}{newPlate ? ` · ${newPlate}` : ''}
                    </span>
                    <span className="text-[12px] text-white/70 whitespace-pre-wrap break-words">{r.reason_note}</span>
                    <span className="text-[11px]" style={{ color: MUTED }}>
                      {formatDateTime(r.replaced_at)}
                      {nameOf(r.replaced_by_user) ? ` · by ${nameOf(r.replaced_by_user)}` : ''}
                    </span>
                    {r.transfer_required && (
                      <span className="text-[11px]" style={{ color: r.transfer_confirmed_at ? MUTED : ORANGE }}>
                        {r.transfer_confirmed_at
                          ? <>Load moved to the new vehicle {formatDateTime(r.transfer_confirmed_at)}
                              {r.transfer_photo_url && <> · <a className="underline" href={r.transfer_photo_url} target="_blank" rel="noreferrer">photo</a></>}</>
                          : 'Waiting for the new driver to confirm the load was moved to the new vehicle.'}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="replace-crew-title"
          onClick={busy ? undefined : () => setOpen(false)}
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col w-full sm:max-w-lg max-h-[92dvh] rounded-t-[18px] sm:rounded-[18px] border border-white/[0.08] bg-[#232323]">
            <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-white/[0.06]">
              <div className="min-w-0">
                <h2 id="replace-crew-title" className="text-base font-bold text-white">Replace driver or vehicle</h2>
                {reference && <p className="text-[11px] text-white/40 mt-0.5 truncate">{reference}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close"
                className="shrink-0 p-1 rounded-md text-white/45 hover:text-white transition-colors disabled:opacity-40">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 flex flex-col gap-3">
              <p className="text-[12px] leading-snug" style={{ color: MUTED }}>
                Keep the current driver or vehicle by leaving it selected. Only free drivers and
                vehicles that passed their check are listed.
              </p>
              <div>
                <label className="text-[11px] text-white/40 block mb-1">Driver</label>
                <select value={driverId} disabled={busy} onChange={(e) => setDriverId(e.target.value)} className={selectClass}>
                  <option value="">Choose a driver</option>
                  {driverOptions.map((d) => (
                    <option key={d.drivers!.driver_id} value={d.drivers!.driver_id}>{driverLabel(d)}</option>
                  ))}
                </select>
              </div>
              {secondRequired !== false && (
                <div>
                  <label className="text-[11px] text-white/40 block mb-1">
                    {secondRequired ? <>Second driver<span className="text-red-400"> *</span></> : 'Second driver (optional)'}
                  </label>
                  <select value={secondId} disabled={busy} onChange={(e) => setSecondId(e.target.value)} className={selectClass}>
                    <option value="">None</option>
                    {driverOptions.filter((d) => d.drivers!.driver_id !== driverId).map((d) => (
                      <option key={d.drivers!.driver_id} value={d.drivers!.driver_id}>{driverLabel(d)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[11px] text-white/40 block mb-1">Vehicle</label>
                <select value={truckId} disabled={busy} onChange={(e) => setTruckId(e.target.value)} className={selectClass}>
                  <option value="">Choose a vehicle</option>
                  {truckOptions.map((t) => (
                    <option key={t.truck_id} value={t.truck_id}>
                      {t.plate_number}{t.vehicle_type ? ` · ${t.vehicle_type}` : ''}{t.truck_id === currentTruckId ? ' (current vehicle)' : ''}
                    </option>
                  ))}
                </select>
                {truckChanged && truckId && (
                  <p className="text-[11px] mt-1 leading-snug" style={{ color: ORANGE }}>
                    If the load is already on the current vehicle, the new driver has to move it across and confirm with a photo before any drop-off.
                  </p>
                )}
              </div>
              <div>
                <label className="text-[11px] text-white/40 block mb-1">Reason<span className="text-red-400"> *</span></label>
                <textarea value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3}
                  placeholder="e.g. Truck broke down on SLEX; sending BGE 1225 with Juan."
                  className={`${selectClass} resize-none`} />
                <p className="text-[10px] text-white/35 mt-1">The driver taken off sees this reason.</p>
              </div>
            </div>

            <div className="px-4 sm:px-5 py-3 border-t border-white/[0.06] flex gap-2">
              <button type="button" disabled={busy} onClick={() => setOpen(false)}
                className="flex-1 py-2 rounded-lg text-sm font-bold border border-white/10 text-white/50 hover:text-white transition-colors disabled:opacity-40">
                Cancel
              </button>
              <button type="button" disabled={busy || !canSubmit} onClick={() => void submit()}
                className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: 'rgba(77,249,237,0.12)', border: '1px solid rgba(77,249,237,0.30)', color: CYAN }}>
                {busy ? 'Replacing…' : 'Replace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
