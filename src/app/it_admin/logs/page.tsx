'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import Pagination from '@/components/ui/Pagination'
import { useLivePending } from '@/lib/hooks/useLiveTable'
import NewEntriesBar from '@/components/ui/NewEntriesBar'
import { useEffect, useState, useCallback, type ReactNode } from 'react'
import FilterBar, { type FilterOption, type FilterValues } from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import ExportLogsButton from '@/components/admin/ExportLogsButton'
import {
  auditLogService,
  exportAuditLogsXlsx,
  AUDIT_EXPORT_ROW_CAP,
  type AuditLog,
  type LogType,
} from '@/lib/services/admin/audit-logs.service'
import {
  systemLogService,
  exportSystemLogsXlsx,
  SYSTEM_EXPORT_ROW_CAP,
  type SystemLog as AppSystemLog,
  type SystemLogLevel,
  type SystemLogEventType,
  type SystemLogStats,
  SYSTEM_LOG_EVENT_LABEL,
  SYSTEM_LOG_LEVEL_LABEL,
} from '@/lib/services/admin/system-logs.service'
import { formatDate, formatTime, formatDateTime } from '@/app/utils/timeFormat'
import { expandCode, roleLabel } from '@/lib/roles'

import RefreshButton from '@/components/ui/RefreshButton'
import { useTablePageSize } from '@/lib/hooks/useTablePageSize'
// Types now come from the service — see system-logs.service.ts. They used to be
// declared here because there was no system-logs endpoint to type against.
export type { SystemLogLevel, SystemLogEventType, SystemLogStats }

const AUDIT_BADGE: Record<LogType, string> = {
  auth:              'bg-[rgba(138,56,245,0.12)] text-[#8a38f5] border border-[rgba(138,56,245,0.25)]',
  user_management:   'bg-[rgba(77,249,237,0.12)] text-[#4df9ed] border border-[rgba(77,249,237,0.25)]',
  access_control:    'bg-[rgba(246,38,38,0.10)] text-[#f62626] border border-[rgba(246,38,38,0.25)]',
  document_activity: 'bg-[rgba(77,249,237,0.12)] text-[#4df9ed] border border-[rgba(77,249,237,0.25)]',
  data_export:       'bg-[rgba(138,56,245,0.12)] text-[#8a38f5] border border-[rgba(138,56,245,0.25)]',
  admin_activity:    'bg-[rgba(255,122,48,0.10)] text-[#ff7a30] border border-[rgba(255,122,48,0.25)]',
  vehicle_activity:  'bg-[rgba(58,246,38,0.10)] text-[#3af626] border border-[rgba(58,246,38,0.25)]',
  booking:           'bg-[rgba(255,234,0,0.10)] text-[#ffea00] border border-[rgba(255,234,0,0.25)]',
  driver_activity:   'bg-[rgba(58,246,38,0.10)] text-[#3af626] border border-[rgba(58,246,38,0.25)]',
  user_activity:     'bg-[rgba(130,130,130,0.12)] text-[#9a9a9a] border border-[rgba(130,130,130,0.25)]',
  system_error:      'bg-[rgba(246,38,38,0.10)] text-[#f62626] border border-[rgba(246,38,38,0.25)]',
}

const LEVEL_BADGE: Record<SystemLogLevel, string> = {
  info:     'bg-[rgba(77,249,237,0.12)] text-[#4df9ed] border border-[rgba(77,249,237,0.25)]',
  warn:     'bg-[rgba(255,234,0,0.10)] text-[#ffea00] border border-[rgba(255,234,0,0.25)]',
  error:    'bg-[rgba(246,38,38,0.10)] text-[#f62626] border border-[rgba(246,38,38,0.25)]',
  critical: 'bg-[rgba(246,38,38,0.18)] text-[#f62626] border border-[rgba(246,38,38,0.40)]',
}

