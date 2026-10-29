'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import Pagination from '@/components/ui/Pagination'
import { useLivePending } from '@/lib/hooks/useLiveTable'
import NewEntriesBar from '@/components/ui/NewEntriesBar'
import { useEffect, useState, useCallback } from 'react'
import {
  auditLogService,
  exportAuditLogsXlsx,
  AUDIT_EXPORT_ROW_CAP,
  type AuditLog,
  type LogType,
} from '@/lib/services/admin/audit-logs.service'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import ExportLogsButton from '@/components/admin/ExportLogsButton'
import {
  AuditLogTable, LogDetail, auditDetailRows, AUDIT_TYPE_OPTIONS, SORT_OPTIONS,
} from '@/components/admin/LogTables'

import FilterBar, { type FilterValues } from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import type { DateRange } from '@/components/ui/untitled/date-range-picker'
import { useTablePageSize } from '@/lib/hooks/useTablePageSize'

/** The value a Filters-panel rule picked for `field` ("is" rules only). */
const pick = (v: FilterValues, field: string) => v.find((r) => r.field === field && r.op === 'is')?.value

/**
 * The Company Administrator's Audit Logs, in the table format and the same
 * table as the IT Administrator's Logs (Figma 3234:1147): search, Filters,
 * Select Date and Export in the card's filter row. No Refresh: new rows are
 * counted live and the "new entries" bar loads them.
 */
export default function AuditLogsPage() {
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
  const { canExport }                         = useModuleAccess()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, logType, sort, dateRange])

  // New audit rows are counted, not loaded: the list never shifts while it is
  // being read, and the busiest live topic costs no re-reads.
  const { pending, clear: clearPending } = useLivePending(['live:audit_logs'])

  const filterKey = JSON.stringify({
    sort,
    ...(logType         && { log_type: logType }),
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(dateRange       && { from: dateRange.from, to: dateRange.to }),
  })

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

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 sm:px-4 lg:px-5 3xl:px-9 3xl:pt-[34px] 3xl:pb-8 lg:overflow-hidden">
        <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">

          <FilterBar
            layout="split"
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
            // Gated on can_export, the tier the IT Administrator sets for this module.
            trailing={canExport && (
              <ExportLogsButton
                untitled
                noun="audit logs"
                cap={AUDIT_EXPORT_ROW_CAP}
                disabled={loading}
                run={() => exportAuditLogsXlsx(JSON.parse(filterKey))}
              />
            )}
          />

          {selected && (
            <LogDetail
              title={`Log Detail — ${selected.log_id.slice(0, 8).toUpperCase()}`}
              rows={auditDetailRows(selected)}
              onClose={() => setSelected(null)}
            />
          )}

          {error && !loading && (
            <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <NewEntriesBar count={pending} onRefresh={() => void fetchLogs()} />

          <div className="flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto lg:min-h-0">
            {!loading && !error && logs.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-[#424242] text-sm tracking-wide">
                No logs match your filters.
                <ClearFiltersLink
                  show={!!search || !!logType || !!dateRange}
                  onClear={() => { setSearch(''); setLogType(''); setDateRange(null); setPage(1) }}
                />
              </div>
            ) : (
              <AuditLogTable
                logs={logs}
                loading={loading}
                pageSize={PAGE_SIZE}
                selectedId={selected?.log_id ?? null}
                onSelect={(log) => setSelected((prev) => prev?.log_id === log.log_id ? null : log)}
              />
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
