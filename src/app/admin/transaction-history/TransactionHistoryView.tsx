'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import Pagination from '@/components/ui/Pagination'
import { useLivePending } from '@/lib/hooks/useLiveTable'
import NewEntriesBar from '@/components/ui/NewEntriesBar'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Download, History, X } from 'lucide-react'

import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { bookingRef } from '@/lib/booking'
import { bookingService } from '@/lib/services/client/booking.service'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'

import StaffTransactionDetail from '@/components/transactions/StaffTransactionDetail'
import TransactionRecord from '@/components/transactions/TransactionRecord'
import { getStatusMeta } from '@/components/transactions/TransactionStatus'
import { PANEL_BG, Tag } from '@/app/admin/booking-management/BookingDetailParts'
import ProblemReportedBadge, { hasOpenClientIssue } from '@/components/transactions/ProblemReportedBadge'
import ResubmittedBadge, { resubmissionsOf } from '@/components/transactions/ResubmittedBadge'
import ResubmissionChanges from '@/components/transactions/ResubmissionChanges'
import {
  formatDate, formatPeso, getCompanyName, getDropoffs,
} from '@/components/transactions/transaction-format'
import {
  transactionHistoryService, downloadDispatchXlsx,
  type CompanyOption, type DateBasis, type SortKey,
  type TransactionFilters, type TransactionListMeta,
} from '@/lib/services/admin/transaction-history.service'
import StopTimesPanel from '@/components/transactions/StopTimesPanel'

import RefreshButton from '@/components/ui/RefreshButton'
import FilterBar, { allowedValues } from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import { Button } from '@/components/ui/untitled/button'
import type { DateRange } from '@/components/ui/untitled/date-range-picker'
import { useTablePageSize } from '@/lib/hooks/useTablePageSize'
/**
 * Transaction history for staff — the client's own history widened across every
 * company.
 *
 * The client page browses one company's bookings as cards and filters them in
 * memory. That does not survive contact with every company at once, so this is
 * a dense table over a server-side query, with the totals computed under
 * exactly the same filters as the rows.
 *
 * Rendered by both /admin/transaction-history and
 * The dashboard shell resolves the
 * transaction-history module from the URL segment, so there is no guard here —
 * only `canExport`, which decides whether the export control exists.
 */


const BORDER = 'rgba(255,255,255,0.07)'
const CYAN   = '#4DF9ED'
const MUTED  = '#818181'
const ERROR  = '#f62626'

