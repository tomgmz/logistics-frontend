'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Siren, ChevronRight } from 'lucide-react'

import {
  fetchDriverReportsPage,
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
import { useModuleAccess, writeAccess } from '@/components/layout/ModuleAccess'
import { useRecordLock, useRecordLocks } from '@/lib/hooks/useRecordLock'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import RecordLockBanner, { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { useAuthStore } from '@/lib/store/auth.store'

import RefreshButton from '@/components/ui/RefreshButton'
import Pagination from '@/components/ui/Pagination'
import { useServerTable } from '@/lib/hooks/useServerTable'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import FilterBar from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import { formatDate, formatTime } from '@/app/utils/timeFormat'

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
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [typeFilter,   setTypeFilter]   = useState<'all' | IncidentType | 'unspecified'>('all')
  const debouncedSearch = useDebouncedValue(search.trim())
  // A report opened from a notification may sit on another page.
  const [focused, setFocused] = useState<DriverReport | null>(null)

  const [viewId,      setViewId]      = useState<string | null>(null)
  const [confirmAck,  setConfirmAck]  = useState<DriverReport | null>(null)
  const [resolveOf,   setResolveOf]   = useState<DriverReport | null>(null)
  const [classifyOf,  setClassifyOf]  = useState<DriverReport | null>(null)
  const [classifyAs,  setClassifyAs]  = useState<IncidentType | ''>('')
  const [busy,        setBusy]        = useState(false)

  // Reports tier: Read Only viewers see the buttons, disabled.
  const { canEdit } = useModuleAccess()
  // The fleet manager sees vehicle reports only and never classifies.
  const isFleet     = useAuthStore((s) => s.user?.role) === 'fleet_manager'
  const canClassify = !isFleet
  const typeOptions = isFleet ? VEHICLE_INCIDENTS : (Object.keys(INCIDENT_LABELS) as IncidentType[])

  // Server-side pages: the server filters, searches and counts the tabs, and
  // sends only the rows on screen (10 on phones, 20 from tablet up).
  const table = useServerTable(
    (q) => fetchDriverReportsPage({
      ...q,
      status: statusFilter,
      type:   typeFilter,
      ...(debouncedSearch && { search: debouncedSearch }),
    }),
    `${statusFilter}|${typeFilter}|${debouncedSearch}`,
    { errorMessage: 'Could not load reports. Please try again.' },
  )
  const { rows: reports, loading, error, page, setPage, pageSize: PAGE_SIZE, total, totalPages } = table
  const load = table.reload

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
      .then((r) => setFocused(r))
      .catch(() => {
        appToast.error('That report could not be found.', { action: 'report-open', entityId: id })
        setViewId(null)
      })
  }, [])

  const viewReport = useMemo(
    () => reports.find((r) => r.report_id === viewId) ?? (focused?.report_id === viewId ? focused : null),
    [reports, focused, viewId],
  )

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

  // Counted by the server over every report, whatever page is showing.
  const counts = table.meta?.counts ?? { all: 0, open: 0, reported: 0, acknowledged: 0, resolved: 0, unclassified: 0 }

  // The count on each status tab.
  const statusCount = (key: StatusFilter) => counts[key]

  // The page, plus the open report when it came from another page.
  async function refreshAll() {
    await load(true)
    if (focused && viewId === focused.report_id) {
      await fetchDriverReport(focused.report_id).then(setFocused).catch(() => {})
    }
  }

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
      await refreshAll()
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
      await refreshAll()
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

  const detailActions = viewReport && (viewReport.status !== 'resolved' || (canClassify && !viewReport.incident_type)) ? (
    <>
      {canClassify && !viewReport.incident_type && (
        <button
          type="button"
          disabled={reportLock.readOnly}
          onClick={() => openClassify(viewReport)}
          {...writeAccess(canEdit)}
          className="px-4 py-2 rounded-lg border border-[var(--color-cyan)]/40 text-sm font-semibold text-[var(--color-cyan)] hover:bg-[rgba(77,249,237,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
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
          {...writeAccess(canEdit)}
          className="px-4 py-2 rounded-lg border border-white/15 text-sm font-semibold text-white/85 hover:bg-white/5 disabled:opacity-40"
        >
          Acknowledge
        </button>
      )}
      <button
        type="button"
        disabled={reportLock.readOnly}
        onClick={() => setResolveOf(viewReport)}
        {...writeAccess(canEdit)}
        className="px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-40"
        style={{ background: 'var(--color-cyan)' }}
      >
        Resolve
      </button>
      </>)}
    </>
  ) : null

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
      <Suspense fallback={null}>
        <ReportDeepLink onFocus={focusReport} />
      </Suspense>

      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 lg:px-4 gap-6 lg:overflow-hidden">
        <div className="shrink-0">
          <p className="text-xs text-[#818181]">
            {isFleet && 'Vehicle-related reports · '}
            {counts.reported} new · {counts.acknowledged} acknowledged
            {!isFleet && counts.unclassified > 0 && (
              <span className="text-[#ffea00]"> · {counts.unclassified} to classify</span>
            )}
          </p>
        </div>

        {/* Untitled UI's table card, as on Audit Logs and User Management: the
            header (title + count), then the filter row with the status tabs on
            the left (a dropdown on phones), search, Filters and Refresh. */}
        <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">
          <TableCard.Header
            className="shrink-0"
            title="Reports"
          />
          <FilterBar
            layout="split"
            search={{ value: search, onChange: setSearch, placeholder: 'Search driver, plate, reference' }}
            leading={
              <TabsMinimal
                label="Report status"
                items={STATUS_FILTERS.map(({ key, label }) => ({ id: key, label: `${label} (${statusCount(key)})` }))}
                selectedKey={statusFilter}
                onSelectionChange={setStatusFilter}
              />
            }
            fields={[{
              key: 'type', label: 'Incident type', single: true,
              options: [
                ...typeOptions.map((k) => ({ value: k, label: INCIDENT_LABELS[k] })),
                ...(isFleet ? [] : [{ value: 'unspecified', label: 'Unspecified Emergency' }]),
              ],
            }]}
            values={typeFilter === 'all' ? [] : [{ field: 'type', op: 'is' as const, value: typeFilter }]}
            onChange={(v) => setTypeFilter((v.find((r) => r.field === 'type')?.value ?? 'all') as typeof typeFilter)}
            actions={<RefreshButton iconOnly onClick={() => void load()} loading={loading} disabled={loading} />}
          />

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
          ) : reports.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
              <Siren size={40} className="text-white/20" />
              <p className="text-sm text-white/45">
                {counts.all === 0
                  ? (isFleet ? 'No vehicle-related reports yet.' : 'No driver has raised a report yet.')
                  : 'No reports match your filters.'}
              </p>
              {/* Clearing shows every report, resolved ones too. */}
              <ClearFiltersLink
                show={counts.all > 0}
                onClear={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); setPage(1) }}
                className="mt-0"
              />
            </div>
          ) : (
            <>
            <div className="flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto lg:min-h-0">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="sticky top-0 z-10 bg-[#222222] font-[family-name:var(--font-alegreya-sc)]">
                  <tr className="h-11 border-b border-[#424242]">
                    {['Received', 'Incident', 'Driver', 'Vehicle', 'Booking', 'Status'].map((h) => (
                      <th key={h} className="px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]">{h}</th>
                    ))}
                    {/* No header text, as on Vehicle Management; the arrow says the row opens the report. */}
                    <th className="px-4 md:px-6 py-2 w-12"><span className="sr-only">open</span></th>
                  </tr>
                </thead>
                {/* Headers keep the small caps face; the data rows are regular Alegreya Sans. */}
                <tbody className="ff-regular">
                  {reports.map((r) => (
                    <tr
                      key={r.report_id}
                      className="border-b border-[#424242] last:border-b-0 transition-colors cursor-pointer [@media(hover:hover)]:hover:bg-[#222222]"
                      onClick={() => setViewId(r.report_id)}
                    >
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">{formatDate(r.created_at)}</div>
                        <div className="text-sm text-[#818181]">{formatTime(r.created_at)}</div>
                      </td>
                      <td className="px-4 md:px-6 py-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-medium text-white">{incidentLabel(r.incident_type)}</span>
                          {r.sub_type && <span className="text-[#818181]">{r.sub_type}</span>}
                          {/* Status-type badges keep the small-caps face. */}
                          <div className="flex flex-wrap gap-1 font-[family-name:var(--font-alegreya-sc)]">
                            {!r.incident_type && !isFleet && (
                              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border text-[#ffea00] border-[#ffea00]/35 bg-[#ffea00]/10">
                                Needs classification
                              </span>
                            )}
                            {isUrgentReport(r) && r.status !== 'resolved' && <UrgentBadge />}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 md:px-6 py-4 text-[#c4c4c4]">{reportDriverName(r)}</td>
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap font-mono text-[#c4c4c4]">{r.trucks?.plate_number ?? <span className="text-[#818181] font-sans">—</span>}</td>
                      <td className="px-4 md:px-6 py-4 whitespace-nowrap text-[#c4c4c4]">{r.bookings?.reference_number ?? '—'}</td>
                      <td className="px-4 md:px-6 py-4 font-[family-name:var(--font-alegreya-sc)]"><ReportStatusBadge status={r.status} /></td>
                      <td className="px-4 md:px-6 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <RecordLockBadge holder={reportLocks.get(r.report_id)} />
                          <ChevronRight size={18} className="text-[#818181]" aria-hidden />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={table.fetching} />
            </>
          )}
        </TableCard.Root>
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