const EVENT_BADGE: Record<SystemLogEventType, string> = {
  server_error: 'bg-[rgba(246,38,38,0.10)] text-[#f62626] border border-[rgba(246,38,38,0.25)]',
  auth_event:   'bg-[rgba(138,56,245,0.12)] text-[#8a38f5] border border-[rgba(138,56,245,0.25)]',
  email_event:  'bg-[rgba(77,249,237,0.12)] text-[#4df9ed] border border-[rgba(77,249,237,0.25)]',
  external_api: 'bg-[rgba(58,246,38,0.10)] text-[#3af626] border border-[rgba(58,246,38,0.25)]',
  cron_job:     'bg-[rgba(255,234,0,0.10)] text-[#ffea00] border border-[rgba(255,234,0,0.25)]',
  db_event:     'bg-[rgba(255,122,48,0.10)] text-[#ff7a30] border border-[rgba(255,122,48,0.25)]',
}

const EVENT_LABEL = SYSTEM_LOG_EVENT_LABEL
const LEVEL_LABEL = SYSTEM_LOG_LEVEL_LABEL


type ActiveTab = 'audit' | 'system'

const AUDIT_TYPE_OPTIONS: FilterOption[] = [
  { value: 'auth',              label: 'Sign-in & Credentials' },
  { value: 'user_management',   label: 'User Management' },
  { value: 'access_control',    label: 'Access Control' },
  { value: 'document_activity', label: 'Documents' },
  { value: 'data_export',       label: 'Data Exports' },
  { value: 'admin_activity',    label: 'Administrator Activity' },
  { value: 'vehicle_activity',  label: 'Vehicle Activity' },
  { value: 'driver_activity',   label: 'Driver Activity' },
  { value: 'booking',           label: 'Booking' },
]

// Newest first unless the Filters panel says otherwise.
const SORT_OPTIONS: FilterOption[] = [
  { value: 'desc', label: 'Newest first' },
  { value: 'asc',  label: 'Oldest first' },
]

/** The value a Filters-panel rule picked for `field` ("is" rules only). */
const pick = (v: FilterValues, field: string) => v.find((r) => r.field === field && r.op === 'is')?.value

