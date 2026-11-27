'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pencil, X } from 'lucide-react'

import { assignmentService } from '@/lib/services/admin/assignment.service'
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
import { useFormGuard } from '@/lib/hooks/useFormGuard'
import VehiclePicker, { fitProblems } from '@/app/admin/booking-management/VehiclePicker'
import DriverPicker, { type DriverPickerOption } from '@/app/admin/booking-management/DriverPicker'
import { EMPTY_CARGO_SUMMARY } from '@/lib/cargo/summary'
import type { CargoSummary } from '@/lib/cargo/summary'
import { PALETTE } from '@/lib/palette'
import { CYAN, MUTED } from './transaction-theme'
import { CrewCard, SLIM_TEAL_BUTTON_CLASS, TEAL_BUTTON_CLASS, TEAL_BUTTON_STYLE, type CrewSummary } from '@/app/admin/booking-management/BookingDetailParts'
import Dropdown from '@/components/ui/Dropdown'
import { FieldError } from '@/components/ui/FieldError'
import { Tip } from '@/components/ui/tooltip'

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

type Source = 'company' | 'vendor'


const vendorName = (v: VendorDriverUser) =>
  [v.first_name, v.middle_name, v.last_name, v.suffix].filter(Boolean).join(' ') || v.email

const HELPER_HINT = 'For information only. The helper has no app access and is not notified.'

