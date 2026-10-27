'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, Pencil, Repeat, X } from 'lucide-react'

import {
  assignmentService,
  type CrewReplacement,
} from '@/lib/services/admin/assignment.service'
import type { DriverUser } from '@/app/types/admin/user-management.types'
import { externalDriverService, type VendorDriverUser } from '@/lib/services/admin/external-driver.service'
import { isAssignable, type Truck } from '@/app/types/truck.types'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useVehicleTypeOptions } from '@/lib/hooks/useVehicleTypes'
import { plateError } from '@/lib/validation/plate'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import ReusableModal from '@/components/layout/ReusableModal'
import { formatDateTime } from './transaction-format'
import { PALETTE } from '@/lib/palette'
import { BORDER_C, CYAN, MUTED } from './transaction-theme'

const ORANGE = PALETTE.orange

/**
 * Replacing the crew of a delivery that is already on the road.
 *
 * Once the driver has started, the ordinary "Change vehicle and driver" is gone:
 * re-assigning would wipe who did the pickup and send a loaded truck back to
 * "assigned". When something goes wrong out there the office pauses the
 * delivery, and this is how it sends a different driver, a different vehicle,
 * or both — from the 8338 fleet or from a vendor — and changes the second
 * driver or adds a helper. The booking stays in transit, every proof stays with
 * the driver who took it, and the new crew continues from where it stopped. If
 * the load is on a vehicle being replaced, the new driver must confirm moving it
 * across, with a photo, before any drop-off.
 *
 * "Edit" unlocks the Replace button first, so it is never pressed by accident.
 * A Read Only tier sees both, disabled.
 *
 * Also lists every replacement made on the booking (any status), so who drove
 * which part stays readable. Renders nothing when there is neither.
 */

type Person = { driver_id: string; users: { first_name: string | null; last_name: string | null } | null } | null
type Source = 'company' | 'vendor'

const nameOf = (p: Person | { first_name: string | null; last_name: string | null } | null) => {
  const u = p && 'users' in p ? p.users : p
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim() || null
}

const vendorName = (v: VendorDriverUser) =>
  [v.first_name, v.middle_name, v.last_name, v.suffix].filter(Boolean).join(' ') || v.email

const HELPER_HINT = 'For information only. The helper has no app access and is not notified.'

