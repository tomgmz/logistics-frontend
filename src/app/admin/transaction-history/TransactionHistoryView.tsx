'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle, BarChart3, ChevronDown, ChevronLeft, ChevronRight,
  Download, History, RefreshCw, Search, X,
} from 'lucide-react'

import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { bookingRef } from '@/lib/booking'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'

import CompanyFilter from '@/components/transactions/CompanyFilter'
import TransactionDetail from '@/components/transactions/TransactionDetail'
import { StatusBadge, getStatusMeta } from '@/components/transactions/TransactionStatus'
import {
  formatDate, formatPeso, formatPesoExact, getCompanyName, getDropoffs,
} from '@/components/transactions/transaction-format'
import {
  DATE_PRESETS, resolvePreset, type DatePreset,
} from '@/components/transactions/date-presets'
import {
  transactionHistoryService, buildTransactionCsv, downloadCsv,
  type CompanyOption, type DateBasis, type SortKey,
  type TransactionFilters, type TransactionListMeta, type TransactionSummary,
} from '@/lib/services/admin/transaction-history.service'

/**
 * Transaction history for staff — the client's own history widened across every
 * company.
 *
 * The client page browses one company's bookings as cards and filters them in
 * memory. That does not survive contact with every company at once, so this is
 * a dense table over a server-side query, with the totals and the per-company
 * rollup computed under exactly the same filters as the rows.
 *
 * Rendered by both /admin/transaction-history and
 * /accountant/transaction-history. The dashboard shell resolves the
 * transaction-history module from the URL segment, so there is no guard here —
 * only `canExport`, which decides whether the export control exists.
 */

const PAGE_SIZE = 20

const BORDER = 'rgba(255,255,255,0.07)'
const CYAN   = '#4DF9ED'
const MUTED  = '#818181'
const ERROR  = '#f87171'

const TABS: { key: string; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'pending',    label: 'Pending' },
  { key: 'approved',   label: 'Approved' },
  { key: 'assigned',   label: 'Assigned' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'completed',  label: 'Completed' },
  { key: 'cancelled',  label: 'Cancelled' },
]

const DATE_BASES: { key: DateBasis; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled date' },
  { key: 'booked',    label: 'Booked date' },
  { key: 'completed', label: 'Completed date' },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'date_desc',   label: 'Date — Newest First' },
  { key: 'date_asc',    label: 'Date — Oldest First' },
  { key: 'amount_desc', label: 'Amount — Highest First' },
  { key: 'amount_asc',  label: 'Amount — Lowest First' },
]

const selectClass =
  'rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-xs font-bold text-white/80 ' +
  'outline-none focus:border-[var(--color-cyan)]/50 cursor-pointer'

function KpiTile({ label, value, accent, sub }: {
  label: string; value: string; accent?: string; sub?: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#1b1b1b] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums" style={{ color: accent ?? '#fff' }}>
        {value}
      </p>
      {sub && <p className="text-[11px]" style={{ color: MUTED }}>{sub}</p>}
    </div>
  )
}