export default function ReplaceCrewPanel({
  bookingId, reference, inTransit, paused, canReplace, allowed = true, drivers, trucks,
  currentDriverId, currentSecondDriverId, currentTruckId, currentHelperName = null,
  currentIsVendor = false, currentVendorDriverUserId = null, currentVendorPlate = null, currentVendorType = null,
  cargo = null,
  crew = null,
  onReplaced,
}: {
  /** The crew on the booking: the design's assignment card is drawn around the Replace button. */
  crew?:                  CrewSummary | null
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
  /** The booking's recorded load, to warn before sending a vehicle that may not take it. */
  cargo?:                 CargoSummary | null
  onReplaced:             () => void
}) {
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


  useBodyScrollLock(open)
  // Closing the pop-up after changing a pick or typing a reason asks first
  // (user 2026-11-27). Above the early return below: it is a hook.
  const formNow = JSON.stringify({ source, driverId, secondId, truckId, vendorId, vendorSecondId, plate: plate.trim().toUpperCase(), vehicleType, helper: helper.trim() })
  const closeGuard = useFormGuard(open && (formNow !== initial || !!note.trim()))
  function requestClose() { if (!busy) closeGuard.requestClose(() => setOpen(false)) }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !closeGuard.asking) requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
  if (!canShowButton && !crew) return null

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
  // Why a newly picked company vehicle may not take the load; listed in the
  // confirmation. Not for the vehicle already on the trip (it was accepted when
  // assigned), and not for a vendor vehicle (no capacity on file).
  const pickedTruck = !vendor && truckChanged ? trucks.find((t) => t.truck_id === truckId) : undefined
  const fitWarnings = pickedTruck && cargo ? fitProblems(pickedTruck, cargo) : []
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
      appToast.success('Driver or vehicle replaced. The drivers and the client have been told.', { action: 'assign', entityId: bookingId })
      setOpen(false)
      setEditing(false)
      onReplaced()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not replace the driver or vehicle.'), { action: 'assign', entityId: bookingId })
    } finally {
      setBusy(false)
    }
  }

  const selectClass = 'w-full rounded-lg border border-white/10 bg-[#1b1b1b] px-2.5 py-2 text-base sm:text-sm text-white disabled:opacity-50'
  const driverLabel = (d: DriverUser) => `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() +
    (d.drivers?.driver_id === currentDriverId ? ' (current driver)' : d.drivers?.driver_id === currentSecondDriverId ? ' (current second driver)' : '')
  const vendorLabel = (v: VendorDriverUser) => vendorName(v) +
    (v.user_id === currentVendorDriverUserId ? ' (current driver)' : '')
  // Rows for the driver pickers (alphabetical, searchable, license flags; a
  // license expired by today is not offered). A replacement happens on the
  // road, so "the delivery day" is today.
  const driverRow = (d: DriverUser): DriverPickerOption => ({
    value: d.drivers!.driver_id, name: driverLabel(d),
    detail: d.drivers?.license_number ?? null, licenseExpiry: d.drivers?.license_expiry ?? null,
  })
  const vendorRow = (v: VendorDriverUser): DriverPickerOption => ({
    value: v.user_id, name: vendorLabel(v),
    detail: v.drivers?.vendor_name ?? null, licenseExpiry: v.drivers?.license_expiry ?? null,
  })

  return (
    <div className="flex flex-col gap-2">
      {/* Figma 2048-1485 (user 2026-11-17): the crew, a full-width Edit, and
          Edit turns into the big button. Only while the delivery is paused.
          After delivery the card lists the crew with no button. */}
      {crew && (
        <CrewCard crew={crew} showDetail={editing && paused}>
          {canShowButton && (
            editing && paused ? (
              <button type="button" disabled={busy} onClick={() => void openPicker()} {...writeAccess(allowed)}
                className={`${TEAL_BUTTON_CLASS} min-h-[56px] text-lg`} style={TEAL_BUTTON_STYLE}>
                Replace vehicle and driver
              </button>
            ) : (
              <>
                <Tip label={paused ? undefined : 'Pause the delivery first to replace the driver or vehicle.'}><button type="button" disabled={!paused || busy} onClick={() => setEditing(true)} {...writeAccess(allowed)}
                  className={SLIM_TEAL_BUTTON_CLASS} style={TEAL_BUTTON_STYLE}>
                  <Pencil size={16} /> Edit
                </button></Tip>
                {!paused && (
                  <p className="text-xs font-bold leading-snug -mt-1" style={{ color: MUTED }}>
                    Pause the delivery first to replace the driver or vehicle.
                  </p>
                )}
              </>
            )
          )}
        </CrewCard>
      )}

      {closeGuard.modal}
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="replace-crew-title"
          onClick={requestClose}
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col w-full sm:max-w-lg max-h-[92dvh] rounded-t-[18px] sm:rounded-[18px] border border-white/[0.08] bg-[#232323]">
            <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-white/[0.06]">
              <div className="min-w-0">
                <h2 id="replace-crew-title" className="text-base font-bold text-white">Replace driver or vehicle</h2>
                {reference && <p className="text-[11px] text-white/40 mt-0.5 truncate">{reference}</p>}
              </div>
              <button type="button" onClick={requestClose} disabled={busy} aria-label="Close"
                className="shrink-0 p-1 rounded-md text-white/45 hover:text-white transition-colors disabled:opacity-40">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 flex flex-col gap-3">
              {/* Where the new crew comes from. */}
              <div role="radiogroup" aria-label="Replacement from" className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 p-1">
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
                    <DriverPicker
                      ariaLabel="Vendor driver"
                      placeholder="Choose a vendor driver"
                      value={vendorId}
                      disabled={busy}
                      scheduleDate={null}
                      onChange={(v) => {
                        setVendorId(v)
                        if (v && v === vendorSecondId) setVendorSecondId('')
                      }}
                      options={vendorOptions.map(vendorRow)}
                    />
                  </div>
                  {secondRequired !== false && (
                    <div>
                      <label className="text-[11px] text-white/40 block mb-1">
                        {secondRequired ? <>Second driver<span className="text-red-400"> *</span></> : 'Second driver (optional)'}
                      </label>
                      <DriverPicker
                        ariaLabel="Second driver"
                        placeholder="Choose a second driver"
                        emptyLabel="None"
                        value={vendorSecondId}
                        disabled={busy}
                        scheduleDate={null}
                        onChange={setVendorSecondId}
                        options={vendorOptions.filter((v) => v.user_id !== vendorId).map(vendorRow)}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="text-[11px] text-white/40 block mb-1">Vehicle plate</label>
                      <input value={plate} disabled={busy} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                        maxLength={8} placeholder="ABC 1234" className={selectClass} />
                      <FieldError>{plateProblem}</FieldError>
                    </div>
                    <div className="min-w-0">
                      <label className="text-[11px] text-white/40 block mb-1">Vehicle type</label>
                      <Dropdown value={vehicleType} disabled={busy} onChange={(e) => setVehicleType(e.target.value)} className={selectClass}>
                        <option value="">Choose a type</option>
                        {vehicleTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </Dropdown>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] text-white/40 block mb-1">Driver</label>
                    <DriverPicker
                      ariaLabel="Driver"
                      placeholder="Choose a driver"
                      value={driverId}
                      disabled={busy}
                      scheduleDate={null}
                      onChange={setDriverId}
                      options={driverOptions.map(driverRow)}
                    />
                  </div>
                  {secondRequired !== false && (
                    <div>
                      <label className="text-[11px] text-white/40 block mb-1">
                        {secondRequired ? <>Second driver<span className="text-red-400"> *</span></> : 'Second driver (optional)'}
                      </label>
                      <DriverPicker
                        ariaLabel="Second driver"
                        placeholder="Choose a second driver"
                        emptyLabel="None"
                        value={secondId}
                        disabled={busy}
                        scheduleDate={null}
                        onChange={setSecondId}
                        options={driverOptions.filter((d) => d.drivers!.driver_id !== driverId).map(driverRow)}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] text-white/40 block mb-1">Vehicle</label>
                    <VehiclePicker
                      trucks={truckOptions}
                      selectedId={truckId}
                      cargo={cargo ?? EMPTY_CARGO_SUMMARY}
                      disabled={busy}
                      codingOf={() => null}
                      onSelect={setTruckId}
                    />
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

            <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-white/[0.06] flex gap-2">
              <button type="button" disabled={busy} onClick={requestClose}
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
        title={fitWarnings.length > 0 ? 'This vehicle may not fit the load' : 'Replace the driver or vehicle?'}
        description={
          fitWarnings.length > 0
            ? 'You can still send it if you know the load will go, but check first:'
            : 'The new driver or vehicle takes over this paused trip, and the drivers and the client will be notified.'
        }
        confirmLabel={fitWarnings.length > 0 ? 'Replace anyway' : 'Yes'}
        cancelLabel={fitWarnings.length > 0 ? 'Go back' : 'No'}
        zClassName="z-[80]"
        onConfirm={() => { setConfirming(false); void submit() }}
        onCancel={() => setConfirming(false)}
      >
        {fitWarnings.length > 0 && (
          <ul className="mt-3 m-0 pl-0 list-none flex flex-col gap-1.5">
            {fitWarnings.map((p) => (
              <li
                key={p}
                className="rounded-md border px-2.5 py-1.5 text-[13px] leading-snug break-words"
                style={{ color: '#f62626', background: 'rgba(246,38,38,0.12)', borderColor: 'rgba(246,38,38,0.35)' }}
              >
                {p}
              </li>
            ))}
          </ul>
        )}
      </ReusableModal>
    </div>
  )
}
