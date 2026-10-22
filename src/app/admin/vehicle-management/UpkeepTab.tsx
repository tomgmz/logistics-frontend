'use client'

import { useMemo, useState } from 'react'
import { Ban, FileWarning, Wrench } from 'lucide-react'

import type { MaintenanceReason, MaintenanceTruck } from '@/app/types/truck.types'
import { assignedDriverName } from '@/app/types/truck.types'
import { incidentLabel, type DriverReport } from '@/app/types/driver-report.types'
import { adminUpdateTruck, flaggedBookingNotice } from '@/lib/services/admin/trucks.service'
import { BLOWBAGETS_ITEMS } from '@/lib/blowbagets'
import BlowbagetsInspectionModal from './BlowbagetsInspectionModal'
import RecordServiceModal from './RecordServiceModal'
import { fmtDay, fmtKm } from './upkeep-ui'
import DriverReportDetailModal from '@/components/reports/DriverReportDetailModal'
import ReusableModal from '@/components/layout/ReusableModal'
import { useRecordLocks } from '@/lib/hooks/useRecordLock'
import { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import RowActionMenu from '@/components/ui/RowActionMenu'
import Pagination from '@/components/ui/Pagination'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { ModelThumb, TABLE_TAG, resolveModelImageUrl } from './vehicle-ui'

/**
 * Vehicle Management → Upkeep: everything a vehicle owes before it can go out,
 * ONE ROW PER PROBLEM. A truck with an overdue service and a failed inspection
 * is two rows, each with the one button that fixes it.
 *
 * Problems that block assignment come first, oldest first (the queue is worked
 * first in, first out); heads-ups (service due soon, schedule not set) follow.
 * A row disappears on its own once its problem is fixed. The vehicle's identity
 * lives on the Vehicles tab; this tab is only the work list.
 */

type ProblemType = 'inspection' | 'service' | 'report' | 'odometer'

interface Problem {
  key:      string
  truck:    MaintenanceTruck
  reason:   MaintenanceReason
  report?:  DriverReport
  needs:    string
  details:  string
  since:    string | null
  blocking: boolean
  type:     ProblemType
}

const NEEDS: Record<MaintenanceReason, { label: string; color: string; bg: string; blocking: boolean; type: ProblemType }> = {
  return_odometer_due:      { label: 'Return odometer',      color: '#ffea00', bg: 'rgba(255,234,0,0.12)',  blocking: true,  type: 'odometer'   },
  recheck_due:              { label: 'Post-trip inspection', color: '#ffea00', bg: 'rgba(255,234,0,0.12)',  blocking: true,  type: 'inspection' },
  never_inspected:          { label: 'Never inspected',      color: '#ffea00', bg: 'rgba(255,234,0,0.12)',  blocking: true,  type: 'inspection' },
  failed_inspection:        { label: 'Failed BLOWBAGETS',    color: '#f62626', bg: 'rgba(246,38,38,0.13)',  blocking: true,  type: 'inspection' },
  under_maintenance:        { label: 'Out of service',       color: '#ff7a30', bg: 'rgba(255,122,48,0.1)',  blocking: true,  type: 'inspection' },
  driver_report:            { label: 'Driver report',        color: '#f62626', bg: 'rgba(246,38,38,0.13)',  blocking: true,  type: 'report'     },
  service_overdue:          { label: 'Service overdue',      color: '#f62626', bg: 'rgba(246,38,38,0.13)',  blocking: true,  type: 'service'    },
  service_due_soon:         { label: 'Service due soon',     color: '#4df9ed', bg: 'rgba(77,249,237,0.12)', blocking: false, type: 'service'    },
  service_schedule_missing: { label: 'Schedule not set',     color: '#818181', bg: 'rgba(129,129,129,0.1)', blocking: false, type: 'service'    },
}

const TYPE_FILTERS: { key: 'all' | ProblemType; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'inspection', label: 'Inspections' },
  { key: 'service',    label: 'Service' },
  { key: 'report',     label: 'Driver reports' },
  { key: 'odometer',   label: 'Odometer' },
]

const PAGE_SIZE = 15

function failedItems(t: MaintenanceTruck): string[] {
  const i = t.latest_inspection
  if (!i || i.passed) return []
  return BLOWBAGETS_ITEMS.filter((it) => !i.items?.[it.key]).map((it) => it.label)
}

