'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, Wrench, ClipboardCheck, FileWarning, Ban, Settings2 } from 'lucide-react'

import type { MaintenanceReason, MaintenanceTruck, TruckInspection } from '@/app/types/truck.types'
import { assignedDriverName } from '@/app/types/truck.types'
import { incidentLabel, type DriverReport } from '@/app/types/driver-report.types'
import { adminFetchMaintenanceQueue, adminUpdateTruck } from '@/lib/services/admin/trucks.service'
import { BLOWBAGETS_ITEMS } from '@/lib/blowbagets'
import BlowbagetsInspectionModal from './BlowbagetsInspectionModal'
import RecordServiceModal from './RecordServiceModal'
import { fmtDay, fmtKm } from './upkeep-ui'
import DriverReportDetailModal from '@/components/reports/DriverReportDetailModal'
import ReusableModal from '@/components/layout/ReusableModal'
import { useRecordLocks } from '@/lib/hooks/useRecordLock'
import { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { ModelThumb, TruckStatusBadge, resolveModelImageUrl } from './vehicle-ui'

/**
 * Vehicle Management → Maintenance: the vehicles that need a mechanic, and why.
 *
 * A vehicle lands here when it was taken out of service, failed its latest
 * BLOWBAGETS, has an open breakdown/accident report from a driver, or its
 * routine service is due soon / overdue (every N km or N months, whichever
 * first) — or not set up yet. BLOWBAGETS re-checks (never inspected, back from a
 * job) are not maintenance and stay on the Vehicles tab.
 *
 * Ways back: a passing BLOWBAGETS ("Approve Vehicle") clears under_maintenance;
 * "Record Service" restarts the service counters.
 */

const REASON_LABEL: Record<MaintenanceReason, string> = {
  under_maintenance:        'Out of service',
  failed_inspection:        'Failed BLOWBAGETS',
  driver_report:            'Driver report',
  service_overdue:          'Service overdue',
  service_due_soon:         'Service due soon',
  service_schedule_missing: 'Service schedule not set',
}

const SERVICE_REASONS: MaintenanceReason[] = ['service_overdue', 'service_due_soon', 'service_schedule_missing']

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function failedItems(inspection: TruckInspection | null | undefined): string[] {
  if (!inspection || inspection.passed) return []
  return BLOWBAGETS_ITEMS.filter((it) => !inspection.items?.[it.key]).map((it) => it.label)
}

/** The most recent thing that put the vehicle here — for sorting and the "Flagged" column. */
function flaggedAt(t: MaintenanceTruck): string | null {
  const dates: string[] = []
  if (t.maintenance_reasons.includes('failed_inspection') && t.latest_inspection) dates.push(t.latest_inspection.inspected_at)
  for (const r of t.open_reports) dates.push(r.created_at)
  if (t.maintenance_reasons.includes('service_overdue') && t.service_status?.due_date) {
    dates.push(`${t.service_status.due_date}T00:00:00`)
  }
  if (dates.length === 0 && t.updated_at) dates.push(t.updated_at)
  return dates.sort().at(-1) ?? null
}

const REASON_TONE: Record<MaintenanceReason, { color: string; border: string; bg: string }> = {
  driver_report:            { color: '#fca5a5', border: 'rgba(248,113,113,0.35)', bg: 'rgba(248,113,113,0.10)' },
  service_overdue:          { color: '#fca5a5', border: 'rgba(248,113,113,0.35)', bg: 'rgba(248,113,113,0.10)' },
  failed_inspection:        { color: '#fdba74', border: 'rgba(251,146,60,0.35)',  bg: 'rgba(251,146,60,0.10)' },
  under_maintenance:        { color: '#fbbf24', border: 'rgba(246,159,38,0.35)',  bg: 'rgba(246,159,38,0.12)' },
  service_due_soon:         { color: '#fde047', border: 'rgba(250,204,21,0.35)',  bg: 'rgba(250,204,21,0.10)' },
  service_schedule_missing: { color: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.15)', bg: 'transparent' },
}

function ReasonChip({ reason, children }: { reason: MaintenanceReason; children?: React.ReactNode }) {
  const tone = REASON_TONE[reason]
  return (
    <span
      className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
      style={{ color: tone.color, borderColor: tone.border, background: tone.bg }}
    >
      {REASON_LABEL[reason]}
      {children}
    </span>
  )
}

export default function MaintenanceTab({
  canEdit,
  onCount,
  onSetUpSchedule,
}: {
  canEdit:  boolean
  /** Lets the page show the queue size on the tab. */
  onCount?: (n: number) => void
  /** Opens the vehicle's edit form, where the service schedule is entered. */
  onSetUpSchedule?: (t: MaintenanceTruck) => void
}) {
  const [rows,    setRows]    = useState<MaintenanceTruck[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [search,  setSearch]  = useState('')

  const [inspectTruck, setInspectTruck] = useState<MaintenanceTruck | null>(null)
  const [viewReport,   setViewReport]   = useState<DriverReport | null>(null)
  const [holdTarget,   setHoldTarget]   = useState<MaintenanceTruck | null>(null)
  const [serviceTruck, setServiceTruck] = useState<MaintenanceTruck | null>(null)
  const [busy,         setBusy]         = useState(false)

  const truckLocks = useRecordLocks('truck', canEdit)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const list = await adminFetchMaintenanceQueue()
      setRows(list)
      onCount?.(list.length)
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load the maintenance list. Please try again.'))
    } finally {
      setLoading(false)
    }
  }, [onCount])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? rows.filter((t) =>
          [t.plate_number, t.truck_model?.name, t.truck_model?.vehicle_type, assignedDriverName(t)]
            .some((v) => v?.toLowerCase().includes(q)))
      : rows
    return [...list].sort((a, b) => (flaggedAt(b) ?? '').localeCompare(flaggedAt(a) ?? ''))
  }, [rows, search])

  async function executeHold() {
    if (!holdTarget) return
    const id = holdTarget.truck_id
    setBusy(true)
    try {
      await adminUpdateTruck(id, { status: 'under_maintenance' })
      appToast.success(`${holdTarget.plate_number} is out of service.`, { action: 'truck-maintenance', entityId: id })
      setHoldTarget(null)
      await load()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'truck-maintenance', entityId: id })
    } finally {
      setBusy(false)
    }
  }

  function rowActions(t: MaintenanceTruck): RowAction[] {
    const lockedBy = truckLocks.get(t.truck_id)
    const lockedTitle = lockedBy ? `${lockedBy} is editing this vehicle` : undefined
    const actions: RowAction[] = t.open_reports.map((r, i) => ({
      label: t.open_reports.length > 1 ? `View Report ${i + 1}` : 'View Report',
      icon:  <FileWarning size={13} />,
      onSelect: () => setViewReport(r),
    }))
    if (!canEdit) return actions

    const serviceReason = t.maintenance_reasons.some((r) => SERVICE_REASONS.includes(r))
    if (t.maintenance_reasons.includes('service_schedule_missing') && onSetUpSchedule) {
      actions.push({
        label: 'Set Up Service Schedule', icon: <Settings2 size={13} />, tone: 'accent',
        separated: actions.length > 0,
        onSelect: () => onSetUpSchedule(t), disabled: !!lockedBy, title: lockedTitle,
      })
    }
    if (serviceReason || t.maintenance_reasons.includes('under_maintenance')) {
      actions.push({
        label: 'Record Service', icon: <Wrench size={13} />,
        tone: t.maintenance_reasons.includes('service_overdue') ? 'accent' : 'default',
        separated: actions.length > 0 && !actions.some((a) => a.label === 'Set Up Service Schedule'),
        onSelect: () => setServiceTruck(t), disabled: !!lockedBy, title: lockedTitle,
      })
    }

    // Only reachable when a driver report is the sole reason: the vehicle still
    // reads as serviceable, so someone has to take it off the road. Not while it
    // is out on a booking — pulling it mid-delivery is the Operations Manager's call.
    const holdable = t.status === 'available' || t.status === 'recheck_due' || t.status === 'inactive'
    if (!t.maintenance_reasons.includes('under_maintenance') && holdable) {
      actions.push({
        label: 'Take Out of Service', icon: <Ban size={13} />, tone: 'warning', separated: actions.length > 0,
        onSelect: () => setHoldTarget(t), disabled: !!lockedBy, title: lockedTitle,
      })
    }
    actions.push({
      label: 'Approve Vehicle', icon: <ClipboardCheck size={13} />, tone: 'accent',
      separated: actions.length > 0 && actions[actions.length - 1].tone !== 'warning',
      onSelect: () => setInspectTruck(t),
      disabled: !!lockedBy || t.status === 'in_use',
      title: lockedTitle ?? (t.status === 'in_use'
        ? 'Out on a booking — inspect it once it is back in the yard'
        : 'Record a BLOWBAGETS inspection; a pass returns it to service'),
    })
    return actions
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 gap-3 overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0">
        <div className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-md" style={{ background: '#2a2828' }}>
          <Search size={16} className="text-white/40 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plate, model, driver…"
            className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 self-start sm:self-auto sm:ml-auto rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
            <p className="text-sm text-white/45">Loading maintenance list…</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-red-400 text-sm text-center">{error}</p>
            <button type="button" onClick={() => void load()} className="text-[var(--color-cyan)] text-sm font-semibold">
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
            <Wrench size={40} className="text-white/20" />
            <p className="text-sm text-white/45">
              {rows.length === 0 ? 'No vehicle needs maintenance right now.' : 'No vehicles match your search.'}
            </p>
          </div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-left text-sm border-collapse min-w-[760px]">
              <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                <tr className="text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-2 py-2.5 font-bold w-14 text-center">Image</th>
                  <th className="px-3 py-2.5 font-bold">Plate</th>
                  <th className="px-3 py-2.5 font-bold hidden md:table-cell">Model</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold">Why</th>
                  <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Flagged</th>
                  <th className="px-3 py-2.5 font-bold text-right w-[90px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const failed = failedItems(t.latest_inspection)
                  return (
                    <tr key={t.truck_id} className="border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors align-top">
                      <td className="px-2 py-2">
                        <div className="flex justify-center">
                          <ModelThumb
                            imageUrl={resolveModelImageUrl((t.truck_model?.image_url as string | null | undefined) ?? null)}
                            label={t.truck_model?.name ?? 'Vehicle'}
                            size={44}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-white">
                        {t.plate_number}
                        {assignedDriverName(t) && (
                          <span className="block font-sans font-normal text-[10px] text-white/35">{assignedDriverName(t)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-white/60 text-xs hidden md:table-cell">
                        {t.truck_model?.name ?? '—'}
                        {t.truck_model?.vehicle_type && <span className="block text-white/35">{t.truck_model.vehicle_type}</span>}
                      </td>
                      <td className="px-3 py-2.5"><TruckStatusBadge status={t.status} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1.5 items-start">
                          {t.maintenance_reasons.map((reason) => (
                            <div key={reason} className="flex flex-col gap-0.5 items-start">
                              <ReasonChip reason={reason}>
                                {reason === 'driver_report' && t.open_reports.length > 1 ? ` ×${t.open_reports.length}` : null}
                              </ReasonChip>
                              {reason === 'failed_inspection' && failed.length > 0 && (
                                <span className="text-[10px] text-white/40">Failed: {failed.join(', ')}</span>
                              )}
                              {(reason === 'service_overdue' || reason === 'service_due_soon') && t.service_status && (
                                <span className="text-[10px] text-white/40">
                                  Due {fmtDay(t.service_status.due_date)} or at {fmtKm(t.service_status.due_km)}
                                  {' · now '}{fmtKm(t.odometer_km)}
                                </span>
                              )}
                              {reason === 'service_schedule_missing' && (
                                <span className="text-[10px] text-white/40">
                                  {t.service_interval_km == null || t.service_interval_months == null
                                    ? 'Enter the service interval'
                                    : t.last_service_at == null
                                      ? 'Enter the last service'
                                      : 'Enter the current odometer'}
                                </span>
                              )}
                              {reason === 'driver_report' && (
                                <span className="text-[10px] text-white/40">
                                  {t.open_reports.map((r) => r.sub_type || incidentLabel(r.incident_type)).join(' · ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-white/50 tabular-nums hidden lg:table-cell">{fmtWhen(flaggedAt(t))}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <RecordLockBadge holder={truckLocks.get(t.truck_id)} />
                          <RowActionMenu label={`Actions for ${t.plate_number}`} actions={rowActions(t)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Read-only here: answering a report is the Reports desk's job. */}
      <DriverReportDetailModal report={viewReport} onClose={() => setViewReport(null)} />

      <RecordServiceModal
        truck={serviceTruck}
        onClose={() => setServiceTruck(null)}
        onRecorded={() => { void load() }}
      />

      <BlowbagetsInspectionModal
        truck={inspectTruck}
        onClose={() => setInspectTruck(null)}
        onRecorded={() => { void load() }}
      />

      <ReusableModal
        open={!!holdTarget}
        title="Take vehicle out of service?"
        description={holdTarget
          ? `${holdTarget.plate_number} will be set to Under Maintenance and cannot be assigned to bookings until it passes a BLOWBAGETS inspection.`
          : undefined}
        confirmLabel={busy ? 'Saving…' : 'Take Out of Service'}
        cancelLabel="Cancel"
        disableBackdropClose={busy}
        onCancel={() => { if (!busy) setHoldTarget(null) }}
        onConfirm={() => { void executeHold() }}
      />
    </div>
  )
}
