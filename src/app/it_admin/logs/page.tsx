'use client'

import TableEmptyState from '@/components/ui/TableEmptyState'
import { ScrollText } from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
import { useLivePending, useLiveTable } from '@/lib/hooks/useLiveTable'
import NewEntriesBar from '@/components/ui/NewEntriesBar'
import { useEffect, useState, useCallback, type ReactNode } from 'react'
import FilterBar, { type FilterValues } from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import type { DateRange } from '@/components/ui/untitled/date-range-picker'
import ExportLogsButton from '@/components/admin/ExportLogsButton'
import {
  AuditLogTable, SystemLogTable, IssueTable, LogDetail, auditDetailRows, systemDetailRows, issueDetailRows,
  AUDIT_TYPE_OPTIONS, SORT_OPTIONS, ISSUE_STATUS_OPTIONS,
} from '@/components/admin/LogTables'
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
  type SystemLogIssue,
  type SystemLogIssueStatus,
  type IssueAction,
  SYSTEM_LOG_EVENT_LABEL,
  SYSTEM_LOG_LEVEL_LABEL,
} from '@/lib/services/admin/system-logs.service'

import { useTablePageSize } from '@/lib/hooks/useTablePageSize'
import { cachedData, storeData } from '@/lib/query/useApiQuery'
// Types now come from the service — see system-logs.service.ts. They used to be
// declared here because there was no system-logs endpoint to type against.
export type { SystemLogLevel, SystemLogEventType, SystemLogStats }

const EVENT_LABEL = SYSTEM_LOG_EVENT_LABEL
const LEVEL_LABEL = SYSTEM_LOG_LEVEL_LABEL

type ActiveTab = 'audit' | 'system' | 'issues'

/** The value a Filters-panel rule picked for `field` ("is" rules only). */
const pick = (v: FilterValues, field: string) => v.find((r) => r.field === field && r.op === 'is')?.value

/**
 * One log table in the table format (Figma 3234:594 / 3234:1147): the card's
 * filter row is search, the System / Audit switch, Filters, Select Date and
 * Export at the far right. No Refresh: new rows are counted live and the
 * "new entries" bar loads them.
 */