export default function TransactionHistoryView() {
  const { canExport } = useModuleAccess()

  // --- filters -------------------------------------------------------------
  const [search, setSearch]                 = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]     = useState('all')
  const [clientIds, setClientIds]           = useState<string[]>([])
  const [preset, setPreset]                 = useState<DatePreset>('all')
  const [dateBasis, setDateBasis]           = useState<DateBasis>('scheduled')
  const [customFrom, setCustomFrom]         = useState('')
  const [customTo, setCustomTo]             = useState('')
  const [sort, setSort]                     = useState<SortKey>('date_desc')
  const [page, setPage]                     = useState(0)

  // --- data ----------------------------------------------------------------
  const [rows, setRows]           = useState<BookingWithRelations[]>([])
  const [meta, setMeta]           = useState<TransactionListMeta | null>(null)
  const [summary, setSummary]     = useState<TransactionSummary | null>(null)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [selected, setSelected]   = useState<BookingWithRelations | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0) }, 350)
    return () => clearTimeout(t)
  }, [search])

  // A preset resolves to a concrete range; only 'custom' reads the two inputs.
  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'custom') return { dateFrom: customFrom, dateTo: customTo }
    const r = resolvePreset(preset)
    return { dateFrom: r.from ?? '', dateTo: r.to ?? '' }
  }, [preset, customFrom, customTo])

  const filters: TransactionFilters = useMemo(() => ({
    status:    statusFilter,
    search:    debouncedSearch,
    clientIds,
    dateBasis,
    dateFrom:  dateFrom || undefined,
    dateTo:    dateTo   || undefined,
    sort,
  }), [statusFilter, debouncedSearch, clientIds, dateBasis, dateFrom, dateTo, sort])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Rows and totals go out together under one filter object, so the strip
      // above the table can never describe a different query than the table.
      const [list, sum] = await Promise.all([
        transactionHistoryService.list({ ...filters, page: page + 1, limit: PAGE_SIZE }),
        transactionHistoryService.summary(filters),
      ])
      setRows(list.rows)
      setMeta(list.meta)
      setSummary(sum)
      if (list.meta.totalPages >= 1 && page > list.meta.totalPages - 1) {
        setPage(list.meta.totalPages - 1)
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load transactions. Please try again.'))
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await transactionHistoryService.companies()
        if (!cancelled) setCompanies(list)
      } catch {
        // A failed company list only costs the filter its options; the page
        // itself still works, so this stays quiet.
        if (!cancelled) setCompanies([])
      } finally {
        if (!cancelled) setCompaniesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const statusCounts = meta?.statusCounts ?? { all: 0 }
  const totalRows    = meta?.total ?? 0
  const pageCount    = Math.max(1, meta?.totalPages ?? 1)
  const pageSafe     = Math.min(page, pageCount - 1)

  const hasActiveFilters =
    !!debouncedSearch || statusFilter !== 'all' || clientIds.length > 0 ||
    preset !== 'all' || sort !== 'date_desc' || dateBasis !== 'scheduled'

  function clearFilters() {
    setSearch(''); setDebouncedSearch(''); setStatusFilter('all'); setClientIds([])
    setPreset('all'); setDateBasis('scheduled'); setCustomFrom(''); setCustomTo('')
    setSort('date_desc'); setPage(0)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const { rows: exportRows, truncated } = await transactionHistoryService.exportRows(filters)
      if (exportRows.length === 0) {
        appToast.error('Nothing to export for these filters.')
        return
      }
      const stamp = dateFrom && dateTo ? `${dateFrom}_${dateTo}` : new Date().toISOString().slice(0, 10)
      downloadCsv(`transactions_${stamp}.csv`, buildTransactionCsv(exportRows))
      appToast.success(`Exported ${exportRows.length.toLocaleString()} transactions.`)
      if (truncated) {
        appToast.error('Export was capped at 5,000 rows — narrow the filters for the rest.')
      }
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Export failed. Please try again.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-bg)] text-white">

      {/* Header */}
      <header className="flex shrink-0 flex-col justify-between gap-3 border-b px-3 py-3
                         sm:flex-row sm:items-end lg:px-4"
        style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-2">
          <History size={18} style={{ color: CYAN }} />
          <h1 className="text-lg font-bold tracking-tight text-white">Transaction History</h1>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button type="button" onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2
                       text-xs font-semibold text-white/80 transition-colors hover:bg-white/5 cursor-pointer">
            <RefreshCw size={14} />Refresh
          </button>
          {/* Gated on can_export, the tier the IT Admin sets for this module. */}
          {canExport && (
            <button type="button" onClick={() => void handleExport()} disabled={exporting || loading}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold
                         transition-colors disabled:opacity-40 cursor-pointer"
              style={{ borderColor: `${CYAN}55`, background: `${CYAN}10`, color: CYAN }}>
              <Download size={14} />{exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 lg:p-4">

          {/* Filters */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[10px] px-3 py-2"
              style={{ background: '#2a2828' }}>
              <Search size={16} className="shrink-0 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, company, pickup, truck type…"
                className="flex-1 border-none bg-transparent text-sm text-white/80 outline-none
                           placeholder:text-white/35"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')}
                  className="shrink-0 text-white/40 hover:text-white cursor-pointer">
                  <X size={14} />
                </button>
              )}
            </div>

            <CompanyFilter
              options={companies}
              selected={clientIds}
              loading={companiesLoading}
              onChange={(next) => { setClientIds(next); setPage(0) }}
            />

            {/* A booking carries three meaningful dates, so the range has to say
                which one it applies to. */}
            <select aria-label="Date basis" value={dateBasis} className={selectClass}
              onChange={(e) => { setDateBasis(e.target.value as DateBasis); setPage(0) }}>
              {DATE_BASES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>

            <select aria-label="Date range" value={preset} className={selectClass}
              onChange={(e) => { setPreset(e.target.value as DatePreset); setPage(0) }}>
              {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>

            {preset === 'custom' && (
              <>
                <input type="date" aria-label="From" value={customFrom}
                  onChange={(e) => { setCustomFrom(e.target.value); setPage(0) }}
                  className={selectClass} style={{ colorScheme: 'dark' }} />
                <input type="date" aria-label="To" value={customTo}
                  onChange={(e) => { setCustomTo(e.target.value); setPage(0) }}
                  className={selectClass} style={{ colorScheme: 'dark' }} />
              </>
            )}

            <select aria-label="Sort by" value={sort} className={selectClass}
              onChange={(e) => { setSort(e.target.value as SortKey); setPage(0) }}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>

            {hasActiveFilters && (
              <button type="button" onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider
                           transition-opacity hover:opacity-70 cursor-pointer"
                style={{ color: ERROR }}>
                <RefreshCw size={12} />Clear
              </button>
            )}
          </div>

          {/* Totals for the current filter */}
          <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-5">
            <KpiTile label="Transactions" value={summary ? summary.total.toLocaleString() : '—'} />
            <KpiTile label="Gross Value"  value={summary ? formatPesoExact(summary.grossValue) : '—'} accent={CYAN}
              sub={summary && summary.unpriced > 0 ? `${summary.unpriced} unpriced` : undefined} />
            <KpiTile label="Average Value" value={summary ? formatPesoExact(summary.averageValue) : '—'} />
            <KpiTile label="Completed" value={summary ? summary.completed.toLocaleString() : '—'}
              sub={summary && summary.total > 0
                ? `${((summary.completed / summary.total) * 100).toFixed(1)}% of total`
                : undefined} />
            <KpiTile label="Cancellation Rate"
              value={summary ? `${(summary.cancellationRate * 100).toFixed(1)}%` : '—'}
              accent={summary && summary.cancellationRate > 0.1 ? ERROR : undefined}
              sub={summary ? `${summary.cancelled.toLocaleString()} cancelled` : undefined} />
          </div>

          {/* Per-company rollup */}
          {summary && summary.breakdown.length > 0 && (
            <div className="shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
              <button type="button" onClick={() => setShowBreakdown((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors
                           hover:bg-white/[0.03] cursor-pointer">
                <BarChart3 size={14} style={{ color: CYAN }} />
                <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                  By company
                </span>
                <span className="text-[11px] text-white/35">
                  {summary.breakdown.length} row{summary.breakdown.length !== 1 ? 's' : ''}
                </span>
                <ChevronDown size={14}
                  className={`ml-auto text-white/40 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
              </button>

              {showBreakdown && (
                <div className="max-h-[220px] overflow-y-auto border-t border-white/[0.07]">
                  {summary.breakdown.map((r) => {
                    const share = summary.grossValue > 0 ? r.grossValue / summary.grossValue : 0
                    // The "Other companies" remainder has no id and nothing to
                    // drill into.
                    const drillable = r.clientId !== null
                    return (
                      <div
                        key={r.clientId ?? '__other__'}
                        role={drillable ? 'button' : undefined}
                        tabIndex={drillable ? 0 : undefined}
                        onClick={drillable ? () => { setClientIds([r.clientId!]); setPage(0) } : undefined}
                        onKeyDown={drillable ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault(); setClientIds([r.clientId!]); setPage(0)
                          }
                        } : undefined}
                        className={`flex items-center gap-3 border-b border-white/[0.04] px-3 py-2 text-sm
                                    ${drillable ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
                      >
                        <span className="min-w-0 flex-1 truncate text-white/80">{r.companyName}</span>
                        <span className="w-24 shrink-0 text-right text-xs tabular-nums text-white/50">
                          {r.count.toLocaleString()} txn
                        </span>
                        <span className="w-32 shrink-0 text-right tabular-nums text-white/85">
                          {formatPesoExact(r.grossValue)}
                        </span>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums" style={{ color: MUTED }}>
                          {(share * 100).toFixed(0)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Status tabs */}
          <div className="scrollbar-none flex shrink-0 items-center gap-0 overflow-x-auto border-b"
            style={{ borderColor: BORDER }}>
            {TABS.map((t) => (
              <button key={t.key} type="button"
                onClick={() => { setStatusFilter(t.key); setPage(0) }}
                className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap px-3 pb-2 text-xs
                           font-bold uppercase tracking-wider transition-colors"
                style={
                  statusFilter === t.key
                    ? { color: '#fff', borderBottom: `2px solid ${CYAN}`, marginBottom: -1 }
                    : { color: MUTED }
                }>
                {t.label}
                <span className="rounded-sm px-1.5 py-0.5 text-[10px] tabular-nums"
                  style={{
                    background: statusFilter === t.key ? `${CYAN}22` : 'rgba(255,255,255,0.06)',
                    color:      statusFilter === t.key ? CYAN : MUTED,
                  }}>
                  {statusCounts[t.key] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border
                          border-white/[0.08] bg-[#0f0f0f]">
            {loading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: CYAN }} />
                <p className="text-sm text-white/45">Loading transactions…</p>
              </div>
            ) : error ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <AlertCircle size={28} style={{ color: ERROR }} />
                <p className="text-sm" style={{ color: ERROR }}>{error}</p>
                <button type="button" onClick={() => void load()}
                  className="text-sm font-semibold cursor-pointer" style={{ color: CYAN }}>
                  Try again
                </button>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
                <p className="text-sm text-white/45">No transactions match your filters.</p>
                {hasActiveFilters && (
                  <button type="button" onClick={clearFilters}
                    className="text-xs underline underline-offset-2 cursor-pointer hover:opacity-80"
                    style={{ color: CYAN }}>
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-[1] border-b bg-[#141414]"
                      style={{ borderColor: BORDER }}>
                      <tr className="text-[11px] uppercase tracking-wider text-white/40">
                        <th className="px-3 py-2.5 font-bold">Reference</th>
                        <th className="px-3 py-2.5 font-bold">Company</th>
                        <th className="hidden px-3 py-2.5 font-bold lg:table-cell">Booked</th>
                        <th className="px-3 py-2.5 font-bold">Scheduled</th>
                        <th className="hidden px-3 py-2.5 font-bold md:table-cell">Route</th>
                        <th className="px-3 py-2.5 font-bold">Status</th>
                        <th className="px-3 py-2.5 text-right font-bold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b) => {
                        const id     = b.booking_id as string
                        const active = (selected?.booking_id as string | undefined) === id
                        const drops  = getDropoffs(b)
                        const route  = [b.origin as string | undefined, drops[0]]
                          .filter(Boolean).join(' → ')
                        const meta   = getStatusMeta(b.status)
                        return (
                          <tr key={id} role="button" tabIndex={0}
                            onClick={() => setSelected(b)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(b) }
                            }}
                            className="cursor-pointer border-b border-white/[0.05] transition-colors
                                       hover:bg-white/[0.04]"
                            style={{ background: active ? 'rgba(77,249,237,0.06)' : undefined }}>
                            <td className="px-3 py-2.5 font-mono text-white/85">{bookingRef(b)}</td>
                            <td className="max-w-[200px] truncate px-3 py-2.5 text-white/70">
                              {getCompanyName(b)}
                            </td>
                            <td className="hidden whitespace-nowrap px-3 py-2.5 text-white/60 lg:table-cell">
                              {formatDate(b.created_at as string | undefined)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-white/75">
                              {formatDate(b.schedule_date as string | undefined)}
                            </td>
                            <td className="hidden max-w-[260px] truncate px-3 py-2.5 text-white/70 md:table-cell">
                              {route || '—'}
                              {drops.length > 1 && (
                                <span className="ml-1 text-[11px]" style={{ color: MUTED }}>
                                  +{drops.length - 1}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="inline-flex rounded-md border px-2 py-0.5 text-[10px]
                                               font-bold uppercase tracking-wide"
                                style={{
                                  color:       meta.color,
                                  borderColor: `${meta.color}55`,
                                  background:  `${meta.color}14`,
                                }}>
                                {meta.label}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-white/90">
                              {formatPeso(b.total_cost as number | null | undefined)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex shrink-0 items-center justify-between border-t px-3 py-2
                                text-xs text-white/50"
                  style={{ borderColor: BORDER }}>
                  <span>
                    Showing{' '}
                    {totalRows === 0
                      ? '0'
                      : `${pageSafe * PAGE_SIZE + 1}–${Math.min((pageSafe + 1) * PAGE_SIZE, totalRows)}`}
                    {' '}of {totalRows.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={pageSafe <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="rounded-md border border-white/10 p-1.5 hover:bg-white/5
                                 disabled:opacity-30 cursor-pointer">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-2 tabular-nums">{pageSafe + 1} / {pageCount}</span>
                    <button type="button" disabled={pageSafe >= pageCount - 1}
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      className="rounded-md border border-white/10 p-1.5 hover:bg-white/5
                                 disabled:opacity-30 cursor-pointer">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Detail panel — the same view the client sees for this transaction. */}
        <AnimatePresence>
          {selected && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setSelected(null)}
                className="fixed inset-0 z-20 bg-black/60 xl:hidden"
              />
              <motion.aside
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed right-0 top-0 z-30 flex h-full w-full max-w-[460px] flex-col
                           border-l bg-[var(--color-bg)] xl:relative xl:z-0 xl:h-auto xl:max-w-[420px]"
                style={{ borderColor: BORDER }}
              >
                <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3"
                  style={{ borderColor: BORDER }}>
                  <button type="button" onClick={() => setSelected(null)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border
                               transition-colors hover:border-white/30 hover:text-white cursor-pointer"
                    style={{ borderColor: 'rgba(255,255,255,0.12)', color: MUTED }}>
                    <X size={16} />
                  </button>
                  <span className="font-mono text-sm font-bold text-white">{bookingRef(selected)}</span>
                  <div className="ml-auto">
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {/* The drawer already slides, so the body must not slide too. */}
                  <TransactionDetail booking={selected} animated={false} />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