const TABS: { key: string; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'pending',    label: 'Pending' },
  { key: 'approved',   label: 'Approved' },
  { key: 'assigned',   label: 'Assigned' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered',  label: 'Delivered' },
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

// The cards above the table: one count per status, in that status's colour.
const STATUS_CARDS: { key: string; label: string }[] = [
  { key: 'pending',   label: 'Pending' },
  { key: 'approved',  label: 'Approved' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
]

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

// Reports ?booking=<id>. Isolated so useSearchParams sits under its own
// Suspense boundary.
function BookingDeepLink({ onBooking }: { onBooking: (id: string | null) => void }) {
  const id = useSearchParams()?.get('booking') ?? null
  useEffect(() => { onBooking(id) }, [id, onBooking])
  return null
}

export default function TransactionHistoryView() {
  const router   = useRouter()
  const pathname = usePathname()
  // 10 rows on phones, 20 from tablet up (lib/hooks/useTablePageSize).
  const PAGE_SIZE = useTablePageSize()
  const { canExport } = useModuleAccess()

  // --- filters -------------------------------------------------------------
  const [search, setSearch]                 = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]     = useState('all')
  const [clientIds, setClientIds]           = useState<string[]>([])
  // Untitled UI's "Select dates"; the Filters panel says which date it reads.
  const [dateRange, setDateRange]           = useState<DateRange | null>(null)
  const [dateBasis, setDateBasis]           = useState<DateBasis>('scheduled')
  const [sort, setSort]                     = useState<SortKey>('date_desc')
  const [page, setPage]                     = useState(0)

  // --- data ----------------------------------------------------------------
  const [rows, setRows]           = useState<BookingWithRelations[]>([])
  const [meta, setMeta]           = useState<TransactionListMeta | null>(null)
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected]   = useState<BookingWithRelations | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const dateFrom = dateRange?.from ?? ''
  const dateTo   = dateRange?.to ?? ''

  const filters: TransactionFilters = useMemo(() => ({
    status:    statusFilter,
    search:    debouncedSearch,
    clientIds,
    dateBasis,
    dateFrom:  dateFrom || undefined,
    dateTo:    dateTo   || undefined,
    sort,
  }), [statusFilter, debouncedSearch, clientIds, dateBasis, dateFrom, dateTo, sort])

  // Booking changes are counted, not loaded: every stop and status change on
  // any active booking would otherwise reload this whole history.
  const { pending, clear: clearPending } = useLivePending(['live:bookings'])

  // `quiet` re-reads in place: no spinner, and a failed re-read keeps the rows
  // already on screen instead of replacing them with an error.
  const load = useCallback(async (quiet = false) => {
    clearPending()
    if (!quiet) {
      setLoading(true)
      setError(null)
    }
    try {
      // The cards above the table read the same response's status counts, so
      // they can never describe a different query than the table.
      const list = await transactionHistoryService.list({ ...filters, page: page + 1, limit: PAGE_SIZE })
      setRows(list.rows)
      setMeta(list.meta)
      if (list.meta.totalPages >= 1 && page > list.meta.totalPages - 1) {
        setPage(list.meta.totalPages - 1)
      }
    } catch (err) {
      if (!quiet) setError(getApiErrorMessage(err, 'Failed to load transactions. Please try again.'))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [filters, page, clearPending, PAGE_SIZE])

  useEffect(() => { void load() }, [load])

  // ?booking=<id> (Open Booking in Document Management) opens that booking's
  // panel. Read through useSearchParams (BookingDeepLink below), not
  // window.location: on an in-app navigation the address only changes after
  // this page starts rendering. Each id opens once; the address is then tidied
  // so a refresh starts clean.
  const openedDeepLink = useRef<string | null>(null)
  const openDeepLink = useCallback((id: string | null) => {
    if (!id || openedDeepLink.current === id) return
    openedDeepLink.current = id
    bookingService.getBookingById(id)
      .then((b) => {
        if (b) setSelected(b as BookingWithRelations)
        router.replace(pathname ?? '/')
      })
      .catch((e) => {
        openedDeepLink.current = null
        appToast.error(getApiErrorMessage(e, 'Could not open that booking.'))
      })
  }, [router, pathname])

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
    !!dateRange || sort !== 'date_desc' || dateBasis !== 'scheduled'

  function clearFilters() {
    setSearch(''); setDebouncedSearch(''); setStatusFilter('all'); setClientIds([])
    setDateRange(null); setDateBasis('scheduled')
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
      await downloadDispatchXlsx(`transactions_${stamp}.xlsx`, exportRows)
      const bookings = new Set(exportRows.map((r) => r.booking_id)).size
      appToast.success(`Exported ${bookings.toLocaleString()} booking${bookings === 1 ? '' : 's'} (${exportRows.length.toLocaleString()} rows).`)
      if (truncated) {
        appToast.error('Export was capped at 5,000 bookings — narrow the filters for the rest.')
      }
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Export failed. Please try again.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[var(--color-bg)] text-white">
      <Suspense fallback={null}>
        <BookingDeepLink onBooking={openDeepLink} />
      </Suspense>

      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-3 lg:px-4"
        style={{ borderColor: BORDER }}>
        <History size={18} style={{ color: CYAN }} />
        <h1 className="font-[family-name:var(--font-alegreya-sc)] text-[17px] 3xl:text-[20px] font-bold text-white">Transaction History</h1>
      </header>

      <div className="flex lg:min-h-0 flex-[1_0_auto] lg:flex-1 lg:overflow-hidden">
        <div className="flex lg:min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 lg:p-4">

          {/* Four status counts under the current search and filters (the status
              tab itself never narrows them). */}
          <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
            {STATUS_CARDS.map((c) => (
              <KpiTile key={c.key} label={c.label} accent={getStatusMeta(c.key).color}
                value={meta ? (statusCounts[c.key] ?? 0).toLocaleString() : '—'} />
            ))}
          </div>

          {/* Untitled UI's table card, as on Booking Management: the header (title,
              count, Export), then the filter row with the status tabs on the left
              and search, Select dates, Filters and Refresh on the right. */}
          <TableCard.Root className="flex lg:min-h-0 flex-[1_0_auto] lg:flex-1 flex-col">
            <TableCard.Header
              className="shrink-0"
              title="Transactions"
              badge={`${totalRows.toLocaleString()} ${totalRows === 1 ? 'transaction' : 'transactions'}`}
              contentTrailing={canExport && (
                // Gated on can_export, the tier the IT Admin sets for this module.
                <Button color="secondary" iconLeading={Download} onClick={() => void handleExport()}
                  disabled={exporting || loading} className="max-md:w-full">
                  {exporting ? 'Exporting…' : 'Export'}
                </Button>
              )}
            />
            <FilterBar
              layout="split"
              leading={
                <TabsMinimal
                  label="Status"
                  items={TABS.map((t) => ({ id: t.key, label: `${t.label} (${statusCounts[t.key] ?? 0})` }))}
                  selectedKey={statusFilter}
                  onSelectionChange={(k) => { setStatusFilter(k); setPage(0) }}
                />
              }
              search={{ value: search, onChange: setSearch, placeholder: 'Search' }}
              dateRange={{ value: dateRange, onChange: (r) => { setDateRange(r); setPage(0) } }}
              fields={[
                { key: 'company', label: 'Company', options: companies.map((c) => ({ value: c.clientId, label: c.companyName })) },
                // A booking carries three meaningful dates, so "Select dates" has to say which.
                { key: 'basis',   label: 'Date',    single: true, options: DATE_BASES.map((d) => ({ value: d.key, label: d.label })) },
                { key: 'sort',    label: 'Sort',    single: true, options: SORTS.map((o) => ({ value: o.key, label: o.label })) },
              ]}
              values={[
                ...clientIds.map((id) => ({ field: 'company', op: 'is' as const, value: id })),
                ...(dateBasis !== 'scheduled' ? [{ field: 'basis', op: 'is' as const, value: dateBasis }] : []),
                ...(sort !== 'date_desc' ? [{ field: 'sort', op: 'is' as const, value: sort }] : []),
              ]}
              onChange={(v) => {
                setClientIds(allowedValues(v, 'company', companies.map((c) => c.clientId)) ?? [])
                setDateBasis((v.find((r) => r.field === 'basis')?.value ?? 'scheduled') as DateBasis)
                setSort((v.find((r) => r.field === 'sort')?.value ?? 'date_desc') as SortKey)
                setPage(0)
              }}
              actions={<RefreshButton iconOnly onClick={() => void load()} loading={loading} disabled={loading} />}
            />
            <NewEntriesBar count={pending} singular="new update" plural="new updates"
              onRefresh={() => void load(true)} />
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
                <ClearFiltersLink show={hasActiveFilters} onClear={clearFilters} className="mt-0" />
              </div>
            ) : (
              <>
                <div className="lg:min-h-0 flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    {/* Untitled UI's header row: tinted, small caps, sentence case. */}
                    <thead className="sticky top-0 z-[1] bg-[#222222] font-[family-name:var(--font-alegreya-sc)]">
                      <tr className="h-11 border-b border-[#424242] text-xs text-[#818181] [&>th]:px-4 md:[&>th]:px-6 [&>th]:py-2 [&>th]:font-semibold [&>th]:whitespace-nowrap">
                        <th>Reference</th>
                        <th>Company</th>
                        <th className="hidden lg:table-cell">Booked</th>
                        <th>Scheduled</th>
                        <th className="hidden md:table-cell">Route</th>
                        <th>Status</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="ff-regular">
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
                            className={`cursor-pointer border-b border-[#424242] last:border-b-0 transition-colors [&>td]:px-4 md:[&>td]:px-6 [&>td]:py-4 ${
                              active ? 'bg-[#4df9ed]/[0.06]' : '[@media(hover:hover)]:hover:bg-[#222222]'
                            }`}>
                            <td className="whitespace-nowrap font-medium text-[#4df9ed]">{bookingRef(b)}</td>
                            <td className="max-w-[200px] truncate text-white">
                              {getCompanyName(b)}
                            </td>
                            <td className="hidden whitespace-nowrap text-[#c4c4c4] lg:table-cell">
                              {formatDate(b.created_at as string | undefined)}
                            </td>
                            <td className="whitespace-nowrap text-[#c4c4c4]">
                              {formatDate(b.schedule_date as string | undefined)}
                            </td>
                            <td className="hidden max-w-[260px] truncate text-[#c4c4c4] md:table-cell">
                              {route || '—'}
                              {drops.length > 1 && (
                                <span className="ml-1 text-xs" style={{ color: MUTED }}>
                                  +{drops.length - 1}
                                </span>
                              )}
                            </td>
                            <td>
                              {/* Untitled UI's pill with a dot, in the status colour. */}
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
                                style={{ color: meta.color, background: `${meta.color}1a`, ['--tw-ring-color' as string]: `${meta.color}4d` }}>
                                <span aria-hidden className="size-1.5 rounded-full" style={{ background: meta.color }} />
                                {meta.label}
                              </span>
                              {hasOpenClientIssue(b) && (
                                <ProblemReportedBadge note={b.client_issue_note as string | null | undefined} />
                              )}
                              <ResubmittedBadge count={resubmissionsOf(b)} />
                            </td>
                            <td className="whitespace-nowrap text-right font-semibold tabular-nums text-white">
                              {formatPeso(b.total_cost as number | null | undefined)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <Pagination page={pageSafe + 1} totalPages={pageCount} total={totalRows} pageSize={PAGE_SIZE} onPageChange={(p) => setPage(p - 1)} />
              </>
            )}
          </TableCard.Root>
        </div>

        {/* Detail panel — the client's view of the transaction, then the full
            staff record under it. */}
        <AnimatePresence>
          {selected && (
            <>
              <motion.button
                type="button"
                aria-label="Close panel"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setSelected(null)}
                className="fixed inset-0 z-[40] bg-black/60 lg:hidden"
              />
              {/* Same frame as the Booking Management side panel. */}
              <motion.aside
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                className="fixed lg:relative z-[50] inset-y-0 right-0 w-full max-w-[455px] shrink-0
                           border-l border-[#424242] flex flex-col shadow-2xl lg:shadow-none"
                style={{ background: PANEL_BG }}
              >
                <div className="shrink-0 flex items-center justify-between gap-3 pl-4 sm:pl-[26px] pr-2 sm:pr-3
                                min-h-[59px] border-b border-[#424242]">
                  <span className="text-base font-bold uppercase text-[#818181]">Transaction</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {hasOpenClientIssue(selected) && (
                      <ProblemReportedBadge className="" note={selected.client_issue_note as string | null | undefined} />
                    )}
                    <ResubmittedBadge className="" count={resubmissionsOf(selected)} />
                    <Tag color={getStatusMeta(selected.status).color} size="md">
                      {getStatusMeta(selected.status).label}
                    </Tag>
                    <button type="button" onClick={() => setSelected(null)} aria-label="Close"
                      className="p-2 rounded-lg hover:bg-white/5 text-[#818181] hover:text-white transition-colors cursor-pointer">
                      <X size={19} strokeWidth={2} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-[18px] pb-6 space-y-[18px]">
                  <StaffTransactionDetail booking={selected} />
                  <ResubmissionChanges key={`rev-${selected.booking_id as string}`} bookingId={selected.booking_id as string}
                    resubmissionCount={resubmissionsOf(selected)} />
                  {/* Staff-only: crew, vehicle, proof photos, inspections, reports. */}
                  <TransactionRecord key={selected.booking_id as string} booking={selected} />
                  <StopTimesPanel key={`times-${selected.booking_id as string}`} bookingId={selected.booking_id as string} staff />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
