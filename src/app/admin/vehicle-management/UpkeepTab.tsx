'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Ban, ClipboardCheck, FileWarning, Gauge, Settings2, Wrench } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { canViewModule } from '@/lib/permissions'
import { MODULES_BY_ROLE, isManagedRole } from '@/constants/modules'
import { ROLE_ROUTES } from '@/constants/roles'

import type { MaintenanceReason, MaintenanceTruck, Truck } from '@/app/types/truck.types'
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
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import Pagination from '@/components/ui/Pagination'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { ModelThumb, TABLE_TAG, resolveModelImageUrl } from './vehicle-ui'

/**
 * Vehicle Management → Maintenance: everything a vehicle owes before it can go out,
 * ONE ROW PER PROBLEM. A truck with an overdue service and a failed inspection
 * is two rows, each with the one button that fixes it.
 *
 * Problems that block assignment come first, oldest first (the queue is worked
 * first in, first out); heads-ups (service due soon, schedule not set) follow.
 * A row disappears on its own once its problem is fixed. The vehicle's identity
 * lives on the Vehicles tab; this tab is only the work list.
 */

type ProblemType = 'inspection' | 'service' | 'report' | 'odometer'

/**
 * The three "needs" the finalized Figma shows (3158:1059 Maintenance, 3158:613
 * Vehicles). Each reason folds into one of them; the details column still says
 * exactly what is owed, and the row menu offers the action that fixes it.
 */
export type NeedGroup = 'blowbagets' | 'vehicle_maintenance' | 'driver_report'

export const NEED_GROUPS: Record<NeedGroup, {
  /** Maintenance tab "needs" tag. */
  label: string
  /** Vehicles tab "maintenance" tag. */
  short: string
  color: string
  bg:    string
}> = {
  blowbagets:          { label: 'Blowbagets Re-check', short: 'Blowbagets',          color: '#ffffff', bg: 'rgba(255,255,255,0.15)' },
  vehicle_maintenance: { label: 'Vehicle Maintenance', short: 'Vehicle Maintenance', color: '#ffea00', bg: 'rgba(255,234,0,0.24)'   },
  driver_report:       { label: 'View Driver Report',  short: 'Driver Report',       color: '#f62626', bg: 'rgba(246,38,38,0.13)'   },
}

/** Display order wherever several groups show together. */
export const NEED_GROUP_ORDER: NeedGroup[] = ['driver_report', 'blowbagets', 'vehicle_maintenance']

interface Problem {
  key:      string
  truck:    MaintenanceTruck
  reason:   MaintenanceReason
  report?:  DriverReport
  needs:    string
  group:    NeedGroup
  details:  string
  since:    string | null
  blocking: boolean
  type:     ProblemType
}

const NEEDS: Record<MaintenanceReason, { group: NeedGroup; blocking: boolean; type: ProblemType }> = {
  return_odometer_due:      { group: 'vehicle_maintenance', blocking: true,  type: 'odometer'   },
  recheck_due:              { group: 'blowbagets',          blocking: true,  type: 'inspection' },
  never_inspected:          { group: 'blowbagets',          blocking: true,  type: 'inspection' },
  failed_inspection:        { group: 'blowbagets',          blocking: true,  type: 'inspection' },
  under_maintenance:        { group: 'vehicle_maintenance', blocking: true,  type: 'inspection' },
  driver_report:            { group: 'driver_report',       blocking: true,  type: 'report'     },
  service_overdue:          { group: 'vehicle_maintenance', blocking: true,  type: 'service'    },
  service_due_soon:         { group: 'vehicle_maintenance', blocking: false, type: 'service'    },
  service_schedule_missing: { group: 'vehicle_maintenance', blocking: false, type: 'service'    },
}

/** 'odometer' narrows Vehicle Maintenance to the after-delivery odometer readings. */
type GroupFilter = 'all' | NeedGroup | 'odometer'

const GROUP_FILTERS: { key: GroupFilter; label: string }[] = [
  { key: 'all',                 label: 'All' },
  { key: 'blowbagets',          label: 'Blowbagets Re-check' },
  { key: 'vehicle_maintenance', label: 'Vehicle Maintenance' },
  { key: 'odometer',            label: 'Odometer' },
  { key: 'driver_report',       label: 'Driver Report' },
]