function AuditLogsTab({ switcher }: { switcher: ReactNode }) {
  // 10 rows on phones, 20 from tablet up (lib/hooks/useTablePageSize).
  const PAGE_SIZE = useTablePageSize()
  const [logs, setLogs]                       = useState<AuditLog[]>([])
  const [total, setTotal]                     = useState(0)
  const [page, setPage]                       = useState(1)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [logType, setLogType]                 = useState<LogType | ''>('')
  const [sort, setSort]                       = useState<'desc' | 'asc'>('desc')
  const [selected, setSelected]               = useState<AuditLog | null>(null)
  const [refreshKey, setRefreshKey]           = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, logType, sort])

  // New audit rows are counted, not loaded: the list never shifts while it is
  // being read, and the busiest live topic costs no re-reads.
  const { pending, clear: clearPending } = useLivePending(['live:audit_logs'])

  // `quiet` re-reads in place: no spinner, and a failed re-read keeps the rows
  // already on screen instead of replacing them with an error.
  const fetchLogs = useCallback(async (quiet = false) => {
    clearPending()
    if (!quiet) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await auditLogService.getAll({
        sort,
        ...(logType         && { log_type: logType }),
        ...(debouncedSearch && { search: debouncedSearch }),
      })
      setLogs(res.data)
      setTotal(res.total)
    } catch (e: unknown) {
      if (quiet) return
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err.response?.data?.message ?? err.message ?? 'Failed to fetch logs')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [sort, logType, debouncedSearch, clearPending])

  useEffect(() => { fetchLogs() }, [fetchLogs, refreshKey])

  const totalPages    = Math.ceil(total / PAGE_SIZE)
  const safePage      = Math.min(page, Math.max(1, totalPages))
  // Already the current page's rows — the server paginated them.
  const displayedLogs = logs

  const displayName = (log: AuditLog) => {
    if (!log.users) return '—'
    const { first_name, last_name } = log.users
    if (first_name || last_name) return [first_name, last_name].filter(Boolean).join(' ')
    return '—'
  }

  return (
    <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 gap-3 lg:overflow-hidden">
      <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">

        {/* Untitled UI's table card, as on User Management: the header (title,
            count, Export), then the filter row with the System / Audit switch on
            the left and search, Filters and Refresh on the right. */}
        <TableCard.Header
          className="shrink-0"
          title="Audit Logs"
          badge={`${total.toLocaleString()} ${total === 1 ? 'record' : 'records'}`}
          contentTrailing={
            <ExportLogsButton
              untitled
              noun="audit logs"
              cap={AUDIT_EXPORT_ROW_CAP}
              disabled={loading}
              run={() => exportAuditLogsXlsx({
                sort,
                ...(logType         && { log_type: logType }),
                ...(debouncedSearch && { search: debouncedSearch }),
              })}
            />
          }
        />
        <FilterBar
          layout="split"
          leading={switcher}
          search={{ value: search, onChange: setSearch, placeholder: 'Search' }}
          fields={[
            { key: 'type', label: 'Type',  single: true, options: AUDIT_TYPE_OPTIONS },
            { key: 'sort', label: 'Order', single: true, options: SORT_OPTIONS },
          ]}
          values={[
            ...(logType ? [{ field: 'type', op: 'is' as const, value: logType }] : []),
            ...(sort !== 'desc' ? [{ field: 'sort', op: 'is' as const, value: sort }] : []),
          ]}
          onChange={(v) => {
            setLogType((pick(v, 'type') ?? '') as LogType | '')
            setSort(pick(v, 'sort') === 'asc' ? 'asc' : 'desc')
          }}
          actions={<RefreshButton iconOnly onClick={() => setRefreshKey(k => k + 1)} loading={loading} disabled={loading} />}
        />

        {/* Detail panel */}
        {selected && (
          <div className="shrink-0 border-b border-[#2a2a2a] bg-[#131313] px-5 py-4 text-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[#4df9ed] font-bold">
                Log Detail — {selected.log_id.slice(0, 8).toUpperCase()}
              </span>
              <button onClick={() => setSelected(null)} className="text-[#818181] hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {([
                ['Log ID',      selected.log_id],
                ['Timestamp',   formatDateTime(selected.timestamp)],
                ['Type',        expandCode(selected.log_type).replace(/_/g, ' ')],
                ['Action',      expandCode(selected.action)],
                ['Description', selected.description ?? '—'],
                ['User',        displayName(selected)],
                ['Role',        roleLabel(selected.users?.role) || '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="text-[#818181] text-[10px] uppercase tracking-[0.1em] w-24 flex-shrink-0 pt-0.5">{k}</span>
                  <span className="text-[#e0e0e0] break-all font-mono text-xs">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400">{error}</div>
        )}

        <NewEntriesBar count={pending} onRefresh={() => setRefreshKey(k => k + 1)} />

        {/* Table */}
        <div className="flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto lg:min-h-0">
          {loading && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#222222] font-[family-name:var(--font-alegreya-sc)]">
                <tr className="h-11 border-b border-[#424242]">
                  {['Timestamp', 'Type', 'Action', 'Description', 'User'].map(h => (
                    <th key={h} className="px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-b border-[#424242]">
                    <td className="px-4 md:px-6 py-4">
                      <div className="h-2.5 w-16 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      <div className="mt-1.5 h-2.5 w-20 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40 + 20}ms` }} />
                    </td>
                    <td className="px-4 md:px-6 py-4"><div className="h-4 w-20 animate-pulse rounded-full bg-[#2a2a2a]" /></td>
                    <td className="px-4 md:px-6 py-4"><div className="h-4 w-28 animate-pulse rounded bg-[#2a2a2a]" /></td>
                    <td className="px-4 md:px-6 py-4"><div className="h-3 w-48 animate-pulse rounded bg-[#2a2a2a]" /></td>
                    <td className="px-4 md:px-6 py-4">
                      <div className="h-3 w-24 animate-pulse rounded bg-[#2a2a2a]" />
                      <div className="mt-1.5 h-2 w-14 animate-pulse rounded bg-[#2a2a2a]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="flex flex-col items-center py-16 text-[#424242] text-sm tracking-wide">
              No logs match your filters.
              <ClearFiltersLink show={!!search || !!logType} onClear={() => { setSearch(''); setLogType(''); setPage(1) }} />
            </div>
          )}

          {!loading && logs.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#222222] font-[family-name:var(--font-alegreya-sc)]">
                <tr className="h-11 border-b border-[#424242]">
                  {['Timestamp', 'Type', 'Action', 'Description', 'User'].map(h => (
                    <th key={h} className="px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedLogs.map(log => (
                  <tr
                    key={log.log_id}
                    onClick={() => setSelected(prev => prev?.log_id === log.log_id ? null : log)}
                    className={`border-b border-[#424242] last:border-b-0 transition-colors cursor-pointer ${
                      selected?.log_id === log.log_id
                        ? 'bg-[rgba(77,249,237,0.06)] border-l-2 border-l-[#4df9ed]'
                        : '[@media(hover:hover)]:hover:bg-[#222222]'
                    }`}
                  >
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">{formatDate(log.timestamp)}</div>
                      <div className="text-sm text-[#818181]">{formatTime(log.timestamp)}</div>
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap whitespace-nowrap ${AUDIT_BADGE[log.log_type]}`}>
                        {expandCode(log.log_type).replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <span className="inline-flex whitespace-nowrap rounded-md bg-[#1b1b1b] px-1.5 py-0.5 font-mono text-xs font-medium text-[#c4c4c4] ring-1 ring-inset ring-[#424242]">
                        {expandCode(log.action)}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-4 text-sm text-[#c4c4c4] max-w-xs truncate">{log.description ?? '—'}</td>
                    <td className="px-4 md:px-6 py-4 text-sm">
                      <p className="font-medium text-white">{displayName(log)}</p>
                      {log.users?.role && (
                        <p className="text-[#818181]">{roleLabel(log.users.role)}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <Pagination page={safePage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        )}
      </TableCard.Root>
    </div>
  )
}

const EVENT_TYPES: SystemLogEventType[] = ['server_error', 'auth_event', 'email_event', 'external_api', 'cron_job', 'db_event']
const LEVELS: SystemLogLevel[]          = ['info', 'warn', 'error', 'critical']

type ResolvedFilter = '' | 'false' | 'true'

/**
 * Filters the dashboard deep-links with, e.g. ?tab=system&level=critical&resolved=false.
 * Read once when the tab mounts, which is always on the client (see LogsPage).
 */
function systemFiltersFromUrl() {
  const p = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  const eventType = p.get('event_type') as SystemLogEventType | null
  const level     = p.get('level') as SystemLogLevel | null
  const resolved  = p.get('resolved')
  return {
    search:    p.get('search') ?? '',
    eventType: eventType && EVENT_TYPES.includes(eventType) ? eventType : '',
    level:     level && LEVELS.includes(level) ? level : '',
    resolved:  (resolved === 'true' || resolved === 'false' ? resolved : '') as ResolvedFilter,
  } as const
}

function SystemLogsTab({ switcher }: { switcher: ReactNode }) {
  // 10 rows on phones, 20 from tablet up (lib/hooks/useTablePageSize).
  const PAGE_SIZE = useTablePageSize()
  const [initial]                             = useState(systemFiltersFromUrl)
  const [logs, setLogs]                       = useState<AppSystemLog[]>([])
  const [total, setTotal]                     = useState(0)
  const [page, setPage]                       = useState(1)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [search, setSearch]                   = useState(initial.search)
  const [debouncedSearch, setDebouncedSearch] = useState(initial.search)
  const [eventType, setEventType]             = useState<SystemLogEventType | ''>(initial.eventType)
  const [level, setLevel]                     = useState<SystemLogLevel | ''>(initial.level)
  const [resolved, setResolved]               = useState<ResolvedFilter>(initial.resolved)
  const [sort, setSort]                       = useState<'desc' | 'asc'>('desc')
  const [selected, setSelected]               = useState<AppSystemLog | null>(null)
  const [refreshKey, setRefreshKey]           = useState(0)
  // New system rows are counted, not loaded. Nothing re-reads on its own, so a
  // failed read that writes a system log can no longer feed itself.
  const { pending, clear: clearPending }      = useLivePending(['live:system_logs'])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  // The deep-link filters are applied; drop them from the URL so switching tabs
  // and back starts clean instead of re-applying them.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  useEffect(() => { setPage(1) }, [debouncedSearch, eventType, level, resolved, sort])

  useEffect(() => {
    let cancelled = false
    clearPending()
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        // Paginated server-side, unlike the audit tab: system logs are written
        // by machines and this table grows far faster than the audit one, so
        // fetching everything to slice it locally stops working quickly.
        const res = await systemLogService.getAll({
          sort,
          page,
          limit: PAGE_SIZE,
          ...(eventType      && { event_type: eventType }),
          ...(level          && { log_level: level }),
          ...(resolved       && { resolved: resolved === 'true' }),
          ...(debouncedSearch && { search: debouncedSearch }),
        })
        if (!cancelled) {
          setLogs(res.data)
          setTotal(res.total)
        }
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } }; message?: string }
        if (!cancelled) setError(err.response?.data?.message ?? err.message ?? 'Failed to fetch system logs')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sort, eventType, level, resolved, debouncedSearch, refreshKey, page, clearPending, PAGE_SIZE])

  const totalPages    = Math.ceil(total / PAGE_SIZE)
  const safePage      = Math.min(page, Math.max(1, totalPages))
  const displayedLogs = logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 gap-3 lg:overflow-hidden">
      <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">

        {/* Untitled UI's table card: header (title, count, Export), then the
            filter row with the System / Audit switch on the left. */}
        <TableCard.Header
          className="shrink-0"
          title="System Logs"
          badge={`${total.toLocaleString()} ${total === 1 ? 'record' : 'records'}`}
          contentTrailing={
            <ExportLogsButton
              untitled
              noun="system logs"
              cap={SYSTEM_EXPORT_ROW_CAP}
              disabled={loading}
              run={() => exportSystemLogsXlsx({
                sort,
                ...(eventType       && { event_type: eventType }),
                ...(level           && { log_level: level }),
                ...(resolved        && { resolved: resolved === 'true' }),
                ...(debouncedSearch && { search: debouncedSearch }),
              })}
            />
          }
        />
        <FilterBar
          layout="split"
          leading={switcher}
          search={{ value: search, onChange: setSearch, placeholder: 'Search' }}
          fields={[
            { key: 'event',    label: 'Event',    single: true, options: EVENT_TYPES.map((t) => ({ value: t, label: EVENT_LABEL[t] })) },
            { key: 'level',    label: 'Level',    single: true, options: LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })) },
            { key: 'resolved', label: 'Resolved', single: true, options: [{ value: 'false', label: 'Unresolved' }, { value: 'true', label: 'Resolved' }] },
            { key: 'sort',     label: 'Order',    single: true, options: SORT_OPTIONS },
          ]}
          values={[
            ...(eventType ? [{ field: 'event',    op: 'is' as const, value: eventType }] : []),
            ...(level     ? [{ field: 'level',    op: 'is' as const, value: level }] : []),
            ...(resolved  ? [{ field: 'resolved', op: 'is' as const, value: resolved }] : []),
            ...(sort !== 'desc' ? [{ field: 'sort', op: 'is' as const, value: sort }] : []),
          ]}
          onChange={(v) => {
            setEventType((pick(v, 'event') ?? '') as SystemLogEventType | '')
            setLevel((pick(v, 'level') ?? '') as SystemLogLevel | '')
            setResolved((pick(v, 'resolved') ?? '') as ResolvedFilter)
            setSort(pick(v, 'sort') === 'asc' ? 'asc' : 'desc')
          }}
          actions={<RefreshButton iconOnly onClick={() => setRefreshKey(k => k + 1)} loading={loading} disabled={loading} />}
        />

        {/* Detail panel */}
        {selected && (
          <div className="shrink-0 border-b border-[#2a2a2a] bg-[#131313] px-5 py-4 text-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[#4df9ed] font-bold">
                System Log — {selected.log_id.slice(0, 8).toUpperCase()}
              </span>
              <button onClick={() => setSelected(null)} className="text-[#818181] hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {([
                ['Log ID',    selected.log_id],
                ['Timestamp', formatDateTime(selected.timestamp)],
                ['Level',     LEVEL_LABEL[selected.log_level] ?? selected.log_level],
                ['Event',     EVENT_LABEL[selected.event_type] ?? selected.event_type],
                ['Source',    selected.source],
                ['Message',   selected.message],
                ['Resolved',  selected.resolved ? 'Yes' : 'No'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="text-[#818181] text-[10px] uppercase tracking-[0.1em] w-24 flex-shrink-0 pt-0.5">{k}</span>
                  <span className="text-[#e0e0e0] break-all font-mono text-xs">{v}</span>
                </div>
              ))}
            </div>
            {selected.metadata && (
              <div className="mt-3">
                <span className="text-[#818181] text-[10px] uppercase tracking-[0.1em]">Metadata</span>
                <pre className="mt-1.5 text-[10px] font-mono text-[#b0b0b0] bg-[#0a0a0a] rounded-lg p-3 overflow-x-auto border border-[#2a2a2a]">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {error && !loading && (
          <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400">{error}</div>
        )}

        <NewEntriesBar count={pending} onRefresh={() => setRefreshKey(k => k + 1)} />

        {/* Table */}
        <div className="flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto lg:min-h-0">
          {loading && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#222222] font-[family-name:var(--font-alegreya-sc)]">
                <tr className="h-11 border-b border-[#424242]">
                  {['Timestamp', 'Level', 'Event', 'Source', 'Message', 'Resolved'].map(h => (
                    <th key={h} className="px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-b border-[#424242]">
                    <td className="px-4 md:px-6 py-4">
                      <div className="h-2.5 w-16 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      <div className="mt-1.5 h-2.5 w-20 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40 + 20}ms` }} />
                    </td>
                    <td className="px-4 md:px-6 py-4"><div className="h-4 w-14 animate-pulse rounded-full bg-[#2a2a2a]" /></td>
                    <td className="px-4 md:px-6 py-4"><div className="h-4 w-24 animate-pulse rounded-full bg-[#2a2a2a]" /></td>
                    <td className="px-4 md:px-6 py-4"><div className="h-3 w-20 animate-pulse rounded bg-[#2a2a2a]" /></td>
                    <td className="px-4 md:px-6 py-4"><div className="h-3 w-48 animate-pulse rounded bg-[#2a2a2a]" /></td>
                    <td className="px-4 md:px-6 py-4"><div className="h-4 w-10 animate-pulse rounded-full bg-[#2a2a2a]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="flex flex-col items-center py-16 text-[#424242] text-sm tracking-wide">
              No system logs match your filters.
              <ClearFiltersLink
                show={!!search || !!eventType || !!level || !!resolved}
                onClear={() => { setSearch(''); setEventType(''); setLevel(''); setResolved(''); setPage(1) }}
              />
            </div>
          )}

          {!loading && logs.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#222222] font-[family-name:var(--font-alegreya-sc)]">
                <tr className="h-11 border-b border-[#424242]">
                  {['Timestamp', 'Level', 'Event', 'Source', 'Message', 'Resolved'].map(h => (
                    <th key={h} className="px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedLogs.map(log => (
                  <tr
                    key={log.log_id}
                    onClick={() => setSelected(prev => prev?.log_id === log.log_id ? null : log)}
                    className={`border-b border-[#424242] last:border-b-0 transition-colors cursor-pointer ${
                      selected?.log_id === log.log_id
                        ? 'bg-[rgba(77,249,237,0.06)] border-l-2 border-l-[#4df9ed]'
                        : '[@media(hover:hover)]:hover:bg-[#222222]'
                    }`}
                  >
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">{formatDate(log.timestamp)}</div>
                      <div className="text-sm text-[#818181]">{formatTime(log.timestamp)}</div>
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${LEVEL_BADGE[log.log_level]}`}>
                        {LEVEL_LABEL[log.log_level] ?? log.log_level}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap whitespace-nowrap ${EVENT_BADGE[log.event_type]}`}>
                        {EVENT_LABEL[log.event_type] ?? log.event_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <span className="inline-flex whitespace-nowrap rounded-md bg-[#1b1b1b] px-1.5 py-0.5 font-mono text-xs font-medium text-[#c4c4c4] ring-1 ring-inset ring-[#424242]">{log.source}</span>
                    </td>
                    <td className="px-4 md:px-6 py-4 text-sm text-[#c4c4c4] max-w-xs truncate">{log.message}</td>
                    <td className="px-4 md:px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                        log.resolved
                          ? 'bg-[rgba(58,246,38,0.10)] text-[#3af626] border border-[rgba(58,246,38,0.25)]'
                          : 'bg-[rgba(246,38,38,0.10)] text-[#f62626] border border-[rgba(246,38,38,0.25)]'
                      }`}>
                        {log.resolved ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <Pagination page={safePage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        )}
      </TableCard.Root>
    </div>
  )
}

export default function LogsPage() {
  // System Logs is the first tab and the default; ?tab=audit opens Audit Logs.
  // Safe to read in the initialiser: the it_admin layout renders nothing until
  // the auth store has hydrated, so this page never renders on the server.
  const [activeTab, setActiveTab]   = useState<ActiveTab>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'audit'
      ? 'audit'
      : 'system')
  const [systemStats]               = useState<SystemLogStats | null>(null)

  // Untitled UI's button-minimal tabs in each table's filter row (a dropdown on phones).
  const switcher = (
    <TabsMinimal
      label="Logs"
      items={[{ id: 'system' as const, label: 'System Logs' }, { id: 'audit' as const, label: 'Audit Logs' }]}
      selectedKey={activeTab}
      onSelectionChange={setActiveTab}
    />
  )

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 lg:px-4 gap-4 lg:overflow-hidden">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0">

          {/* Left: title + stats inline */}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <h1 className="mr-1 font-[family-name:var(--font-alegreya-sc)] text-[17px] 3xl:text-[20px] font-bold text-white">Logs</h1>

            {activeTab === 'system' && systemStats && (
              <>
                {(
                  [
                    ['Total',      systemStats.total,      '#ffffff'],
                    ['Info',       systemStats.info,       '#4df9ed'],
                    ['Warn',       systemStats.warn,       '#ffea00'],
                    ['Error',      systemStats.error,      '#f62626'],
                    ['Critical',   systemStats.critical,   '#f62626'],
                    ['Unresolved', systemStats.unresolved, '#ff7a30'],
                  ] as [string, number, string][]
                ).map(([label, val, color]) => (
                  <div key={label} className="rounded-lg border border-[#2a2a2a] bg-[#1b1b1b] px-3 py-1 text-center min-w-[52px]">
                    <p className="text-base font-bold font-mono leading-tight" style={{ color }}>{val}</p>
                    <p className="text-[8px] uppercase tracking-widest text-[#818181]">{label}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'system' && <SystemLogsTab switcher={switcher} />}
        {activeTab === 'audit'  && <AuditLogsTab  switcher={switcher} />}

      </div>
    </div>
  )
}