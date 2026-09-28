'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, RefreshCw, Eye, CheckCheck, CircleCheck, Siren, Tags } from 'lucide-react'

import {
  fetchDriverReports,
  fetchDriverReport,
  setDriverReportStatus,
  classifyDriverReport,
} from '@/lib/services/admin/driver-reports.service'
import {
  incidentLabel,
  isUrgentReport,
  reportDriverName,
  INCIDENT_LABELS,
  REPORT_STATUS_LABELS,
  VEHICLE_INCIDENTS,
  isVehicleIncident,
  type DriverReport,
  type IncidentType,
  type ReportStatus,
} from '@/app/types/driver-report.types'
import DriverReportDetailModal, { ReportStatusBadge, UrgentBadge } from '@/components/reports/DriverReportDetailModal'
import ClassifyReportModal from '@/components/reports/ClassifyReportModal'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { useRecordLock, useRecordLocks } from '@/lib/hooks/useRecordLock'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import RecordLockBanner, { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { useAuthStore } from '@/lib/store/auth.store'

/**
 * The Reports module — the staff side of the driver app's Reports tab.
 *
 * Company Administrator and Operations Manager work this queue: a driver's
 * report comes in as New, someone Acknowledges it (the driver is being looked
 * after), and it is Resolved with a note of what was done. Every write takes the
 * report's record lock, so two people cannot answer the same incident at once.
 *
 * The Fleet Manager uses the same page but the server only returns vehicle
 * reports (breakdowns, accidents). An "Unspecified Emergency" quick alert stays
 * off their list until the desk Classifies it — which only the desk can do.
 */

// Live updates come from useLiveTable; this slow poll is only a safety net for
// a dropped realtime connection.
const POLL_MS = 60_000

type StatusFilter = 'open' | 'all' | ReportStatus

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'open',         label: 'Open' },
  { key: 'reported',     label: REPORT_STATUS_LABELS.reported },
  { key: 'acknowledged', label: REPORT_STATUS_LABELS.acknowledged },
  { key: 'resolved',     label: REPORT_STATUS_LABELS.resolved },
  { key: 'all',          label: 'All' },
]

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

// Opens ?report=<id> (a notification tap) once. Isolated so useSearchParams
// sits under its own Suspense boundary.
function ReportDeepLink({ onFocus }: { onFocus: (id: string) => void }) {
  const searchParams = useSearchParams()
  const focusId = searchParams.get('report')
  const openedRef = useRef<string | null>(null)
  useEffect(() => {
    if (focusId && openedRef.current !== focusId) {
      openedRef.current = focusId
      onFocus(focusId)
    }
  }, [focusId, onFocus])
  return null
}