export default function ReplaceCrewPanel({
  bookingId, reference, inTransit, paused, canReplace, allowed = true, drivers, trucks,
  currentDriverId, currentSecondDriverId, currentTruckId, currentHelperName = null,
  currentIsVendor = false, currentVendorDriverUserId = null, currentVendorPlate = null, currentVendorType = null,
  onReplaced,
}: {
  bookingId:              string
  reference:              string | null
  inTransit:              boolean
  /** An open pause — the only time the crew may be replaced. */
  paused:                 boolean
  /** Operations Manager / Company Administrator, and nobody else is editing the booking. */
  canReplace:             boolean
  /** The Booking Management tier allows it. Read Only sees the buttons disabled. */
  allowed?:               boolean
  drivers:                DriverUser[]
  trucks:                 Truck[]
  currentDriverId:        string | null
  currentSecondDriverId:  string | null
  currentTruckId:         string | null
  currentHelperName?:     string | null
  /** The crew on the road now came from a vendor. */
  currentIsVendor?:           boolean
  currentVendorDriverUserId?: string | null
  currentVendorPlate?:        string | null
  currentVendorType?:         string | null
  onReplaced:             () => void
}) {
  const [history, setHistory] = useState<CrewReplacement[]>([])
  const [showHistory, setShowHistory] = useState(true)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Replace asks Yes / No before it saves.
  const [confirming, setConfirming] = useState(false)
  // Vendor drivers from Driver Management, with the booking each is still on.
  // Read fresh when the pop-up opens.
  const [vendorDrivers, setVendorDrivers] = useState<VendorDriverUser[]>([])
  const [source, setSource]     = useState<Source>('company')
  const [driverId, setDriverId] = useState('')
  const [secondId, setSecondId] = useState('')
  const [truckId, setTruckId]   = useState('')
  const [vendorId, setVendorId]             = useState('')
  const [vendorSecondId, setVendorSecondId] = useState('')
  const [plate, setPlate]                   = useState('')
  const [vehicleType, setVehicleType]       = useState('')
  const [helper, setHelper]     = useState('')
  const [note, setNote]         = useState('')
  // The form as it opened, to tell whether anything was changed.
  const [initial, setInitial]   = useState('')

  const { options: vehicleTypes } = useVehicleTypeOptions(vehicleType, open && source === 'vendor')

  // Edit only means something while the delivery is paused.
  useEffect(() => { if (!paused) setEditing(false) }, [paused])

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
  // Vendor drivers who can sign in and are not on another booking (or are on this one).
  const vendorOptions = useMemo(() => vendorDrivers.filter((v) =>
    v.access?.account_active && (!v.current_booking || v.current_booking.booking_id === bookingId),
  ), [vendorDrivers, bookingId])

  const canShowButton = inTransit && canReplace
  if (!canShowButton && history.length === 0) return null

  const snapshot = (f: Record<string, string>) => JSON.stringify(f)
  const form = { source, driverId, secondId, truckId, vendorId, vendorSecondId, plate: plate.trim().toUpperCase(), vehicleType, helper: helper.trim() }

  const openPicker = async () => {
    setBusy(true)
    let vendorList: VendorDriverUser[] = vendorDrivers
    try {
      vendorList = await externalDriverService.list()
      setVendorDrivers(vendorList)
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not load vendor drivers.'), { action: 'vendor-drivers' })
    } finally {
      setBusy(false)
    }
    const vendorSecond = currentIsVendor && currentSecondDriverId
      ? vendorList.find((v) => v.drivers?.driver_id === currentSecondDriverId)?.user_id ?? ''
      : ''
    const start = {
      source:         (currentIsVendor ? 'vendor' : 'company') as Source,
      driverId:       currentIsVendor ? '' : currentDriverId ?? '',
      secondId:       currentIsVendor ? '' : currentSecondDriverId ?? '',
      truckId:        currentIsVendor ? '' : currentTruckId ?? '',
      vendorId:       currentIsVendor ? currentVendorDriverUserId ?? '' : '',
      vendorSecondId: vendorSecond,
      plate:          currentIsVendor ? (currentVendorPlate ?? '').toUpperCase() : '',
      vehicleType:    currentIsVendor ? currentVendorType ?? '' : '',
      helper:         currentHelperName ?? '',
    }
    setSource(start.source)
    setDriverId(start.driverId)
    setSecondId(start.secondId)
    setTruckId(start.truckId)
    setVendorId(start.vendorId)
    setVendorSecondId(start.vendorSecondId)
    setPlate(start.plate)
    setVehicleType(start.vehicleType)
    setHelper(start.helper)
    setNote('')
    setInitial(snapshot(start))
    setOpen(true)
  }

  const vendor      = source === 'vendor'
  const hasSecond   = vendor ? !!vendorSecondId : !!secondId
  const changed     = snapshot(form) !== initial
  const secondOk    = secondRequired === true ? hasSecond : secondRequired === false ? !hasSecond : true
  const plateProblem = vendor && plate.trim() ? plateError(plate) : null
  const crewOk = vendor
    ? !!vendorId && !!plate.trim() && !plateProblem && (!vendorSecondId || vendorSecondId !== vendorId)
    : !!driverId && !!truckId && (!secondId || secondId !== driverId)
  const canSubmit   = crewOk && changed && secondOk && note.trim().length >= 3
  const truckChanged = vendor
    ? !currentIsVendor || plate.trim().toUpperCase() !== (currentVendorPlate ?? '').toUpperCase()
    : truckId !== (currentTruckId ?? '')
  // A helper rides only where there is no second driver.
  const showHelper = secondRequired !== true && !hasSecond

  async function submit() {
    setBusy(true)
    try {
      await assignmentService.replaceCrew(bookingId, vendor
        ? {
            is_vendor_supplied:           true,
            vendor_driver_user_id:        vendorId,
            second_vendor_driver_user_id: vendorSecondId || null,
            vendor_vehicle_plate:         plate.trim().toUpperCase(),
            vendor_vehicle_type:          vehicleType.trim() || null,
            helper_name:                  showHelper ? helper.trim() || null : null,
            reason_note:                  note.trim(),
          }
        : {
            driver_id:        driverId,
            truck_id:         truckId,
            second_driver_id: secondId || null,
            helper_name:      showHelper ? helper.trim() || null : null,
            reason_note:      note.trim(),
          })
      appToast.success('Crew replaced. The drivers and the client have been told.', { action: 'assign', entityId: bookingId })
      setOpen(false)
      setEditing(false)
      await load()
      onReplaced()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not replace the crew.'), { action: 'assign', entityId: bookingId })
    } finally {
      setBusy(false)
    }
  }

  const selectClass = 'w-full rounded-lg border border-white/10 bg-[#1b1b1b] px-2.5 py-2 text-base sm:text-sm text-white disabled:opacity-50'
  const driverLabel = (d: DriverUser) => `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() +
    (d.drivers?.driver_id === currentDriverId ? ' (current driver)' : d.drivers?.driver_id === currentSecondDriverId ? ' (current second driver)' : '')
  const vendorLabel = (v: VendorDriverUser) => vendorName(v) +
    (v.drivers?.vendor_name ? ` · ${v.drivers.vendor_name}` : '') +
    (v.user_id === currentVendorDriverUserId ? ' (current driver)' : '')

  return (
    <div className="flex flex-col gap-2">
      {canShowButton && (
        <div className="rounded-xl border p-3.5 flex flex-col gap-2" style={{ borderColor: BORDER_C }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Repeat size={16} style={{ color: CYAN }} className="shrink-0" />
              <h3 className="text-sm font-bold text-white">Replace driver or vehicle</h3>
            </div>
            {/* Edit first, so Replace is never pressed by accident. */}
            <button type="button" disabled={!paused || busy} onClick={() => setEditing((v) => !v)} {...writeAccess(allowed)}
              aria-pressed={editing}
              className="inline-flex items-center gap-1 shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={editing
                ? { borderColor: 'rgba(77,249,237,0.45)', color: CYAN, background: 'rgba(77,249,237,0.10)' }
                : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
              <Pencil size={11} />
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>
          <p className="text-[12px] leading-snug" style={{ color: MUTED }}>
            {paused
              ? 'The delivery is paused. Press Edit, then send another driver or vehicle (8338 or a vendor), change the second driver, or add a helper. The delivery continues from where it stopped and everything done so far stays on record.'
              : 'Available only while the delivery is paused (pause it above, for example for a breakdown). The driver already started, so the crew can’t simply be changed.'}
          </p>
          <div>
            <button type="button" disabled={!paused || !editing || busy} onClick={() => void openPicker()} {...writeAccess(allowed)}
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
                const newPlate = r.new_truck?.plate_number ?? r.new_vehicle_plate
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
              {/* Where the new crew comes from. */}
              <div role="radiogroup" aria-label="Crew from" className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 p-1">
                {([['company', '8338 fleet'], ['vendor', 'Vendor']] as const).map(([key, label]) => (
                  <button key={key} type="button" role="radio" aria-checked={source === key} disabled={busy}
                    onClick={() => setSource(key)}
                    className="rounded-md py-1.5 text-[12px] font-bold transition-colors disabled:opacity-40"
                    style={source === key
                      ? { background: 'rgba(77,249,237,0.14)', color: CYAN }
                      : { color: 'rgba(255,255,255,0.5)' }}>
                    {label}
                  </button>
                ))}
              </div>

              <p className="text-[12px] leading-snug" style={{ color: MUTED }}>
                {vendor
                  ? 'Pick the vendor’s driver and type their vehicle. Drivers already on another booking are not listed.'
                  : 'Keep the current driver or vehicle by leaving it selected. Only free drivers and vehicles that passed their check are listed.'}
              </p>

              {vendor ? (
                <>
                  <div>
                    <label className="text-[11px] text-white/40 block mb-1">Vendor driver</label>
                    <select value={vendorId} disabled={busy} onChange={(e) => {
                      setVendorId(e.target.value)
                      if (e.target.value && e.target.value === vendorSecondId) setVendorSecondId('')
                    }} className={selectClass}>
                      <option value="">Choose a vendor driver</option>
                      {vendorOptions.map((v) => (
                        <option key={v.user_id} value={v.user_id}>{vendorLabel(v)}</option>
                      ))}
                    </select>
                  </div>
                  {secondRequired !== false && (
                    <div>
                      <label className="text-[11px] text-white/40 block mb-1">
                        {secondRequired ? <>Second driver<span className="text-red-400"> *</span></> : 'Second driver (optional)'}
                      </label>
                      <select value={vendorSecondId} disabled={busy} onChange={(e) => setVendorSecondId(e.target.value)} className={selectClass}>
                        <option value="">None</option>
                        {vendorOptions.filter((v) => v.user_id !== vendorId).map((v) => (
                          <option key={v.user_id} value={v.user_id}>{vendorLabel(v)}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="text-[11px] text-white/40 block mb-1">Vehicle plate</label>
                      <input value={plate} disabled={busy} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                        maxLength={8} placeholder="ABC 1234" className={selectClass} />
                      {plateProblem && <p className="text-[11px] mt-1 text-red-400">{plateProblem}</p>}
                    </div>
                    <div className="min-w-0">
                      <label className="text-[11px] text-white/40 block mb-1">Vehicle type</label>
                      <select value={vehicleType} disabled={busy} onChange={(e) => setVehicleType(e.target.value)} className={selectClass}>
                        <option value="">Choose a type</option>
                        {vehicleTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
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
                  </div>
                </>
              )}

              {truckChanged && (vendor ? !!plate.trim() : !!truckId) && (
                <p className="text-[11px] leading-snug" style={{ color: ORANGE }}>
                  If the load is already on the current vehicle, the new driver has to move it across and confirm with a photo before any drop-off.
                </p>
              )}

              {showHelper && (
                <div>
                  <label className="text-[11px] text-white/40 block mb-1">Helper (optional)</label>
                  <input value={helper} disabled={busy} onChange={(e) => setHelper(e.target.value)}
                    maxLength={120} placeholder="Helper's full name" className={selectClass} />
                  <p className="text-[10px] text-white/35 mt-1 leading-snug">{HELPER_HINT}</p>
                </div>
              )}

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
              <button type="button" disabled={busy || !canSubmit} onClick={() => setConfirming(true)}
                className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: 'rgba(77,249,237,0.12)', border: '1px solid rgba(77,249,237,0.30)', color: CYAN }}>
                {busy ? 'Replacing…' : 'Replace'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReusableModal
        open={confirming}
        title="Replace the crew?"
        description="The new crew takes over this paused trip, and the drivers and the client will be notified."
        confirmLabel="Yes"
        cancelLabel="No"
        zClassName="z-[80]"
        onConfirm={() => { setConfirming(false); void submit() }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