function fmtSince(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Explode each vehicle into one row per problem. */
export function toProblems(trucks: MaintenanceTruck[]): Problem[] {
  const out: Problem[] = []
  for (const t of trucks) {
    for (const reason of t.maintenance_reasons) {
      // A failed inspection takes the truck out of service as well; one row with
      // the failed items says it all.
      if (reason === 'under_maintenance' && t.maintenance_reasons.includes('failed_inspection')) continue
      const cfg  = NEEDS[reason]
      const base = { truck: t, reason, needs: cfg.label, blocking: cfg.blocking, type: cfg.type }
      const svc  = t.service_status

      if (reason === 'driver_report') {
        for (const r of t.open_reports) {
          out.push({
            ...base, key: `${t.truck_id}:${r.report_id}`, report: r,
            details: `${r.sub_type || incidentLabel(r.incident_type)}${r.trip_can_continue === false ? ' · cannot continue' : ''}`,
            since: r.created_at,
          })
        }
        continue
      }

      let details = ''
      let since: string | null = null
      switch (reason) {
        case 'return_odometer_due':
          details = 'Back from a delivery — record the odometer'
          since   = t.last_fleet_return_at ?? null
          break
        case 'recheck_due':
          details = 'Back from a delivery since its last pass'
          since   = t.last_fleet_return_at ?? null
          break
        case 'never_inspected':
          details = 'No BLOWBAGETS on record'
          since   = t.created_at ?? null
          break
        case 'failed_inspection':
          details = failedItems(t).length ? `Failed: ${failedItems(t).join(', ')}` : 'Latest inspection failed'
          since   = t.latest_inspection?.inspected_at ?? null
          break
        case 'under_maintenance':
          details = 'Taken out of service — a passing inspection returns it'
          since   = t.updated_at ?? null
          break
        case 'service_overdue':
        case 'service_due_soon':
          details = svc ? `Due ${fmtDay(svc.due_date)} or at ${fmtKm(svc.due_km)} · now ${fmtKm(t.odometer_km)}` : ''
          since   = reason === 'service_overdue' && svc?.due_date ? `${svc.due_date}T00:00:00+08:00` : null
          break
        case 'service_schedule_missing':
          details = t.service_interval_km == null || t.service_interval_months == null
            ? 'Enter the service interval'
            : t.last_service_at == null ? 'Enter the last service' : 'Enter the current odometer'
          since   = t.created_at ?? null
          break
      }
      out.push({ ...base, key: `${t.truck_id}:${reason}`, details, since })
    }
  }
  // Blocking first; within each group, oldest first (no date sorts last).
  return out.sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1
    if (!a.since || !b.since) return a.since ? -1 : b.since ? 1 : 0
    return new Date(a.since).getTime() - new Date(b.since).getTime()
  })
}

const BTN = 'inline-flex h-7 items-center justify-center whitespace-nowrap rounded-[10px] border px-2.5 text-[13px] 3xl:text-[15px] font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100'