function matchesFilter(p: Problem, f: GroupFilter): boolean {
  if (f === 'all') return true
  if (f === 'odometer') return p.type === 'odometer'
  return p.group === f
}

const PAGE_SIZE = 15

/** The highlighted rows of the vehicle clicked on the Vehicles tab. */
const FOCUS_ROW = 'bg-[#4df9ed]/10 shadow-[inset_3px_0_0_#4df9ed]'

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
      const base = { truck: t, reason, needs: NEED_GROUPS[cfg.group].label, group: cfg.group, blocking: cfg.blocking, type: cfg.type }
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
          details = 'Out of service — a passing inspection returns it'
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
  focusTruck = null,
  vehicleActions,
}: {
  /** The maintenance queue; the page owns it so the tab badge and the Vehicles "issues" links share one read. */
  rows:      MaintenanceTruck[]
  loading:   boolean
  error:     string | null
  onReload:  () => void
  canEdit:   boolean
  /** Controlled, so the Vehicles tab's maintenance tags can open this tab filtered to one plate. */
  search:         string
  onSearchChange: (s: string) => void
  /** Opens the vehicle's edit form, where the service schedule is entered. */
  onSetUpSchedule?:  (t: MaintenanceTruck) => void
  /** Opens the odometer form for the after-delivery reading. */
  onRecordOdometer?: (t: MaintenanceTruck) => void
  /** The vehicle clicked on the Vehicles tab: its rows go first and are highlighted. */
  focusTruck?:   Truck | null
  /** The vehicle's own actions (view, update, odometer, service, archive), added to each row's menu. */
  vehicleActions?: (t: Truck) => RowAction[]
}) {
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all')
  const [page,       setPage]       = useState(1)

  const [inspectTruck, setInspectTruck] = useState<MaintenanceTruck | null>(null)
  const [viewReport,   setViewReport]   = useState<DriverReport | null>(null)
  const [holdTarget,   setHoldTarget]   = useState<MaintenanceTruck | null>(null)
  const [serviceTruck, setServiceTruck] = useState<MaintenanceTruck | null>(null)
  const [busy,         setBusy]         = useState(false)

  const truckLocks = useRecordLocks('truck', canEdit)

  // The Reports page for this user's portal, or null when they can't open it
  // (the General Manager has no Reports module; others may have it revoked).
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const reportsBase = useMemo(() => {
    const role = user?.role
    if (!role || !isManagedRole(role) || !MODULES_BY_ROLE[role].includes('reports')) return null
    if (!canViewModule(user, 'reports')) return null
    return `${ROLE_ROUTES[role]}/reports`
  }, [user])

  const problems = useMemo(() => toProblems(rows), [rows])
  const visible  = useMemo(() => {
    const q = search.trim().toLowerCase()
    return problems.filter((p) =>
      matchesFilter(p, groupFilter) &&
      (!q || [p.truck.plate_number, p.truck.truck_model?.name, p.truck.truck_model?.vehicle_type, assignedDriverName(p.truck)]
        .some((v) => v?.toLowerCase().includes(q))))
  }, [problems, search, groupFilter])

  // The vehicle clicked on the Vehicles tab goes first and is highlighted. A
  // vehicle that owes nothing (or is archived) has no rows, so it gets a pinned
  // row of its own: that is where its actions live now.
  const focusId  = focusTruck?.truck_id ?? null
  const ordered  = useMemo(() => focusId
    ? [...visible.filter((p) => p.truck.truck_id === focusId), ...visible.filter((p) => p.truck.truck_id !== focusId)]
    : visible, [visible, focusId])
  const pinFocus = !!focusTruck && !problems.some((p) => p.truck.truck_id === focusId)
  useEffect(() => { if (focusId) setPage(1) }, [focusId])

  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = ordered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

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

  /** The row's 3-dot menu: the action that fixes it first, then the vehicle's own actions. */
  function rowActions(p: Problem): RowAction[] {
    const fixes = fixActions(p)
    const own   = (vehicleActions?.(p.truck) ?? []).filter((a) => !fixes.some((f) => f.label === a.label))
    if (fixes.length && own.length) own[0] = { ...own[0], separated: true }
    return [...fixes, ...own]
  }

  function fixActions(p: Problem): RowAction[] {
    const t        = p.truck
    const lockedBy = truckLocks.get(t.truck_id)
    const locked   = lockedBy ? `${lockedBy} is editing this vehicle` : undefined
    const actions: RowAction[] = []

    if (p.type === 'report' && p.report) {
      const report = p.report
      actions.push({ label: 'View Report', icon: <FileWarning size={13} />, tone: 'accent', onSelect: () => setViewReport(report) })
      // A driver report alone leaves the vehicle reading as serviceable;
      // someone may need to take it off the road.
      const holdable = canEdit && !t.maintenance_reasons.includes('under_maintenance')
        && (t.status === 'available' || t.status === 'recheck_due')
      if (holdable) {
        actions.push({
          label: 'Take Out of Service', icon: <Ban size={13} />, tone: 'warning', separated: true,
          onSelect: () => setHoldTarget(t), disabled: !!lockedBy, title: locked,
        })
      }
      return actions
    }
    if (!canEdit) return actions

    if (p.type === 'odometer') {
      actions.push({ label: 'Record Odometer', icon: <Gauge size={13} />, tone: 'accent', onSelect: () => onRecordOdometer?.(t), disabled: !!lockedBy, title: locked })
    } else if (p.type === 'inspection') {
      const onTrip = t.status === 'in_use'
      actions.push({
        label: 'Inspect', icon: <ClipboardCheck size={13} />, tone: 'accent',
        onSelect: () => setInspectTruck(t), disabled: !!lockedBy || onTrip,
        title: locked ?? (onTrip ? 'Out on a booking — inspect it once it is back in the yard' : 'Record a BLOWBAGETS inspection; a pass clears it'),
      })
    } else if (p.reason === 'service_schedule_missing') {
      actions.push({ label: 'Set Up Schedule', icon: <Settings2 size={13} />, tone: 'accent', onSelect: () => onSetUpSchedule?.(t), disabled: !!lockedBy, title: locked })
    } else {
      actions.push({ label: 'Record Service', icon: <Wrench size={13} />, tone: 'accent', onSelect: () => setServiceTruck(t), disabled: !!lockedBy, title: locked })
    }
    return actions
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
            aria-label="Search maintenance"
            className="h-9 3xl:h-[46px] w-full rounded-[10px] border border-[#818181] bg-[#424242] pl-9 3xl:pl-[49px] pr-4 text-[14px] 3xl:text-[18px] text-white placeholder:text-[#818181] outline-none transition focus:border-[#4df9ed]"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0 xl:ml-auto">
          <label htmlFor="maintenance-needs-filter" className="text-[13px] 3xl:text-[16px] font-bold text-[#818181]">status</label>
          <div className="relative">
            <select
              id="maintenance-needs-filter"
              value={groupFilter}
              onChange={(e) => { setGroupFilter(e.target.value as GroupFilter); setPage(1) }}
              className="appearance-none h-8 3xl:h-[38px] min-w-[150px] rounded-[10px] border-[0.5px] border-[#818181] bg-[#2a2828] pl-3 3xl:pl-[15px] pr-8 text-[13px] 3xl:text-[16px] font-bold text-[#4df9ed] outline-none focus:border-[#4df9ed] cursor-pointer [&>option]:bg-[#2a2828] [&>option]:text-white"
            >
              {GROUP_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({problems.filter((p) => matchesFilter(p, f.key)).length})
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
            <p className="text-sm text-white/45">Loading maintenance…</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-red-400 text-sm text-center">{error}</p>
            <button type="button" onClick={onReload} className="text-[var(--color-cyan)] text-sm font-semibold">Try again</button>
          </div>
        ) : visible.length === 0 && !pinFocus ? (
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
                    <th className="hidden md:table-cell">vehicle model</th>
                    <th>needs</th>
                    <th className="hidden lg:table-cell">details</th>
                    <th className="hidden md:table-cell">since</th>
                    <th>blocks assignment</th>
                    <th className="text-right">actions</th>
                  </tr>
                </thead>
                <tbody className="ff-regular text-[13px] 3xl:text-[16px] text-white">
                  {pinFocus && focusTruck && safePage === 1 && (
                    <tr className={`border-b border-[#818181] ${FOCUS_ROW} [&>td]:px-3 3xl:[&>td]:px-6 [&>td]:py-2 3xl:h-[55px]`}>
                      <td className="align-middle">
                        <ModelThumb
                          imageUrl={resolveModelImageUrl((focusTruck.truck_model?.image_url as string | null | undefined) ?? null)}
                          label={focusTruck.truck_model?.name ?? 'Vehicle'}
                          size={40}
                        />
                      </td>
                      <td className="font-bold text-[#4df9ed] whitespace-nowrap">{focusTruck.plate_number}</td>
                      <td className="max-w-[200px] truncate hidden md:table-cell">{focusTruck.truck_model?.name ?? '—'}</td>
                      <td>
                        {focusTruck.status === 'archived' ? '---' : (
                          <span className={TABLE_TAG} style={{ color: '#3af626', borderColor: '#3af626', background: 'rgba(58,246,38,0.1)' }}>Passed</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell max-w-[320px]">
                        {focusTruck.status === 'archived' ? 'Archived' : 'Nothing owed'}
                      </td>
                      <td className="hidden md:table-cell">—</td>
                      <td className="text-[#818181]">No</td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <RecordLockBadge holder={truckLocks.get(focusTruck.truck_id)} />
                          <RowActionMenu brightText label={`Actions for ${focusTruck.plate_number}`} actions={vehicleActions?.(focusTruck) ?? []} />
                        </div>
                      </td>
                    </tr>
                  )}
                  {pageRows.map((p) => {
                    const t   = p.truck
                    const cfg = NEED_GROUPS[p.group]
                    const tagStyle = { color: cfg.color, borderColor: cfg.color, background: cfg.bg }
                    return (
                      <tr key={p.key} className={`border-b border-[#818181] transition-colors [&>td]:px-3 3xl:[&>td]:px-6 [&>td]:py-2 3xl:h-[55px] ${
                        t.truck_id === focusId ? FOCUS_ROW : 'hover:bg-white/[0.03]'
                      }`}>
                        <td className="align-middle">
                          <ModelThumb
                            imageUrl={resolveModelImageUrl((t.truck_model?.image_url as string | null | undefined) ?? null)}
                            label={t.truck_model?.name ?? 'Vehicle'}
                            size={40}
                          />
                        </td>
                        <td className="font-bold text-[#4df9ed] whitespace-nowrap">{t.plate_number}</td>
                        <td className="max-w-[200px] truncate hidden md:table-cell">{t.truck_model?.name ?? '—'}</td>
                        <td>
                          {/* "View Driver Report" opens the report it names. */}
                          {p.report ? (
                            <button type="button" onClick={() => setViewReport(p.report!)} className={`${TABLE_TAG} cursor-pointer hover:brightness-125`} style={tagStyle}>
                              {p.needs}
                            </button>
                          ) : (
                            <span className={TABLE_TAG} style={tagStyle}>{p.needs}</span>
                          )}
                          {/* Details fold under the tag where the column is hidden. */}
                          <span className="mt-1 block text-[11px] text-[#818181] lg:hidden">{p.details}</span>
                        </td>
                        <td className="hidden lg:table-cell max-w-[320px]">{p.details}</td>
                        <td className="hidden md:table-cell whitespace-nowrap tabular-nums">{fmtSince(p.since)}</td>
                        {/* Plain text, as the Figma draws it: green Yes, grey No. */}
                        <td className={p.blocking ? 'text-[#3af626]' : 'text-[#818181]'}>
                          {p.blocking ? 'Yes' : 'No'}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1.5">
                            <RecordLockBadge holder={truckLocks.get(t.truck_id)} />
                            {(() => {
                              const actions = rowActions(p)
                              return actions.length > 0 && (
                                <RowActionMenu brightText label={`Actions for ${t.plate_number}`} actions={actions} />
                              )
                            })()}
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
      <DriverReportDetailModal
        report={viewReport}
        onClose={() => setViewReport(null)}
        // Answering a report is the Reports desk's job, so the way out leads there.
        replaceClose={reportsBase && viewReport ? (
          <button
            type="button"
            onClick={() => router.push(`${reportsBase}?report=${encodeURIComponent(viewReport.report_id)}`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#4df9ed] bg-[#4df9ed]/[0.19] px-4 py-2 text-sm font-bold text-[#4df9ed] transition hover:bg-[#4df9ed]/30 active:scale-95"
          >
            <ArrowUpRight size={15} /> View in Reports
          </button>
        ) : undefined}
      />

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
