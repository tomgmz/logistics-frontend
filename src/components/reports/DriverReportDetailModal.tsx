'use client'

import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, Video, AlertTriangle } from 'lucide-react'

import { BLOWBAGETS_ITEMS } from '@/lib/blowbagets'
import {
  incidentLabel,
  isUrgentReport,
  personName,
  reportDriverName,
  REPORT_STATUS_LABELS,
  type DriverReport,
  type ReportStatus,
} from '@/app/types/driver-report.types'

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function reportStatusStyle(status: ReportStatus): { bg: string; color: string; border: string } {
  switch (status) {
    case 'reported':
      return { bg: 'rgba(248,113,113,0.12)', color: '#fca5a5', border: 'rgba(248,113,113,0.35)' }
    case 'acknowledged':
      return { bg: 'rgba(250,204,21,0.12)', color: '#fde047', border: 'rgba(250,204,21,0.35)' }
    default:
      return { bg: 'rgba(58,246,38,0.12)', color: '#86efac', border: 'rgba(58,246,38,0.35)' }
  }
}

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const st = reportStatusStyle(status)
  return (
    <span
      className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
      style={{ color: st.color, borderColor: st.border, background: st.bg }}
    >
      {REPORT_STATUS_LABELS[status]}
    </span>
  )
}

export function UrgentBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
      style={{ color: '#fca5a5', borderColor: 'rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.15)' }}
      title="Sent as an emergency alert, or the driver said the trip cannot continue"
    >
      <AlertTriangle size={10} />
      Emergency
    </span>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-white/40 shrink-0">{label}</span>
      <span className="text-sm text-white/80 text-right min-w-0 break-words">{children}</span>
    </div>
  )
}

/**
 * Read-only view of one driver report. The caller supplies whatever actions it
 * allows (acknowledge / resolve on the Reports desk, nothing on Maintenance)
 * through `actions`, and a lock banner through `banner`.
 */
export default function DriverReportDetailModal({
  report,
  onClose,
  banner,
  actions,
}: {
  report:   DriverReport | null
  onClose:  () => void
  banner?:  ReactNode
  actions?: ReactNode
}) {
  return (
    <AnimatePresence>
      {report && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/65"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-label="Driver report details"
            className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest truncate">
                  {incidentLabel(report.incident_type)}
                </h2>
                <p className="text-[11px] text-white/40 mt-0.5">Received {fmtWhen(report.created_at)}</p>
              </div>
              <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto min-h-0">
              {banner}

              <div className="flex flex-wrap items-center gap-2">
                <ReportStatusBadge status={report.status} />
                {isUrgentReport(report) && <UrgentBadge />}
                <span className="text-[10px] font-bold uppercase tracking-wide text-white/35">
                  {report.source === 'quick' ? 'Emergency alert' : 'Detailed report'}
                </span>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3">
                <Row label="Driver">
                  {reportDriverName(report)}
                  {report.drivers?.users?.phone && (
                    <a href={`tel:${report.drivers.users.phone}`} className="block text-[11px] text-[var(--color-cyan)] font-mono">
                      {report.drivers.users.phone}
                    </a>
                  )}
                </Row>
                <Row label="Vehicle">
                  {report.trucks
                    ? <><span className="font-mono">{report.trucks.plate_number}</span>{report.trucks.truck_models?.name ? <span className="block text-[11px] text-white/40">{report.trucks.truck_models.name}</span> : null}</>
                    : <span className="text-white/35">Not on a vehicle</span>}
                </Row>
                <Row label="Booking">
                  {report.bookings?.reference_number ?? (report.booking_id ? report.bookings?.origin ?? 'Linked booking' : <span className="text-white/35">None</span>)}
                </Row>
                {report.sub_type && <Row label="Type">{report.sub_type}</Row>}
                <Row label="Trip can continue">
                  {report.trip_can_continue == null
                    ? <span className="text-white/35">Not stated</span>
                    : report.trip_can_continue
                      ? 'Yes'
                      : <span className="text-red-300 font-semibold">No — the trip is stopped</span>}
                </Row>
                <Row label="Location">
                  {report.latitude != null && report.longitude != null ? (
                    <a
                      href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--color-cyan)] hover:underline"
                    >
                      <MapPin size={12} />
                      {report.address || `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`}
                    </a>
                  ) : (report.address || <span className="text-white/35">Not captured</span>)}
                </Row>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-1.5">What happened</p>
                <p className="text-sm text-white/80 whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5">
                  {report.description?.trim() || <span className="text-white/35">The driver did not describe it.</span>}
                </p>
              </div>

              {/* The driver's roadside re-check. A tick means "I looked at this",
                  not "it passed" — so unticked items are "not checked", never failed. */}
              {report.blowbagets_check && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-1.5">
                    Driver&apos;s BLOWBAGETS check
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {BLOWBAGETS_ITEMS.filter((it) => report.blowbagets_check!.items[it.key]).map((it) => (
                      <span
                        key={it.key}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md border"
                        style={{ color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.35)', background: 'rgba(77,249,237,0.10)' }}
                      >
                        {it.label}
                      </span>
                    ))}
                  </div>
                  {(() => {
                    const notChecked = BLOWBAGETS_ITEMS.filter((it) => !report.blowbagets_check!.items[it.key])
                    return notChecked.length > 0 ? (
                      <p className="text-[11px] text-white/40 mt-1.5">
                        Not checked: {notChecked.map((it) => it.label).join(', ')}
                      </p>
                    ) : null
                  })()}
                </div>
              )}

              {(report.photo_urls?.length > 0 || report.video_urls?.length > 0) && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-1.5">Attachments</p>
                  <div className="grid grid-cols-3 gap-2">
                    {report.photo_urls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Report photo" className="w-full aspect-square object-cover rounded-lg border border-white/10 bg-black/30" loading="lazy" />
                      </a>
                    ))}
                    {report.video_urls.map((url, i) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-1 aspect-square rounded-lg border border-white/10 bg-white/[0.04] text-white/60 hover:text-white"
                      >
                        <Video size={20} />
                        <span className="text-[10px]">Video {i + 1}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {(report.acknowledged_at || report.resolved_at) && (
                <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3">
                  {report.acknowledged_at && (
                    <Row label="Acknowledged">
                      {fmtWhen(report.acknowledged_at)}
                      {personName(report.acknowledger) && <span className="block text-[11px] text-white/40">by {personName(report.acknowledger)}</span>}
                    </Row>
                  )}
                  {report.resolved_at && (
                    <Row label="Resolved">
                      {fmtWhen(report.resolved_at)}
                      {personName(report.resolver) && <span className="block text-[11px] text-white/40">by {personName(report.resolver)}</span>}
                    </Row>
                  )}
                  {report.resolution_note && <Row label="Resolution">{report.resolution_note}</Row>}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/[0.07] shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/80 hover:bg-white/5"
              >
                Close
              </button>
              {actions}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
