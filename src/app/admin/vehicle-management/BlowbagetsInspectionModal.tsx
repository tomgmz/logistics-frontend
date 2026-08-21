'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ClipboardCheck, X } from 'lucide-react'

import { BLOWBAGETS_ITEMS, toBlowbagetsItems } from '@/lib/blowbagets'
import {
  adminFetchTruckInspections,
  adminRecordTruckInspection,
} from '@/lib/services/admin/trucks.service'
import type { Truck, TruckInspection } from '@/app/types/truck.types'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'

/**
 * The fleet manager's BLOWBAGETS inspection of one vehicle.
 *
 * This is the gate on the whole assignment flow: operations can only pick a
 * vehicle whose MOST RECENT inspection passed, and a pass holds until a later
 * inspection replaces it. Every item must be ticked to pass — leaving any item
 * unticked records a failure and takes the vehicle out of the selectable pool
 * until it passes a re-check.
 */

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function inspectorName(row: TruckInspection): string | null {
  if (!row.inspector) return null
  return `${row.inspector.first_name} ${row.inspector.last_name}`.trim() || null
}

export default function BlowbagetsInspectionModal({
  truck,
  onClose,
  onRecorded,
}: {
  truck:      Truck | null
  onClose:    () => void
  onRecorded: (inspection: TruckInspection) => void
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [notes,   setNotes]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [history, setHistory] = useState<TruckInspection[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const doneCount = BLOWBAGETS_ITEMS.filter((it) => checked[it.key]).length
  const total     = BLOWBAGETS_ITEMS.length
  const willPass  = doneCount === total

  // Each time a different vehicle is opened, start from a blank checklist — a
  // carried-over tick would be a fault recorded as passed.
  useEffect(() => {
    setChecked({})
    setNotes('')
    if (!truck) return

    let cancelled = false
    setHistoryLoading(true)
    adminFetchTruckInspections(truck.truck_id)
      .then((rows) => { if (!cancelled) setHistory(rows) })
      .catch(() => { if (!cancelled) setHistory([]) })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })

    return () => { cancelled = true }
  }, [truck?.truck_id])

  const submit = async () => {
    if (!truck) return
    setBusy(true)
    try {
      const inspection = await adminRecordTruckInspection(truck.truck_id, {
        items: toBlowbagetsItems(checked),
        notes: notes.trim() || null,
      })
      setHistory((prev) => [inspection, ...prev])
      onRecorded(inspection)
      appToast.success(
        inspection.passed
          ? `${truck.plate_number} passed — operations can now assign it.`
          : `${truck.plate_number} failed — it can't be assigned until it passes a re-check.`,
        { action: 'truck-inspection', entityId: truck.truck_id },
      )
      onClose()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), {
        action: 'truck-inspection', entityId: truck.truck_id,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {truck && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70"
            onClick={() => !busy && onClose()}
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-label={`BLOWBAGETS inspection for ${truck.plate_number}`}
            className="fixed z-[61] inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[88vh] w-full sm:max-w-lg
                       rounded-t-2xl sm:rounded-2xl border border-white/[0.10] bg-[var(--color-surface)]
                       flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 flex items-start justify-between gap-3 px-4 py-3 border-b border-white/[0.07]">
              <div className="flex items-center gap-2.5 min-w-0">
                <ClipboardCheck size={18} className="text-[var(--color-cyan)] shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white truncate">BLOWBAGETS inspection</h2>
                  <p className="text-[11px] text-white/45 truncate font-mono">
                    {truck.plate_number}
                    {truck.truck_model?.name ? ` · ${truck.truck_model.name}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !busy && onClose()}
                className="p-1.5 rounded-lg hover:bg-white/5 text-white/60 shrink-0"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-white/45 leading-snug pr-3">
                  Tick every item you physically inspected and found sound. Anything left unticked
                  records a fault and blocks the vehicle from being assigned.
                </p>
                <span
                  className="shrink-0 text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-md border"
                  style={
                    willPass
                      ? { color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.40)', background: 'rgba(77,249,237,0.12)' }
                      : { color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.15)' }
                  }
                >
                  {doneCount}/{total}
                </span>
              </div>

              <ul className="space-y-1.5">
                {BLOWBAGETS_ITEMS.map((it) => {
                  const on = !!checked[it.key]
                  return (
                    <li key={it.key}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setChecked((prev) => ({ ...prev, [it.key]: !prev[it.key] }))}
                        aria-pressed={on}
                        className="w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left
                                   transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={
                          on
                            ? { borderColor: 'rgba(77,249,237,0.35)', background: 'rgba(77,249,237,0.08)' }
                            : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.20)' }
                        }
                      >
                        <span
                          className="shrink-0 w-5 h-5 rounded-md border flex items-center justify-center"
                          style={
                            on
                              ? { borderColor: 'var(--color-cyan)', background: 'var(--color-cyan)', color: '#04201e' }
                              : { borderColor: 'rgba(255,255,255,0.25)' }
                          }
                        >
                          {on && <Check size={13} strokeWidth={3} />}
                        </span>
                        <span
                          className="shrink-0 w-4 text-center text-[12px] font-black"
                          style={{ color: on ? 'var(--color-cyan)' : 'rgba(255,255,255,0.4)' }}
                        >
                          {it.letter}
                        </span>
                        <span className="flex flex-col min-w-0">
                          <span className={`text-sm font-semibold ${on ? 'text-white' : 'text-white/75'}`}>
                            {it.label}
                          </span>
                          <span className="text-[10px] text-white/35 truncate">{it.hint}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              <div>
                <label htmlFor="inspection-notes" className="text-[11px] text-white/40 block mb-1">
                  Notes {!willPass && <span className="text-[#fca5a5]">— describe the fault</span>}
                </label>
                <textarea
                  id="inspection-notes"
                  value={notes}
                  disabled={busy}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={willPass ? 'Optional' : 'e.g. Nearside rear tyre worn below the limit'}
                  className="w-full rounded-lg border border-white/10 bg-[#1a1a1a] text-sm text-white px-3 py-2
                             outline-none focus:border-[var(--color-cyan)]/50 disabled:opacity-50 resize-none"
                />
              </div>

              {/* Past inspections, so the fleet manager can see what changed. */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
                  Inspection history
                </h3>
                {historyLoading ? (
                  <p className="text-[11px] text-white/35">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="text-[11px] text-white/35">
                    Never inspected. This vehicle cannot be assigned until it passes.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {history.slice(0, 5).map((row) => {
                      const who    = inspectorName(row)
                      const failed = BLOWBAGETS_ITEMS.filter((it) => !row.items[it.key])
                      return (
                        <li
                          key={row.inspection_id}
                          className="rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border"
                              style={
                                row.passed
                                  ? { color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.35)', background: 'rgba(77,249,237,0.10)' }
                                  : { color: '#fca5a5', borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.10)' }
                              }
                            >
                              {row.passed ? 'Passed' : 'Failed'}
                            </span>
                            <span className="text-[10px] text-white/35">{fmtWhen(row.inspected_at)}</span>
                          </div>
                          {failed.length > 0 && (
                            <p className="text-[11px] text-[#fca5a5]/90 mt-1 leading-snug">
                              {failed.map((f) => f.label).join(', ')}
                            </p>
                          )}
                          {row.notes && <p className="text-[11px] text-white/55 mt-1 leading-snug">{row.notes}</p>}
                          {who && <p className="text-[10px] text-white/30 mt-1">by {who}</p>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-white/[0.07]">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="flex-1 py-2 rounded-lg text-sm font-bold border border-white/10
                           text-white/50 hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40"
                style={
                  willPass
                    ? { background: 'rgba(77,249,237,0.12)', border: '1px solid rgba(77,249,237,0.30)', color: 'var(--color-cyan)' }
                    : { background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', color: '#fca5a5' }
                }
              >
                {busy ? 'Recording…' : willPass ? 'Record pass' : `Record fail (${total - doneCount})`}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
