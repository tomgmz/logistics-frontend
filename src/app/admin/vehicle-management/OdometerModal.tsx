'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Gauge, X } from 'lucide-react'

import type { Truck } from '@/app/types/truck.types'
import { adminRecordOdometer, adminUploadFleetPhoto } from '@/lib/services/admin/trucks.service'
import { useRecordLock } from '@/lib/hooks/useRecordLock'
import RecordLockBanner from '@/components/ui/RecordLockBanner'
import ReusableModal from '@/components/layout/ReusableModal'
import { useFormGuard } from '@/lib/hooks/useFormGuard'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { OdometerInput, PhotoField, parseKm, fmtKm } from './maintenance-ui'

/**
 * Update a vehicle's odometer, typed off the dash with a photo. Kept apart from
 * the BLOWBAGETS inspection.
 *
 * When the vehicle is back from a delivery this is the after-delivery reading,
 * and the vehicle can't be assigned again until it is in. Otherwise it is an
 * ad-hoc update, for example a multi-trip run paused for weather with the
 * vehicle back in the parking lot.
 */
export default function OdometerModal({
  truck,
  onClose,
  onRecorded,
}: {
  truck:      Truck | null
  onClose:    () => void
  onRecorded: () => void
}) {
  const [km,    setKm]    = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Field checks show under their fields once Next has been pressed, then live.
  const [showErrors, setShowErrors] = useState(false)
  const [busy,  setBusy]  = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const lock = useRecordLock({ type: 'truck', id: truck?.truck_id ?? null })
  const isReturn = !!truck?.return_odometer_due

  useEffect(() => {
    setKm(''); setPhoto(null); setError(null); setShowErrors(false); setConfirmOpen(false)
  }, [truck?.truck_id])

  function fieldErrors(): { km?: string; photo?: string } {
    const errs: { km?: string; photo?: string } = {}
    const reading = parseKm(km)
    if (reading == null) errs.km = 'Enter the odometer in whole kilometres.'
    else if (truck?.odometer_km != null && reading < truck.odometer_km) {
      errs.km = `The odometer can't go below the last reading (${fmtKm(truck.odometer_km)}).`
    } else if (isReturn && truck?.odometer_km != null && reading === truck.odometer_km) {
      errs.km = `The return odometer must be higher than the last reading (${fmtKm(truck.odometer_km)}).`
    }
    if (!photo) errs.photo = 'Add a photo of the odometer.'
    return errs
  }
  const errs = showErrors ? fieldErrors() : {}

  function review() {
    setError(null)
    setShowErrors(true)
    if (Object.keys(fieldErrors()).length > 0) return
    setConfirmOpen(true)
  }

  async function submit() {
    if (!truck || !photo) return
    const reading = parseKm(km)!
    setBusy(true)
    try {
      const photo_url = await adminUploadFleetPhoto(photo)
      await adminRecordOdometer(truck.truck_id, { reading_km: reading, photo_url })
      appToast.success(`${isReturn ? 'Return odometer recorded' : 'Odometer updated'} for ${truck.plate_number}.`, { action: 'truck-odometer', entityId: truck.truck_id })
      setConfirmOpen(false)
      onRecorded()
      onClose()
    } catch (e) {
      setConfirmOpen(false)
      setError(getApiErrorMessage(e, 'Request failed. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const reading = parseKm(km)
  // Closing with a reading or photo entered asks first (user 2026-11-27).
  const guard = useFormGuard(!!km.trim() || !!photo)
  const requestClose = () => { if (!busy) guard.requestClose(onClose) }

  return (
    <>
      {guard.modal}
      <AnimatePresence>
        {truck && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={requestClose}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              role="dialog"
              aria-modal="true"
              aria-label={`${isReturn ? 'Return odometer' : 'Update odometer'} for ${truck.plate_number}`}
              className="w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Gauge size={18} className="text-[var(--color-cyan)] shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white">{isReturn ? 'Return odometer' : 'Update odometer'}</h2>
                    <p className="text-[11px] text-white/45 font-mono truncate">{truck.plate_number}</p>
                  </div>
                </div>
                <button type="button" onClick={requestClose} disabled={busy} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <RecordLockBanner lock={lock} noun="vehicle" className="mx-4 mt-4" />
              <fieldset disabled={lock.readOnly || busy} className="p-4 space-y-3 min-w-0 border-0 m-0">
                <p className="text-[11px] text-white/45 leading-snug">
                  {isReturn
                    ? 'The vehicle is back from a delivery. Type the reading on the dash and attach a photo of it. ' +
                      'It cannot be assigned again until this is recorded.'
                    : 'Type the reading on the dash and attach a photo of it. Use this whenever the vehicle is back ' +
                      'in the parking lot, for example when a trip is paused.'}
                </p>
                <OdometerInput value={km} onChange={setKm} lastKm={truck.odometer_km ?? null} error={errs.km} />
                <PhotoField file={photo} onFile={setPhoto} label="Odometer photo" required error={errs.photo} />
                {error && (
                  <p className="text-xs text-red-400 border border-red-500/25 rounded-lg px-3 py-2 bg-red-500/10">{error}</p>
                )}
              </fieldset>

              </div>

              <div className="shrink-0 bg-[var(--color-surface)] flex justify-end gap-2 px-4 py-3 border-t border-white/[0.07]">
                <button type="button" onClick={requestClose} disabled={busy} className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={review}
                  disabled={busy || lock.readOnly}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-40"
                  style={{ background: 'var(--color-cyan)' }}
                >
                  Record
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReusableModal
        open={!!truck && confirmOpen}
        title={isReturn ? 'Record return odometer?' : 'Update odometer?'}
        description={truck && reading != null
          ? `${truck.plate_number} ${isReturn ? 'came back at' : 'now reads'} ${fmtKm(reading)}` +
            (truck.odometer_km != null ? ` (+${(reading - truck.odometer_km).toLocaleString()} km since the last reading).` : '.')
          : undefined}
        confirmLabel={busy ? 'Saving…' : 'Record'}
        cancelLabel="Cancel"
        disableBackdropClose={busy}
        onCancel={() => { if (!busy) setConfirmOpen(false) }}
        onConfirm={() => { void submit() }}
      />
    </>
  )
}
