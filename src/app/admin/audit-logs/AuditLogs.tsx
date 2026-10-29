'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import Pagination from '@/components/ui/Pagination'
import { useLivePending } from '@/lib/hooks/useLiveTable'
import NewEntriesBar from '@/components/ui/NewEntriesBar'
import { useEffect, useState, useCallback } from 'react'
import {
  auditLogService as systemLogService,
  exportAuditLogsXlsx,
  AUDIT_EXPORT_ROW_CAP,
  type AuditLog as SystemLog,
  type LogType,
} from '@/lib/services/admin/audit-logs.service'
import { formatDate, formatTime, formatDateTime } from '@/app/utils/timeFormat'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import ExportLogsButton from '@/components/admin/ExportLogsButton'
import { expandCode, roleLabel } from '@/lib/roles'

import RefreshButton from '@/components/ui/RefreshButton'
import FilterBar, { type FilterOption, type FilterValues } from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { useTablePageSize } from '@/lib/hooks/useTablePageSize'
const BADGE_STYLES: Record<LogType, string> = {
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

export default function AuditLogsPage() {
  // 10 rows on phones, 20 from tablet up (lib/hooks/useTablePageSize).
  const PAGE_SIZE = useTablePageSize()
  const [logs, setLogs]                       = useState<SystemLog[]>([])
  const [total, setTotal]                     = useState(0)
  const [page, setPage]                       = useState(1)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [logType, setLogType]                 = useState<LogType | ''>('')
  const [sort, setSort]                       = useState<'desc' | 'asc'>('desc')
  const [selected, setSelected]               = useState<SystemLog | null>(null)
  const { canExport }                         = useModuleAccess()

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
      const res = await systemLogService.getAll({
        sort,
        page,
        limit: PAGE_SIZE,
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
  }, [sort, logType, debouncedSearch, page, PAGE_SIZE, clearPending])

  useEffect(() => { fetchLogs() }, [fetchLogs])


  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage = Math.min(page, Math.max(1, totalPages))
  // Already the current page's rows — the server paginated them.
  const displayedLogs = logs

  const displayName = (log: SystemLog) => {
    if (!log.users) return '—'
    const { first_name, last_name } = log.users
    if (first_name || last_name) return [first_name, last_name].filter(Boolean).join(' ')
    return '—'
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 lg:px-4 gap-6 lg:overflow-hidden">

        {/* Untitled UI's table card, as on the IT Administrator's Logs: the header
            (title, count, Export), then the filter row with search, Filters and
            Refresh. */}
        <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">

          <TableCard.Header
            className="shrink-0"
            title="Audit Logs"
            contentTrailing={canExport && (
              // Gated on can_export, the tier the IT Admin sets for this module.
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
            )}
          />
          <FilterBar
            layout="split"
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
            actions={<RefreshButton iconOnly onClick={() => { fetchLogs() }} loading={loading} disabled={loading} />}
          />

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
            <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <NewEntriesBar count={pending} onRefresh={() => void fetchLogs()} />

          <div className="flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto lg:min-h-0">
            {loading && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#222222] font-[family-name:var(--font-alegreya-sc)]">
                  <tr className="h-11 border-b border-[#424242]">
                    {['Timestamp', 'Type', 'Action', 'Description', 'User'].map(h => (
                      <th key={h} className="px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]">
                        {h}
                      </th>
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
                      <td className="px-4 md:px-6 py-4">
                        <div className="h-4 w-20 animate-pulse rounded-full bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      </td>
                      <td className="px-4 md:px-6 py-4">
                        <div className="h-4 w-28 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      </td>
                      <td className="px-4 md:px-6 py-4">
                        <div className="h-3 w-48 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      </td>
                      <td className="px-4 md:px-6 py-4">
                        <div className="h-3 w-24 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                        <div className="mt-1.5 h-2 w-14 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40 + 20}ms` }} />
                      </td>
                      <td className="px-4 md:px-6 py-4">
                        <div className="h-2.5 w-24 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
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
                      <th key={h} className="px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]">
                        {h}
                      </th>
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
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap whitespace-nowrap ${BADGE_STYLES[log.log_type]}`}>
                          {expandCode(log.log_type).replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-4">
                        <span className="inline-flex whitespace-nowrap rounded-md bg-[#1b1b1b] px-1.5 py-0.5 font-mono text-xs font-medium text-[#c4c4c4] ring-1 ring-inset ring-[#424242]">
                          {expandCode(log.action)}
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-4 text-sm text-[#c4c4c4] max-w-xs truncate">
                        {log.description ?? '—'}
                      </td>
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

          {!loading && total > 0 && (
            <Pagination page={safePage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          )}

        </TableCard.Root>
      </div>
    </div>
  )
}