function LogCard({ toolbar, detail, error, pending, onLoadNew, empty, table, pagination }: {
  toolbar:    ReactNode
  detail:     ReactNode
  error:      string | null
  pending:    number
  onLoadNew:  () => void
  empty:      ReactNode
  table:      ReactNode
  pagination: ReactNode
}) {
  return (
    <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">
      {toolbar}
      {detail}
      {error && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400">{error}</div>
      )}
      <NewEntriesBar count={pending} onRefresh={onLoadNew} />
      {/* The headers stay; an empty list shows its message under them. */}
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto lg:min-h-0">
        {table}
        {empty}
      </div>
      {pagination}
    </TableCard.Root>
  )
}

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
  const [dateRange, setDateRange]             = useState<DateRange | null>(null)
  const [selected, setSelected]               = useState<AuditLog | null>(null)
  const [refreshKey, setRefreshKey]           = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, logType, sort, dateRange])

  // New audit rows are counted, not loaded: the list never shifts while it is
  // being read, and the busiest live topic costs no re-reads.
  const { pending, clear: clearPending } = useLivePending(['live:audit_logs'])

  const filters = {
    sort,
    ...(logType         && { log_type: logType }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(dateRange       && { from: dateRange.from, to: dateRange.to }),
  }
  const filterKey = JSON.stringify(filters)

  const fetchLogs = useCallback(async () => {
    clearPending()
    // A page seen before shows at once; the read below refreshes it.
    const key    = ['it-logs', 'audit', filterKey, page, PAGE_SIZE] as const
    const cached = cachedData<Awaited<ReturnType<typeof auditLogService.getAll>>>(key)
    if (cached) { setLogs(cached.data); setTotal(cached.total); setLoading(false) } else setLoading(true)
    setError(null)
    try {
      const res = await auditLogService.getAll({ ...JSON.parse(filterKey), page, limit: PAGE_SIZE })
      storeData(key, res)
      setLogs(res.data)
      setTotal(res.total)
    } catch (e: unknown) {
      if (cached) return
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err.response?.data?.message ?? err.message ?? 'Failed to fetch logs')
    } finally {
      setLoading(false)
    }
  }, [filterKey, page, PAGE_SIZE, clearPending])

  useEffect(() => { fetchLogs() }, [fetchLogs, refreshKey])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const filtered   = !!search || !!logType || !!dateRange

  return (
    <LogCard
      toolbar={
        <FilterBar
          layout="split"
          leading={switcher}
          // Names exactly what the server searches (audit-logs.model.ts).
          search={{ value: search, onChange: setSearch, placeholder: 'Search name, action or description' }}
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
          dateRange={{ value: dateRange, onChange: setDateRange }}
          trailing={
            <ExportLogsButton
              untitled
              noun="audit logs"
              cap={AUDIT_EXPORT_ROW_CAP}
              disabled={loading}
              run={() => exportAuditLogsXlsx(JSON.parse(filterKey))}
            />
          }
        />
      }
      detail={selected && (
        <LogDetail
          title={`Log Detail — ${selected.log_id.slice(0, 8).toUpperCase()}`}
          rows={auditDetailRows(selected)}
          onClose={() => setSelected(null)}
        />
      )}
      error={!loading ? error : null}
      pending={pending}
      onLoadNew={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !error && logs.length === 0 && (
        <TableEmptyState
          icon={ScrollText}
          filtered={filtered}
          title={filtered ? undefined : 'No audit logs yet'}
          message={filtered ? 'No logs match your search or filters.' : 'Actions people take in the system are recorded here.'}
          onClear={() => { setSearch(''); setLogType(''); setDateRange(null); setPage(1) }}
        />
      ) || null}
      table={
        <AuditLogTable
          logs={logs}
          loading={loading}
          pageSize={PAGE_SIZE}
          selectedId={selected?.log_id ?? null}
          onSelect={(log) => setSelected((prev) => prev?.log_id === log.log_id ? null : log)}
        />
      }
      pagination={!loading && total > 0 && (
        <Pagination page={safePage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    />
  )
}

const EVENT_TYPES: SystemLogEventType[] = ['server_error', 'auth_event', 'email_event', 'external_api', 'cron_job', 'db_event']
const LEVELS: SystemLogLevel[]          = ['info', 'warn', 'error', 'critical']

/**
 * Filters the dashboard deep-links with, e.g. ?tab=system&level=critical.
 * Read once when the tab mounts, which is always on the client (see LogsPage).
 */
function systemFiltersFromUrl() {
  const p = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  const eventType = p.get('event_type') as SystemLogEventType | null
  const level     = p.get('level') as SystemLogLevel | null
  return {
    search:    p.get('search') ?? '',
    eventType: eventType && EVENT_TYPES.includes(eventType) ? eventType : '',
    level:     level && LEVELS.includes(level) ? level : '',
  } as const
}

/** "Showing the occurrences of one issue", with a way back to every row. */
function IssueFilterBar({ issue, onClear }: { issue: { issue_id: string; label: string }; onClear: () => void }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#424242] bg-[#4df9ed]/[0.06] px-5 py-2.5 text-sm">
      <span className="min-w-0 break-words text-[#e0e0e0]">Showing the occurrences of one issue: {issue.label}</span>
      <button type="button" onClick={onClear} className="font-medium text-[#4df9ed] [@media(hover:hover)]:hover:underline">
        Show all system logs
      </button>
    </div>
  )
}

function SystemLogsTab({ switcher, issue, onClearIssue }: {
  switcher:     ReactNode
  /** Only this issue's rows (from the Issues tab's "Show all occurrences"). */
  issue:        { issue_id: string; label: string } | null
  onClearIssue: () => void
}) {
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
  const [sort, setSort]                       = useState<'desc' | 'asc'>('desc')
  const [dateRange, setDateRange]             = useState<DateRange | null>(null)
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

  useEffect(() => { setPage(1) }, [debouncedSearch, eventType, level, sort, dateRange, issue])

  const filters = {
    sort,
    ...(issue           && { issue_id: issue.issue_id }),
    ...(eventType       && { event_type: eventType }),
    ...(level           && { log_level: level }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(dateRange       && { from: dateRange.from, to: dateRange.to }),
  }
  const filterKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    clearPending()
    const run = async () => {
      // A page seen before shows at once; the read below refreshes it.
      const key    = ['it-logs', 'system', filterKey, page, PAGE_SIZE] as const
      const cached = cachedData<Awaited<ReturnType<typeof systemLogService.getAll>>>(key)
      if (cached) { setLogs(cached.data); setTotal(cached.total); setLoading(false) } else setLoading(true)
      setError(null)
      try {
        // Paginated server-side: system logs are written by machines and this
        // table grows far faster than the audit one.
        const res = await systemLogService.getAll({ ...JSON.parse(filterKey), page, limit: PAGE_SIZE })
        storeData(key, res)
        if (!cancelled) {
          setLogs(res.data)
          setTotal(res.total)
        }
      } catch (e: unknown) {
        if (cached) return
        const err = e as { response?: { data?: { message?: string } }; message?: string }
        if (!cancelled) setError(err.response?.data?.message ?? err.message ?? 'Failed to fetch system logs')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [filterKey, refreshKey, page, clearPending, PAGE_SIZE])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const filtered   = !!search || !!eventType || !!level || !!dateRange || !!issue

  return (
    <LogCard
      toolbar={
        <FilterBar
          layout="split"
          leading={switcher}
          // Names exactly what the server searches (system-logs.model.ts).
          search={{ value: search, onChange: setSearch, placeholder: 'Search source or message' }}
          fields={[
            { key: 'event',    label: 'Event',    single: true, options: EVENT_TYPES.map((t) => ({ value: t, label: EVENT_LABEL[t] })) },
            { key: 'level',    label: 'Level',    single: true, options: LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })) },
            { key: 'sort',     label: 'Order',    single: true, options: SORT_OPTIONS },
          ]}
          values={[
            ...(eventType ? [{ field: 'event',    op: 'is' as const, value: eventType }] : []),
            ...(level     ? [{ field: 'level',    op: 'is' as const, value: level }] : []),
            ...(sort !== 'desc' ? [{ field: 'sort', op: 'is' as const, value: sort }] : []),
          ]}
          onChange={(v) => {
            setEventType((pick(v, 'event') ?? '') as SystemLogEventType | '')
            setLevel((pick(v, 'level') ?? '') as SystemLogLevel | '')
            setSort(pick(v, 'sort') === 'asc' ? 'asc' : 'desc')
          }}
          dateRange={{ value: dateRange, onChange: setDateRange }}
          trailing={
            <ExportLogsButton
              untitled
              noun="system logs"
              cap={SYSTEM_EXPORT_ROW_CAP}
              disabled={loading}
              run={() => exportSystemLogsXlsx(JSON.parse(filterKey))}
            />
          }
        />
      }
      detail={<>
        {issue && <IssueFilterBar issue={issue} onClear={onClearIssue} />}
        {selected && (
          <LogDetail
            title={`System Log — ${selected.log_id.slice(0, 8).toUpperCase()}`}
            rows={systemDetailRows(selected)}
            metadata={selected.metadata ?? undefined}
            onClose={() => setSelected(null)}
          />
        )}
      </>}
      error={!loading ? error : null}
      pending={pending}
      onLoadNew={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !error && logs.length === 0 && (
        <TableEmptyState
          icon={ScrollText}
          filtered={filtered}
          title={filtered ? undefined : 'No system logs yet'}
          message={filtered ? 'No system logs match your search or filters.' : 'Automatic actions, refusals and errors are recorded here.'}
          onClear={() => { setSearch(''); setEventType(''); setLevel(''); setDateRange(null); setPage(1); onClearIssue() }}
        />
      ) || null}
      table={
        <SystemLogTable
          logs={logs}
          loading={loading}
          pageSize={PAGE_SIZE}
          selectedId={selected?.log_id ?? null}
          onSelect={(log) => setSelected((prev) => prev?.log_id === log.log_id ? null : log)}
        />
      }
      pagination={!loading && total > 0 && (
        <Pagination page={safePage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    />
  )
}

const ISSUE_LEVELS = ['critical', 'error'] as const

const ACTION_BTN = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50'
const GREEN_BTN  = `${ACTION_BTN} border-[#3af626]/30 bg-[#3af626]/10 text-[#3af626] [@media(hover:hover)]:hover:bg-[#3af626]/20`
const PLAIN_BTN  = `${ACTION_BTN} border-[#424242] bg-transparent text-[#e0e0e0] [@media(hover:hover)]:hover:bg-white/5`

/**
 * Repeated errors grouped into issues (Sentry, Datadog Error Tracking, Google
 * Cloud Error Reporting): one Resolve closes every occurrence. A resolved issue
 * that happens again reopens by itself ("Came back"); one quiet for 7 days is
 * resolved automatically. Only error and critical rows are grouped.
 */
function IssuesTab({ switcher, onShowOccurrences }: {
  switcher:          ReactNode
  onShowOccurrences: (issue: SystemLogIssue) => void
}) {
  const PAGE_SIZE = useTablePageSize()
  const [issues, setIssues]                   = useState<SystemLogIssue[]>([])
  const [total, setTotal]                     = useState(0)
  const [page, setPage]                       = useState(1)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // Open by default: the queue is what is waiting.
  const [status, setStatus]                   = useState<SystemLogIssueStatus | ''>('open')
  const [level, setLevel]                     = useState<'critical' | 'error' | ''>('')
  const [eventType, setEventType]             = useState<SystemLogEventType | ''>('')
  const [sort, setSort]                       = useState<'desc' | 'asc'>('desc')
  const [selected, setSelected]               = useState<SystemLogIssue | null>(null)
  const [busy, setBusy]                       = useState(false)
  const [reloadKey, setReloadKey]             = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, status, level, eventType, sort])

  // An issue changes when a new occurrence arrives. Re-read, slowly enough that
  // an error burst doesn't re-read it once per row.
  useLiveTable(['live:system_log_issues'], () => setReloadKey((k) => k + 1), { debounceMs: 5_000 })

  const filters = {
    sort,
    ...(status          && { status }),
    ...(level           && { log_level: level }),
    ...(eventType       && { event_type: eventType }),
    ...(debouncedSearch && { search: debouncedSearch }),
  }
  const filterKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const key    = ['it-logs', 'issues', filterKey, page, PAGE_SIZE] as const
      const cached = cachedData<Awaited<ReturnType<typeof systemLogService.getIssues>>>(key)
      if (cached) { setIssues(cached.data); setTotal(cached.total); setLoading(false) }
      else if (reloadKey === 0) setLoading(true)
      setError(null)
      try {
        const res = await systemLogService.getIssues({ ...JSON.parse(filterKey), page, limit: PAGE_SIZE })
        storeData(key, res)
        if (!cancelled) {
          setIssues(res.data)
          setTotal(res.total)
          // Keep the open detail current: its count moves as occurrences arrive.
          setSelected((cur) => (cur ? res.data.find((i) => i.issue_id === cur.issue_id) ?? cur : cur))
        }
      } catch (e: unknown) {
        if (cached) return
        const err = e as { response?: { data?: { message?: string } }; message?: string }
        if (!cancelled) setError(err.response?.data?.message ?? err.message ?? 'Failed to fetch issues')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [filterKey, page, PAGE_SIZE, reloadKey])

  const act = useCallback(async (issue: SystemLogIssue, body: IssueAction) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await systemLogService.actOnIssue(issue.issue_id, body)
      setSelected(updated)
      setReloadKey((k) => k + 1)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err.response?.data?.message ?? err.message ?? 'Could not update that issue')
    } finally {
      setBusy(false)
    }
  }, [])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const filtered   = !!search || status !== 'open' || !!level || !!eventType

  const actions = selected && (
    <>
      {selected.status !== 'resolved' && (
        <button type="button" disabled={busy} className={GREEN_BTN} onClick={() => act(selected, { action: 'resolve' })}>Resolve</button>
      )}
      {selected.status === 'open' && (
        <>
          <button type="button" disabled={busy} className={PLAIN_BTN} onClick={() => act(selected, { action: 'ignore', hours: 24 })}>Ignore for 24 hours</button>
          <button type="button" disabled={busy} className={PLAIN_BTN} onClick={() => act(selected, { action: 'ignore', hours: 168 })}>Ignore for 7 days</button>
          <button type="button" disabled={busy} className={PLAIN_BTN} onClick={() => act(selected, { action: 'ignore', hours: null })}>Ignore until reopened</button>
        </>
      )}
      {selected.status !== 'open' && (
        <button type="button" disabled={busy} className={PLAIN_BTN} onClick={() => act(selected, { action: 'reopen' })}>Reopen</button>
      )}
      <button type="button" className={PLAIN_BTN} onClick={() => onShowOccurrences(selected)}>
        Show all {selected.event_count.toLocaleString()} occurrence{selected.event_count === 1 ? '' : 's'}
      </button>
    </>
  )

  return (
    <LogCard
      toolbar={
        <FilterBar
          layout="split"
          leading={switcher}
          search={{ value: search, onChange: setSearch, placeholder: 'Search source or message' }}
          fields={[
            { key: 'status', label: 'Status', single: true, options: ISSUE_STATUS_OPTIONS },
            { key: 'level',  label: 'Level',  single: true, options: ISSUE_LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] })) },
            { key: 'event',  label: 'Event',  single: true, options: EVENT_TYPES.map((t) => ({ value: t, label: EVENT_LABEL[t] })) },
            { key: 'sort',   label: 'Order',  single: true, options: SORT_OPTIONS },
          ]}
          values={[
            ...(status    ? [{ field: 'status', op: 'is' as const, value: status }] : []),
            ...(level     ? [{ field: 'level',  op: 'is' as const, value: level }] : []),
            ...(eventType ? [{ field: 'event',  op: 'is' as const, value: eventType }] : []),
            ...(sort !== 'desc' ? [{ field: 'sort', op: 'is' as const, value: sort }] : []),
          ]}
          onChange={(v) => {
            setStatus((pick(v, 'status') ?? '') as SystemLogIssueStatus | '')
            setLevel((pick(v, 'level') ?? '') as 'critical' | 'error' | '')
            setEventType((pick(v, 'event') ?? '') as SystemLogEventType | '')
            setSort(pick(v, 'sort') === 'asc' ? 'asc' : 'desc')
          }}
        />
      }
      detail={selected && (
        <LogDetail
          title={`Issue — ${selected.issue_id.slice(0, 8).toUpperCase()}`}
          rows={issueDetailRows(selected)}
          actions={actions}
          onClose={() => setSelected(null)}
        />
      )}
      error={error}
      pending={0}
      onLoadNew={() => setReloadKey((k) => k + 1)}
      empty={!loading && !error && issues.length === 0 && (
        <TableEmptyState
          icon={ScrollText}
          filtered={filtered}
          title={filtered ? undefined : 'No open issues'}
          message={filtered ? 'No issues match your search or filters.' : 'Repeated errors are grouped here. Nothing is waiting.'}
          onClear={() => { setSearch(''); setStatus('open'); setLevel(''); setEventType(''); setPage(1) }}
        />
      ) || null}
      table={
        <IssueTable
          logs={issues}
          loading={loading}
          pageSize={PAGE_SIZE}
          selectedId={selected?.issue_id ?? null}
          onSelect={(i) => setSelected((prev) => (prev?.issue_id === i.issue_id ? null : i))}
        />
      }
      pagination={!loading && total > 0 && (
        <Pagination page={safePage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    />
  )
}

export default function LogsPage() {
  // System Logs is the first tab and the default; ?tab=audit opens Audit Logs.
  // Safe to read in the initialiser: the it_admin layout renders nothing until
  // the auth store has hydrated, so this page never renders on the server.
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const tab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null
    return tab === 'audit' || tab === 'issues' ? tab : 'system'
  })
  // The Issues tab's "Show all occurrences": System Logs filtered to that issue.
  const [issueFilter, setIssueFilter] = useState<{ issue_id: string; label: string } | null>(null)

  // The switch in each table's filter row (Figma: System Logs | Audit Logs).
  const switcher = (
    <TabsMinimal
      label="Logs"
      items={[
        { id: 'system' as const, label: 'System Logs' },
        { id: 'issues' as const, label: 'Issues' },
        { id: 'audit' as const,  label: 'Audit Logs' },
      ]}
      selectedKey={activeTab}
      onSelectionChange={(t) => { setIssueFilter(null); setActiveTab(t) }}
    />
  )

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 sm:px-4 lg:px-5 3xl:px-9 3xl:pt-[34px] 3xl:pb-8 lg:overflow-hidden">
        {activeTab === 'system' && <SystemLogsTab switcher={switcher} issue={issueFilter} onClearIssue={() => setIssueFilter(null)} />}
        {activeTab === 'issues' && (
          <IssuesTab
            switcher={switcher}
            onShowOccurrences={(i) => {
              setIssueFilter({ issue_id: i.issue_id, label: i.title.length > 90 ? `${i.title.slice(0, 89)}…` : i.title })
              setActiveTab('system')
            }}
          />
        )}
        {activeTab === 'audit'  && <AuditLogsTab  switcher={switcher} />}
      </div>
    </div>
  )
}
