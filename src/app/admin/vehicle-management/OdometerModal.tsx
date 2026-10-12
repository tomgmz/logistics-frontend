'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Gauge, X } from 'lucide-react'

import type { Truck } from '@/app/types/truck.types'
import { adminRecordOdometer, adminUploadFleetPhoto } from '@/lib/services/admin/trucks.service'
import { useRecordLock } from '@/lib/hooks/useRecordLock'
import RecordLockBanner from '@/components/ui/RecordLockBanner'
import ReusableModal from '@/components/layout/ReusableModal'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { OdometerInput, PhotoField, parseKm, fmtKm } from './upkeep-ui'

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
  const [busy,  setBusy]  = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const lock = useRecordLock({ type: 'truck', id: truck?.truck_id ?? null })
  const isReturn = !!truck?.return_odometer_due

  useEffect(() => {
    setKm(''); setPhoto(null); setError(null); setConfirmOpen(false)
  }, [truck?.truck_id])

  function review() {
    const reading = parseKm(km)
    if (reading == null) { setError('Enter the odometer in whole kilometres.'); return }
    if (truck?.odometer_km != null && reading < truck.odometer_km) {
      setError(`The odometer can't go below the last reading (${fmtKm(truck.odometer_km)}).`); return
    }
    if (!photo) { setError('Add a photo of the odometer.'); return }
    setError(null)
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

  return (
    <>
      <AnimatePresence>
        {truck && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!busy) onClose() }}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              role="dialog"
              aria-modal="true"
              aria-label={`${isReturn ? 'Return odometer' : 'Update odometer'} for ${truck.plate_number}`}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Gauge size={18} className="text-[var(--color-cyan)] shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white">{isReturn ? 'Return odometer' : 'Update odometer'}</h2>
                    <p className="text-[11px] text-white/45 font-mono truncate">{truck.plate_number}</p>
                  </div>
                </div>
                <button type="button" onClick={onClose} disabled={busy} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <RecordLockBanner lock={lock} noun="vehicle" className="mx-4 mt-4" />
              <fieldset disabled={lock.readOnly || busy} className="p-4 space-y-3 min-w-0 border-0 m-0">
                <p className="text-[11px] text-white/45 leading-snug">
                  {isReturn
                    ? 'The vehicle is back from a delivery. Type the reading on the dash and attach a photo of it. ' +
                      'It cannot be assigned again until this is recorded.'
                    : 'Type the reading on the dash and attach a photo of it. Use this whenever the vehicle is back ' +
                      'in the parking lot, for example when a trip is paused.'}
                </p>
                <OdometerInput value={km} onChange={setKm} lastKm={truck.odometer_km ?? null} />
                <PhotoField file={photo} onFile={setPhoto} label="Odometer photo" required />
                {error && (
                  <p className="text-xs text-red-400 border border-red-500/25 rounded-lg px-3 py-2 bg-red-500/10">{error}</p>
                )}
              </fieldset>

              <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/[0.07]">
                <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5">
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