export default function ReportsView() {
  const [reports, setReports] = useState<DriverReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [typeFilter,   setTypeFilter]   = useState<'all' | IncidentType | 'unspecified'>('all')

  const [viewId,      setViewId]      = useState<string | null>(null)
  const [confirmAck,  setConfirmAck]  = useState<DriverReport | null>(null)
  const [resolveOf,   setResolveOf]   = useState<DriverReport | null>(null)
  const [classifyOf,  setClassifyOf]  = useState<DriverReport | null>(null)
  const [classifyAs,  setClassifyAs]  = useState<IncidentType | ''>('')
  const [busy,        setBusy]        = useState(false)

  // Reports tier: Read-only viewers see the queue but cannot answer it.
  const { canEdit } = useModuleAccess()
  // The fleet manager sees vehicle reports only and never classifies.
  const isFleet     = useAuthStore((s) => s.user?.role) === 'fleet_manager'
  const canClassify = canEdit && !isFleet
  const typeOptions = isFleet ? VEHICLE_INCIDENTS : (Object.keys(INCIDENT_LABELS) as IncidentType[])

  const load = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true)
      setError(null)
      setReports(await fetchDriverReports())
    } catch (e) {
      if (!quiet) setError(getApiErrorMessage(e, 'Could not load reports. Please try again.'))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // A driver in trouble should not wait for someone to press Refresh.
  useLiveTable(['live:driver_reports'], () => { void load(true) })

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  // A deep-linked report may be older than the loaded list, or the list may
  // still be loading — fetch it on its own and merge it in.
  const focusReport = useCallback((id: string) => {
    setViewId(id)
    void fetchDriverReport(id)
      .then((r) => setReports((prev) => (prev.some((p) => p.report_id === id)
        ? prev.map((p) => (p.report_id === id ? r : p))
        : [r, ...prev])))
      .catch(() => {
        appToast.error('That report could not be found.', { action: 'report-open', entityId: id })
        setViewId(null)
      })
  }, [])

  const viewReport = useMemo(() => reports.find((r) => r.report_id === viewId) ?? null, [reports, viewId])

  // One responder per incident. Only taken while the report can still change.
  const reportLock = useRecordLock({
    type:    'driver_report',
    id:      canEdit && viewReport && (viewReport.status !== 'resolved' || (canClassify && !viewReport.incident_type))
      ? viewReport.report_id
      : null,
    onStale: () => {
      appToast.info('Someone else just updated this report. Showing the latest.', {
        action: 'report-stale', entityId: viewId ?? undefined,
      })
      if (viewId) focusReport(viewId)
    },
  })
  const reportLocks = useRecordLocks('driver_report', canEdit)

  const counts = useMemo(() => {
    const c = { reported: 0, acknowledged: 0, resolved: 0, unclassified: 0 }
    for (const r of reports) {
      c[r.status]++
      if (!r.incident_type && r.status !== 'resolved') c.unclassified++
    }
    return c
  }, [reports])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reports.filter((r) => {
      if (statusFilter === 'open' && r.status === 'resolved') return false
      if (statusFilter !== 'open' && statusFilter !== 'all' && r.status !== statusFilter) return false
      if (typeFilter === 'unspecified' && r.incident_type !== null) return false
      if (typeFilter !== 'all' && typeFilter !== 'unspecified' && r.incident_type !== typeFilter) return false
      if (!q) return true
      return [
        reportDriverName(r),
        r.trucks?.plate_number,
        r.bookings?.reference_number,
        r.sub_type,
        r.description,
        r.address,
        incidentLabel(r.incident_type),
      ].some((v) => v?.toLowerCase().includes(q))
    })
  }, [reports, search, statusFilter, typeFilter])

  async function applyStatus(r: DriverReport, next: 'acknowledged' | 'resolved', note?: string) {
    setBusy(true)
    try {
      await setDriverReportStatus(r.report_id, next, note)
      appToast.success(
        next === 'acknowledged' ? 'Report acknowledged.' : 'Report resolved.',
        { action: `report-${next}`, entityId: r.report_id },
      )
      setConfirmAck(null)
      setResolveOf(null)
      setClassifyOf(null)
      // Re-read the list rather than patching the row: the PATCH response does
      // not carry the responder names the table shows.
      await load(true)
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: `report-${next}`, entityId: r.report_id })
    } finally {
      setBusy(false)
    }
  }

  async function applyClassification() {
    if (!classifyOf || !classifyAs) return
    const r = classifyOf
    setBusy(true)
    try {
      await classifyDriverReport(r.report_id, classifyAs)
      appToast.success(
        isVehicleIncident(classifyAs)
          ? `Classified as ${INCIDENT_LABELS[classifyAs]}. The Fleet Manager has been notified.`
          : `Classified as ${INCIDENT_LABELS[classifyAs]}.`,
        { action: 'report-classify', entityId: r.report_id },
      )
      setClassifyOf(null)
      await load(true)
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Request failed. Please try again.'), { action: 'report-classify', entityId: r.report_id })
    } finally {
      setBusy(false)
    }
  }

  function openClassify(r: DriverReport) {
    setClassifyAs('')
    setClassifyOf(r)
  }

  function rowActions(r: DriverReport): RowAction[] {
    const lockedBy = reportLocks.get(r.report_id)
    const lockedTitle = lockedBy ? `${lockedBy} is handling this report` : undefined
    const actions: RowAction[] = [
      { label: 'View Details', icon: <Eye size={13} />, onSelect: () => setViewId(r.report_id) },
    ]
    if (canClassify && !r.incident_type) {
      actions.push({
        label: 'Classify', icon: <Tags size={13} />, tone: 'accent',
        onSelect: () => openClassify(r), disabled: !!lockedBy, title: lockedTitle,
      })
    }
    if (!canEdit || r.status === 'resolved') return actions
    if (r.status === 'reported') {
      actions.push({
        label: 'Acknowledge', icon: <CheckCheck size={13} />, tone: 'accent',
        onSelect: () => setConfirmAck(r), disabled: !!lockedBy, title: lockedTitle,
      })
    }
    actions.push({
      label: 'Resolve', icon: <CircleCheck size={13} />, separated: r.status === 'reported',
      onSelect: () => setResolveOf(r), disabled: !!lockedBy, title: lockedTitle,
    })
    return actions
  }

  const detailActions = viewReport && canEdit && (viewReport.status !== 'resolved' || (canClassify && !viewReport.incident_type)) ? (
    <>
      {canClassify && !viewReport.incident_type && (
        <button
          type="button"
          disabled={reportLock.readOnly}
          onClick={() => openClassify(viewReport)}
          className="px-4 py-2 rounded-lg border border-[var(--color-cyan)]/40 text-sm font-semibold text-[var(--color-cyan)] hover:bg-[rgba(77,249,237,0.08)] disabled:opacity-40"
        >
          Classify
        </button>
      )}
      {viewReport.status !== 'resolved' && (<>
      {viewReport.status === 'reported' && (
        <button
          type="button"
          disabled={reportLock.readOnly}
          onClick={() => setConfirmAck(viewReport)}
          className="px-4 py-2 rounded-lg border border-white/15 text-sm font-semibold text-white/85 hover:bg-white/5 disabled:opacity-40"
        >
          Acknowledge
        </button>
      )}
      <button
        type="button"
        disabled={reportLock.readOnly}
        onClick={() => setResolveOf(viewReport)}
        className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-40"
        style={{ background: 'var(--color-cyan)' }}
      >
        Resolve
      </button>
      </>)}
    </>
  ) : null

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-sc bg-[var(--color-bg)]">
      <Suspense fallback={null}>
        <ReportDeepLink onFocus={focusReport} />
      </Suspense>

      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Reports</h1>
          <p className="text-xs text-white/40 mt-0.5">
            {isFleet && 'Vehicle-related reports · '}
            {counts.reported} new · {counts.acknowledged} acknowledged
            {!isFleet && counts.unclassified > 0 && (
              <span className="text-amber-300"> · {counts.unclassified} to classify</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </header>

      <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 gap-3 overflow-hidden">
        <div className="flex flex-col xl:flex-row gap-2 xl:items-center shrink-0">
          <div className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-md" style={{ background: '#2a2828' }}>
            <Search size={16} className="text-white/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search driver, plate, reference…"
              className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/35 self-center mr-1">Status</span>
            {STATUS_FILTERS.map(({ key, label }) => {
              const active = statusFilter === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                  style={{
                    background:  active ? 'rgba(77,249,237,0.12)' : 'transparent',
                    borderColor: active ? 'rgba(77,249,237,0.35)' : 'rgba(255,255,255,0.08)',
                    color:       active ? 'var(--color-cyan)' : '#888',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="rounded-lg border border-white/10 bg-[#111] px-3 py-1.5 text-xs text-white/80 outline-none xl:ml-auto"
            aria-label="Incident type"
          >
            <option value="all">All incident types</option>
            {typeOptions.map((k) => (
              <option key={k} value={k}>{INCIDENT_LABELS[k]}</option>
            ))}
            {!isFleet && <option value="unspecified">Unspecified Emergency</option>}
          </select>
        </div>

        <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
              <p className="text-sm text-white/45">Loading reports…</p>
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
              <Siren size={40} className="text-white/20" />
              <p className="text-sm text-white/45">
                {reports.length === 0
                  ? (isFleet ? 'No vehicle-related reports yet.' : 'No driver has raised a report yet.')
                  : 'No reports match your filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-left text-sm border-collapse min-w-[760px]">
                <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                  <tr className="text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-3 py-2.5 font-bold">Received</th>
                    <th className="px-3 py-2.5 font-bold">Incident</th>
                    <th className="px-3 py-2.5 font-bold">Driver</th>
                    <th className="px-3 py-2.5 font-bold">Vehicle</th>
                    <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Booking</th>
                    <th className="px-3 py-2.5 font-bold">Status</th>
                    <th className="px-3 py-2.5 font-bold text-right w-[90px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr
                      key={r.report_id}
                      className="border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors cursor-pointer"
                      onClick={() => setViewId(r.report_id)}
                    >
                      <td className="px-3 py-2.5 text-xs text-white/60 tabular-nums whitespace-nowrap">{fmtWhen(r.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-white/85 font-semibold">{incidentLabel(r.incident_type)}</span>
                          {r.sub_type && <span className="text-[11px] text-white/40">{r.sub_type}</span>}
                          {!r.incident_type && !isFleet && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border text-amber-300 border-amber-400/35 bg-amber-400/10">
                              Needs classification
                            </span>
                          )}
                          {isUrgentReport(r) && r.status !== 'resolved' && <UrgentBadge />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-white/70">{reportDriverName(r)}</td>
                      <td className="px-3 py-2.5 font-mono text-white/70">{r.trucks?.plate_number ?? <span className="text-white/25 font-sans">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-white/60 hidden lg:table-cell">{r.bookings?.reference_number ?? '—'}</td>
                      <td className="px-3 py-2.5"><ReportStatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <RecordLockBadge holder={reportLocks.get(r.report_id)} />
                          <RowActionMenu label={`Actions for report from ${reportDriverName(r)}`} actions={rowActions(r)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <DriverReportDetailModal
        report={viewReport}
        onClose={() => setViewId(null)}
        banner={<RecordLockBanner lock={reportLock} noun="report" />}
        actions={detailActions}
      />

      <ReusableModal
        open={!!confirmAck}
        title="Acknowledge report?"
        description={confirmAck
          ? `Mark ${reportDriverName(confirmAck)}'s ${incidentLabel(confirmAck.incident_type).toLowerCase()} report as seen. Everyone watching the queue will see it is being handled.`
          : undefined}
        confirmLabel={busy ? 'Saving…' : 'Acknowledge'}
        cancelLabel="Cancel"
        disableBackdropClose={busy}
        onCancel={() => { if (!busy) setConfirmAck(null) }}
        onConfirm={() => { if (confirmAck) void applyStatus(confirmAck, 'acknowledged') }}
      />

      <ClassifyReportModal
        report={classifyOf}
        value={classifyAs}
        busy={busy}
        onChange={setClassifyAs}
        onCancel={() => { if (!busy) setClassifyOf(null) }}
        onConfirm={() => { void applyClassification() }}
      />

      <RemarksModal
        open={!!resolveOf}
        title="Resolve report?"
        description="Record what was done. The note stays on the report."
        remarksLabel="Resolution"
        remarksPlaceholder="e.g. Replacement vehicle sent; driver safe and delivery completed."
        confirmLabel={busy ? 'Saving…' : 'Resolve'}
        cancelLabel="Cancel"
        busy={busy}
        disableBackdropClose={busy}
        onCancel={() => { if (!busy) setResolveOf(null) }}
        onConfirm={(note) => { if (resolveOf) void applyStatus(resolveOf, 'resolved', note) }}
      />
    </div>
  )
}
