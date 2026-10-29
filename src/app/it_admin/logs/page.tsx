'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import Pagination from '@/components/ui/Pagination'
import { useLivePending } from '@/lib/hooks/useLiveTable'
import NewEntriesBar from '@/components/ui/NewEntriesBar'
import { useEffect, useState, useCallback, type ReactNode } from 'react'
import FilterBar, { type FilterValues } from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import type { DateRange } from '@/components/ui/untitled/date-range-picker'
import ExportLogsButton from '@/components/admin/ExportLogsButton'
import {
  AuditLogTable, SystemLogTable, LogDetail, auditDetailRows, systemDetailRows,
  AUDIT_TYPE_OPTIONS, SORT_OPTIONS,
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
  SYSTEM_LOG_EVENT_LABEL,
  SYSTEM_LOG_LEVEL_LABEL,
} from '@/lib/services/admin/system-logs.service'

import { useTablePageSize } from '@/lib/hooks/useTablePageSize'
// Types now come from the service — see system-logs.service.ts. They used to be
// declared here because there was no system-logs endpoint to type against.
export type { SystemLogLevel, SystemLogEventType, SystemLogStats }

const EVENT_LABEL = SYSTEM_LOG_EVENT_LABEL
const LEVEL_LABEL = SYSTEM_LOG_LEVEL_LABEL

type ActiveTab = 'audit' | 'system'

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
      <div className="flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto lg:min-h-0">
        {empty ?? table}
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
    setLoading(true)
    setError(null)
    try {
      const res = await auditLogService.getAll({ ...JSON.parse(filterKey), page, limit: PAGE_SIZE })
      setLogs(res.data)
      setTotal(res.total)
    } catch (e: unknown) {
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
        <div className="flex flex-col items-center py-16 text-[#424242] text-sm tracking-wide">
          No logs match your filters.
          <ClearFiltersLink show={filtered} onClear={() => { setSearch(''); setLogType(''); setDateRange(null); setPage(1) }} />
        </div>
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

  useEffect(() => { setPage(1) }, [debouncedSearch, eventType, level, resolved, sort, dateRange])

  const filters = {
    sort,
    ...(eventType       && { event_type: eventType }),
    ...(level           && { log_level: level }),
    ...(resolved        && { resolved: resolved === 'true' }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(dateRange       && { from: dateRange.from, to: dateRange.to }),
  }
  const filterKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    clearPending()
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        // Paginated server-side: system logs are written by machines and this
        // table grows far faster than the audit one.
        const res = await systemLogService.getAll({ ...JSON.parse(filterKey), page, limit: PAGE_SIZE })
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
  }, [filterKey, refreshKey, page, clearPending, PAGE_SIZE])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const filtered   = !!search || !!eventType || !!level || !!resolved || !!dateRange

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
      detail={selected && (
        <LogDetail
          title={`System Log — ${selected.log_id.slice(0, 8).toUpperCase()}`}
          rows={systemDetailRows(selected)}
          metadata={selected.metadata ?? undefined}
          onClose={() => setSelected(null)}
        />
      )}
      error={!loading ? error : null}
      pending={pending}
      onLoadNew={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !error && logs.length === 0 && (
        <div className="flex flex-col items-center py-16 text-[#424242] text-sm tracking-wide">
          No system logs match your filters.
          <ClearFiltersLink
            show={filtered}
            onClear={() => { setSearch(''); setEventType(''); setLevel(''); setResolved(''); setDateRange(null); setPage(1) }}
          />
        </div>
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

export default function LogsPage() {
  // System Logs is the first tab and the default; ?tab=audit opens Audit Logs.
  // Safe to read in the initialiser: the it_admin layout renders nothing until
  // the auth store has hydrated, so this page never renders on the server.
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'audit'
      ? 'audit'
      : 'system')

  // The switch in each table's filter row (Figma: System Logs | Audit Logs).
  const switcher = (
    <TabsMinimal
      label="Logs"
      items={[{ id: 'system' as const, label: 'System Logs' }, { id: 'audit' as const, label: 'Audit Logs' }]}
      selectedKey={activeTab}
      onSelectionChange={setActiveTab}
    />
  )

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 sm:px-4 lg:px-5 3xl:px-9 3xl:pt-[34px] 3xl:pb-8 lg:overflow-hidden">
        {activeTab === 'system' && <SystemLogsTab switcher={switcher} />}
        {activeTab === 'audit'  && <AuditLogsTab  switcher={switcher} />}
      </div>
    </div>
  )
}
