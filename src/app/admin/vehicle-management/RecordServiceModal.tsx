'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wrench, X } from 'lucide-react'

import type { Truck } from '@/app/types/truck.types'
import { adminRecordTruckService, adminUploadFleetPhoto } from '@/lib/services/admin/trucks.service'
import { useRecordLock } from '@/lib/hooks/useRecordLock'
import RecordLockBanner from '@/components/ui/RecordLockBanner'
import ReusableModal from '@/components/layout/ReusableModal'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { OdometerInput, PhotoField, parseKm, fmtKm, fmtDay, phToday, inputCls } from './upkeep-ui'

/**
 * Log a routine service. Restarts both counters (km and months) from the
 * service's date and odometer, which is what takes an overdue vehicle off the
 * Maintenance tab and lets it be assigned again.
 */
export default function RecordServiceModal({
  truck,
  onClose,
  onRecorded,
}: {
  truck:      Truck | null
  onClose:    () => void
  onRecorded: () => void
}) {
  const [date,     setDate]     = useState(phToday())
  const [km,       setKm]       = useState('')
  const [work,     setWork]     = useState('')
  const [workshop, setWorkshop] = useState('')
  const [receipt,  setReceipt]  = useState<File | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [busy,     setBusy]     = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const lock = useRecordLock({ type: 'truck', id: truck?.truck_id ?? null })

  useEffect(() => {
    setDate(phToday())
    setKm(truck?.odometer_km != null ? String(truck.odometer_km) : '')
    setWork(''); setWorkshop(''); setReceipt(null); setError(null); setConfirmOpen(false)
  }, [truck?.truck_id, truck?.odometer_km])

  function review() {
    if (!truck) return
    const reading = parseKm(km)
    if (!date) { setError('Enter the service date.'); return }
    if (date > phToday()) { setError('The service date cannot be in the future.'); return }
    if (truck.last_service_at && date < truck.last_service_at) {
      setError(`The service date is before the last service (${fmtDay(truck.last_service_at)}).`); return
    }
    if (reading == null) { setError('Enter the odometer at the service in whole kilometres.'); return }
    if (truck.last_service_odometer_km != null && reading < truck.last_service_odometer_km) {
      setError(`The odometer is below the last service reading (${fmtKm(truck.last_service_odometer_km)}).`); return
    }
    if (!work.trim()) { setError('Describe the work done.'); return }
    setError(null)
    setConfirmOpen(true)
  }

  async function submit() {
    if (!truck) return
    setBusy(true)
    try {
      const receipt_url = receipt ? await adminUploadFleetPhoto(receipt) : null
      await adminRecordTruckService(truck.truck_id, {
        serviced_at: date,
        odometer_km: parseKm(km)!,
        work_done:   work.trim(),
        workshop:    workshop.trim() || null,
        receipt_url,
      })
      appToast.success(`Service recorded for ${truck.plate_number}.`, { action: 'truck-service', entityId: truck.truck_id })
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

  const everyKm     = truck?.service_interval_km
  const everyMonths = truck?.service_interval_months

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
              aria-label={`Record service for ${truck.plate_number}`}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Wrench size={18} className="text-[var(--color-cyan)] shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white">Record service</h2>
                    <p className="text-[11px] text-white/45 truncate">
                      <span className="font-mono">{truck.plate_number}</span>
                      {everyKm && everyMonths ? ` · every ${everyKm.toLocaleString()} km or ${everyMonths} months` : ''}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} disabled={busy} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <RecordLockBanner lock={lock} noun="vehicle" className="mx-4 mt-4" />
              <fieldset disabled={lock.readOnly || busy} className="p-4 space-y-3 min-w-0 border-0 m-0">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase text-white/40">
                    Service date <span className="text-red-400">*</span>
                  </span>
                  <input type="date" value={date} max={phToday()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </label>
                <OdometerInput value={km} onChange={setKm} lastKm={truck.odometer_km ?? null} label="Odometer at service (km)" />
                <label className="block">
                  <span className="text-[11px] font-bold uppercase text-white/40">
                    Work done <span className="text-red-400">*</span>
                  </span>
                  <textarea
                    value={work}
                    onChange={(e) => setWork(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="e.g. Change oil and oil filter, replace air filter, check brakes"
                    className={`${inputCls} resize-none`}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase text-white/40">Workshop</span>
                  <input value={workshop} onChange={(e) => setWorkshop(e.target.value)} maxLength={200} placeholder="Optional" className={inputCls} />
                </label>
                <PhotoField file={receipt} onFile={setReceipt} label="Receipt or job order" />
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
        title="Record service?"
        description={truck
          ? `${truck.plate_number} serviced on ${fmtDay(date)} at ${fmtKm(parseKm(km))}. ` +
            (everyKm && everyMonths
              ? `The next service will be due in ${everyKm.toLocaleString()} km or ${everyMonths} months, whichever comes first.`
              : 'Set a service interval on the vehicle to track the next one.')
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