export default function UpkeepTab({
  rows,
  loading,
  error,
  onReload,
  canEdit,
  search,
  onSearchChange,
  onSetUpSchedule,
  onRecordOdometer,
}: {
  /** The maintenance queue; the page owns it so the tab badge and the Vehicles "issues" links share one read. */
  rows:      MaintenanceTruck[]
  loading:   boolean
  error:     string | null
  onReload:  () => void
  canEdit:   boolean
  /** Controlled, so the Vehicles tab's "N issues" badge can open this tab filtered to one plate. */
  search:         string
  onSearchChange: (s: string) => void
  /** Opens the vehicle's edit form, where the service schedule is entered. */
  onSetUpSchedule?:  (t: MaintenanceTruck) => void
  /** Opens the odometer form for the after-delivery reading. */
  onRecordOdometer?: (t: MaintenanceTruck) => void
}) {
  const [typeFilter, setTypeFilter] = useState<'all' | ProblemType>('all')
  const [page,       setPage]       = useState(1)

  const [inspectTruck, setInspectTruck] = useState<MaintenanceTruck | null>(null)
  const [viewReport,   setViewReport]   = useState<DriverReport | null>(null)
  const [holdTarget,   setHoldTarget]   = useState<MaintenanceTruck | null>(null)
  const [serviceTruck, setServiceTruck] = useState<MaintenanceTruck | null>(null)
  const [busy,         setBusy]         = useState(false)

  const truckLocks = useRecordLocks('truck', canEdit)

  const problems = useMemo(() => toProblems(rows), [rows])
  const visible  = useMemo(() => {
    const q = search.trim().toLowerCase()
    return problems.filter((p) =>
      (typeFilter === 'all' || p.type === typeFilter) &&
      (!q || [p.truck.plate_number, p.truck.truck_model?.name, p.truck.truck_model?.vehicle_type, assignedDriverName(p.truck)]
        .some((v) => v?.toLowerCase().includes(q))))
  }, [problems, search, typeFilter])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  async function executeHold() {
    if (!holdTarget) return
    const id = holdTarget.truck_id
    setBusy(true)
    try {
      const saved   = await adminUpdateTruck(id, { status: 'under_maintenance' })
      const flagged = flaggedBookingNotice(holdTarget.plate_number, saved?.flagged_booking)
      if (flagged) appToast.warn(flagged, { action: 'truck-maintenance', entityId: id })
      else appToast.success(`${holdTarget.plate_number} is out of service.`, { action: 'truck-maintenance', entityId: id })
      setHoldTarget(null)
      onReload()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'truck-maintenance', entityId: id })
    } finally {
      setBusy(false)
    }
  }

  /** The one button that fixes this row. */
  function primaryAction(p: Problem) {
    const t        = p.truck
    const lockedBy = truckLocks.get(t.truck_id)
    const locked   = lockedBy ? `${lockedBy} is editing this vehicle` : undefined
    const cyan     = 'border-[#4df9ed] bg-[#4df9ed]/[0.19] text-[#4df9ed] hover:bg-[#4df9ed]/30'
    const grey     = 'border-[#818181] text-white hover:bg-white/5'

    // Driver reports have no button: View Report sits in the row's 3-dot menu.
    if (p.type === 'report' || !canEdit) return null
    if (p.type === 'odometer') {
      return (
        <button type="button" className={`${BTN} ${cyan}`} disabled={!!lockedBy} title={locked}
          onClick={() => onRecordOdometer?.(t)}>Record odometer</button>
      )
    }
    if (p.type === 'inspection') {
      const onTrip = t.status === 'in_use'
      return (
        <button type="button" className={`${BTN} ${cyan}`} disabled={!!lockedBy || onTrip}
          title={locked ?? (onTrip ? 'Out on a booking — inspect it once it is back in the yard' : 'Record a BLOWBAGETS inspection; a pass clears it')}
          onClick={() => setInspectTruck(t)}>Inspect</button>
      )
    }
    if (p.reason === 'service_schedule_missing') {
      return (
        <button type="button" className={`${BTN} ${grey}`} disabled={!!lockedBy} title={locked}
          onClick={() => onSetUpSchedule?.(t)}>Set up schedule</button>
      )
    }
    return (
      <button type="button" className={`${BTN} ${p.blocking ? cyan : grey}`} disabled={!!lockedBy} title={locked}
        onClick={() => setServiceTruck(t)}>Record service</button>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 3xl:p-[34px] 3xl:pl-9 gap-3 3xl:gap-[14px] overflow-hidden bg-[#0a0a0a]">
      <div className="flex flex-col xl:flex-row gap-2 xl:items-center shrink-0">
        <div className="relative min-w-0 flex-1 xl:max-w-[360px] 3xl:max-w-[466px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/booking-management/search.svg" alt="" width={22} height={22} draggable={false}
            className="pointer-events-none absolute left-3 3xl:left-[18px] top-1/2 size-4 3xl:size-[22px] -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => { onSearchChange(e.target.value); setPage(1) }}
            placeholder="Search plate, model, driver..."
            aria-label="Search upkeep"
            className="h-9 3xl:h-[46px] w-full rounded-[10px] border border-[#818181] bg-[#424242] pl-9 3xl:pl-[49px] pr-4 text-[14px] 3xl:text-[18px] text-white placeholder:text-[#818181] outline-none transition focus:border-[#4df9ed]"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0 xl:ml-auto">
          <label htmlFor="upkeep-type-filter" className="text-[13px] 3xl:text-[16px] font-bold text-[#818181]">needs</label>
          <div className="relative">
            <select
              id="upkeep-type-filter"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value as 'all' | ProblemType); setPage(1) }}
              className="appearance-none h-8 3xl:h-[38px] min-w-[150px] rounded-[10px] border-[0.5px] border-[#818181] bg-[#2a2828] pl-3 3xl:pl-[15px] pr-8 text-[13px] 3xl:text-[16px] font-bold text-[#4df9ed] outline-none focus:border-[#4df9ed] cursor-pointer [&>option]:bg-[#2a2828] [&>option]:text-white"
            >
              {TYPE_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.key === 'all' ? problems.length : problems.filter((p) => p.type === f.key).length})
                </option>
              ))}
            </select>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/vehicle-management/chevron-down.svg" alt="" width={15} height={15} draggable={false}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-[10px] border-[0.5px] border-[#424242] overflow-hidden flex flex-col bg-[#1b1b1b] shadow-[0_4px_4px_rgba(0,0,0,0.25)]">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
            <p className="text-sm text-white/45">Loading upkeep…</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-red-400 text-sm text-center">{error}</p>
            <button type="button" onClick={onReload} className="text-[var(--color-cyan)] text-sm font-semibold">Try again</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
            <Wrench size={40} className="text-white/20" />
            <p className="text-sm text-white/45">
              {problems.length === 0 ? 'Every vehicle is ready. Nothing to do.' : 'Nothing matches your search.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-left border-collapse min-w-[860px]">
                {/* Headers keep the small caps face; the data rows are regular Alegreya Sans. */}
                <thead className="sticky top-0 z-[1] bg-[#181717]">
                  <tr className="text-[13px] 3xl:text-[16px] text-[#818181] [&>th]:border-b [&>th]:border-[#818181] [&>th]:font-bold [&>th]:px-3 3xl:[&>th]:px-6 [&>th]:py-2.5 3xl:[&>th]:py-[13px] [&>th]:whitespace-nowrap">
                    <th className="w-14 3xl:w-[100px]">image</th>
                    <th>plate no.</th>
                    <th className="hidden md:table-cell">model</th>
                    <th>needs</th>
                    <th className="hidden lg:table-cell">details</th>
                    <th className="hidden md:table-cell">since</th>
                    <th>blocks assignment</th>
                    <th className="text-right">action</th>
                  </tr>
                </thead>
                <tbody className="ff-regular text-[13px] 3xl:text-[16px] text-[#818181]">
                  {pageRows.map((p) => {
                    const t   = p.truck
                    const cfg = NEEDS[p.reason]
                    const holdable = p.type === 'report' && canEdit && !t.maintenance_reasons.includes('under_maintenance')
                      && (t.status === 'available' || t.status === 'recheck_due')
                    return (
                      <tr key={p.key} className="border-b border-[#818181] hover:bg-white/[0.03] transition-colors [&>td]:px-3 3xl:[&>td]:px-6 [&>td]:py-2 3xl:h-[55px]">
                        <td className="align-middle">
                          <ModelThumb
                            imageUrl={resolveModelImageUrl((t.truck_model?.image_url as string | null | undefined) ?? null)}
                            label={t.truck_model?.name ?? 'Vehicle'}
                            size={40}
                          />
                        </td>
                        <td className="font-bold text-white whitespace-nowrap">{t.plate_number}</td>
                        <td className="max-w-[200px] truncate hidden md:table-cell">{t.truck_model?.name ?? '—'}</td>
                        <td>
                          <span className={TABLE_TAG} style={{ color: cfg.color, borderColor: cfg.color, background: cfg.bg }}>{p.needs}</span>
                          {/* Details fold under the tag where the column is hidden. */}
                          <span className="mt-1 block text-[11px] lg:hidden">{p.details}</span>
                        </td>
                        <td className="hidden lg:table-cell max-w-[320px]">{p.details}</td>
                        <td className="hidden md:table-cell whitespace-nowrap tabular-nums">{fmtSince(p.since)}</td>
                        <td>
                          <span
                            className={TABLE_TAG}
                            style={p.blocking
                              ? { color: '#f62626', borderColor: '#f62626', background: 'rgba(246,38,38,0.13)' }
                              : { color: '#818181', borderColor: '#818181', background: 'rgba(129,129,129,0.1)' }}
                          >
                            {p.blocking ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1.5">
                            <RecordLockBadge holder={truckLocks.get(t.truck_id)} />
                            {primaryAction(p)}
                            {/* Driver report rows: View Report, plus Take Out of Service while
                                the report alone leaves the vehicle reading as serviceable. */}
                            {p.type === 'report' && p.report && (
                              <RowActionMenu brightText label={`Actions for ${t.plate_number}`} actions={[
                                { label: 'View Report', icon: <FileWarning size={13} />, onSelect: () => setViewReport(p.report!) },
                                ...(holdable ? [{
                                  label: 'Take Out of Service', icon: <Ban size={13} />, tone: 'warning' as const, separated: true,
                                  onSelect: () => setHoldTarget(t),
                                  disabled: !!truckLocks.get(t.truck_id),
                                }] : []),
                              ]} />
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={safePage} totalPages={totalPages} total={visible.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>

      {/* Read-only here: answering a report is the Reports desk's job. */}
      <DriverReportDetailModal report={viewReport} onClose={() => setViewReport(null)} />

      <RecordServiceModal truck={serviceTruck} onClose={() => setServiceTruck(null)} onRecorded={onReload} />

      <BlowbagetsInspectionModal truck={inspectTruck} onClose={() => setInspectTruck(null)} onRecorded={onReload} />

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
