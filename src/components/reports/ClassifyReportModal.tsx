'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

import {
  INCIDENT_LABELS,
  isVehicleIncident,
  reportDriverName,
  type DriverReport,
  type IncidentType,
} from '@/app/types/driver-report.types'

/**
 * The desk naming what an "Unspecified Emergency" was. The consequence is
 * spelled out before confirming: a breakdown or an accident also goes to the
 * Fleet Manager, and a classification cannot be changed afterwards.
 */
export default function ClassifyReportModal({
  report,
  value,
  busy,
  onChange,
  onCancel,
  onConfirm,
}: {
  report:    DriverReport | null
  value:     IncidentType | ''
  busy:      boolean
  onChange:  (t: IncidentType) => void
  onCancel:  () => void
  onConfirm: () => void
}) {
  return (
    <AnimatePresence>
      {report && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/65"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { if (!busy) onCancel() }}
        >
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-label="Classify report"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Classify report</h2>
                <p className="text-[11px] text-white/40 mt-0.5 truncate">
                  Unspecified Emergency from {reportDriverName(report)}
                  {report.trucks?.plate_number ? ` · ${report.trucks.plate_number}` : ''}
                </p>
              </div>
              <button type="button" onClick={onCancel} disabled={busy} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(INCIDENT_LABELS) as IncidentType[]).map((k) => {
                  const active = value === k
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={busy}
                      onClick={() => onChange(k)}
                      className="px-3 py-2.5 rounded-lg text-xs font-bold border transition-colors text-left"
                      style={{
                        background:  active ? 'rgba(77,249,237,0.12)' : 'transparent',
                        borderColor: active ? 'rgba(77,249,237,0.40)' : 'rgba(255,255,255,0.10)',
                        color:       active ? 'var(--color-cyan)' : 'rgba(255,255,255,0.75)',
                      }}
                    >
                      {INCIDENT_LABELS[k]}
                      {isVehicleIncident(k) && (
                        <span className="block text-[10px] font-normal text-white/35 mt-0.5">Vehicle-related</span>
                      )}
                    </button>
                  )
                })}
              </div>

              <p className="text-xs text-white/55 leading-relaxed">
                {!value
                  ? 'Choose what this emergency was. A classification cannot be changed afterwards.'
                  : isVehicleIncident(value)
                    ? 'This is vehicle-related: it will also appear on the Fleet Manager’s Reports and they will be notified. It cannot be changed afterwards.'
                    : 'This stays with the Company Administrator and the Operations Manager. It cannot be changed afterwards.'}
              </p>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/[0.07]">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!value || busy}
                className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-40"
                style={{ background: 'var(--color-cyan)' }}
              >
                {busy ? 'Saving…' : 'Classify'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
