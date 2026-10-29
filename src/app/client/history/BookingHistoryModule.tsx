'use client'

import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useServerTable } from '@/lib/hooks/useServerTable'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { motion, Variants, AnimatePresence } from 'framer-motion'
import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ChevronRight, ChevronLeft, Package,
  AlertCircle, RefreshCw,
} from 'lucide-react'
import FilterBar from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import Pagination from '@/components/ui/Pagination'


import { bookingService } from '@/lib/services/client/booking.service'
import { useAuthStore }    from '@/lib/store/auth.store'
import type {
  BookingWithRelations,
} from '@/lib/store/slice/routeMap.slice'
import { type BookingStatus, asBookingStatus } from '@/app/types/maps/routemap.types'
import { bookingRef } from '@/lib/booking'

import TransactionDetail from '@/components/transactions/TransactionDetail'
import RejectionPanel from '@/components/transactions/RejectionPanel'
import CompletionPanel from '@/components/transactions/CompletionPanel'
import BookingDocuments from '@/components/transactions/BookingDocuments'
import { StatusBadge, getStatusMeta } from '@/components/transactions/TransactionStatus'
import ProblemReportedBadge, { hasOpenClientIssue } from '@/components/transactions/ProblemReportedBadge'
import ResubmittedBadge, { resubmissionsOf } from '@/components/transactions/ResubmittedBadge'
import ResubmissionChanges from '@/components/transactions/ResubmissionChanges'
import {
  formatDate, getDropoffs,
} from '@/components/transactions/transaction-format'
import {
  BG_PAGE, BG_PANEL, BG_CARD, BORDER, BORDER_C, CYAN, MUTED, ERROR,
} from '@/components/transactions/transaction-theme'
import StopTimesPanel from '@/components/transactions/StopTimesPanel'


/** An icon exported from the Figma Transaction History (public/icons/transaction-history). */
function HistoryIcon({ name, size, className = '' }: { name: string; size: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/icons/transaction-history/${name}`} alt="" width={size} height={size}
      className={`shrink-0 ${className}`} draggable={false} />
  )
}

// Twelve cards a page: whole rows in the 1-, 2- and 3-column layouts.
const PAGE_SIZE = 12

const TABS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'PENDING',    label: 'Pending' },
  { key: 'APPROVED',   label: 'Approved' },
  { key: 'ASSIGNED',   label: 'Assigned' },
  { key: 'IN_TRANSIT', label: 'In transit' },
  { key: 'DELIVERED',  label: 'Delivered' },
  { key: 'COMPLETED',  label: 'Completed' },
  { key: 'CANCELLED',  label: 'Cancelled' },
]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35 } },
}
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3 animate-pulse"
      style={{ background: BG_PANEL, borderColor: BORDER }}>
      <div className="flex justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 rounded" style={{ background: BG_CARD }} />
          <div className="h-3 w-24 rounded" style={{ background: BG_CARD }} />
        </div>
        <div className="h-5 w-20 rounded" style={{ background: BG_CARD }} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="h-3 w-48 rounded" style={{ background: BG_CARD }} />
        <div className="h-3 w-36 rounded" style={{ background: BG_CARD }} />
      </div>
      <div className="h-px" style={{ background: BORDER }} />
      <div className="flex justify-between">
        <div className="h-3 w-36 rounded" style={{ background: BG_CARD }} />
        <div className="h-4 w-20 rounded" style={{ background: BG_CARD }} />
      </div>
    </div>
  )
}

/** The status as the Figma tags it: coloured outline, tinted fill, no icon. */
function StatusTag({ status }: { status: string }) {
  const m = getStatusMeta(status)
  // Delivered (awaiting the client's confirmation) is white in the Figma, not
  // the green Completed uses.
  const delivered = asBookingStatus(status) === 'DELIVERED'
  const color = delivered ? '#ffffff' : m.color
  return (
    <span className="ff-sc !text-xs sm:!text-sm leading-none px-1.5 py-1 rounded-[5px] border whitespace-nowrap"
      style={{ color, borderColor: color, background: delivered ? 'rgba(255,255,255,0.2)' : `${color}1f` }}>
      {m.label}
    </span>
  )
}

/** "16 items  1600.0 KG  13.00 CBM" — whatever of it the booking has. */
function cargoLine(booking: BookingWithRelations): string {
  const items  = (booking.booking_cargo_items as Array<{ quantity?: number | null }> | undefined) ?? []
  const count  = items.reduce((n, it) => n + (it.quantity ?? 0), 0)
  const weight = booking.required_weight_kg as number | null | undefined
  const volume = booking.required_volume_cbm as number | null | undefined
  const parts: string[] = []
  if (count)  parts.push(`${count} item${count !== 1 ? 's' : ''}`)
  if (weight) parts.push(`${Number(weight).toFixed(1)} KG`)
  if (volume) parts.push(`${Number(volume).toFixed(2)} CBM`)
  return parts.length > 0 ? parts.join('   ') : 'No cargo details'
}

function BookingCard({ booking, onSelect }: {
  booking: BookingWithRelations
  onSelect: () => void
}) {
  const dropoffs  = getDropoffs(booking)
  const schedDate = booking.schedule_date as string | undefined

  return (
    <motion.div variants={fadeUp} layout
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className="ff-sc rounded-[10px] p-4 flex flex-col gap-3 cursor-pointer
                 shadow-[0_4px_4px_rgba(0,0,0,0.25)] outline-none focus-visible:ring-1 focus-visible:ring-[#4DF9ED]/60"
      style={{ background: BG_PANEL }}
      onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="font-bold text-base text-white truncate">
            <span style={{ color: CYAN }}>#</span><span className="ml-2">{bookingRef(booking)}</span>
          </p>
          <div className="flex items-center gap-1.5 text-sm" style={{ color: MUTED }}>
            <HistoryIcon name="calendar.svg" size={16} />
            <span className="truncate">Scheduled {formatDate(schedDate)}</span>
          </div>
          {hasOpenClientIssue(booking) && (
            <ProblemReportedBadge className="" note={booking.client_issue_note as string | null | undefined} />
          )}
          <ResubmittedBadge className="" count={resubmissionsOf(booking)} />
        </div>
        <StatusTag status={booking.status} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm">
          <HistoryIcon name="pin-pickup.svg" size={17} />
          <span className="truncate text-white">{booking.origin as string | undefined}</span>
        </div>
        {dropoffs.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <HistoryIcon name="pin-dropoff.svg" size={17} />
            <span className="truncate text-white">{d}</span>
          </div>
        ))}
      </div>

      {/* mt-auto: pinned to the card's bottom, so the line sits at the same
          height across a grid row whatever the number of drop-offs. */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-2 border-t border-white/80">
        <div className="flex items-center gap-1.5 text-[13px] min-w-0" style={{ color: MUTED }}>
          <HistoryIcon name="cargo.svg" size={18} />
          <span className="truncate whitespace-pre">{cargoLine(booking)}</span>
        </div>
        <HistoryIcon name="open.svg" size={18} />
      </div>
    </motion.div>
  )
}

type View = 'list' | 'detail'

// Reads the ?booking=<id> deep-link (set by a rejection-notification tap) and
// reports it up. Isolated so useSearchParams sits under its own Suspense boundary.
function DeepLinkReader({ onId }: { onId: (id: string | null) => void }) {
  const searchParams = useSearchParams()
  const id = searchParams.get('booking')
  useEffect(() => { onId(id) }, [id, onId])
  return null
}

export default function BookingHistoryModule() {
  const clientId = useAuthStore((s) => s.user?.clients?.client_id)

  const [view,        setView]        = useState<View>('list')
  const [selected,    setSelected]    = useState<BookingWithRelations | null>(null)
  const [search,      setSearch]      = useState('')
  const [activeTab,   setActiveTab]   = useState<BookingStatus | 'all'>('all')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())

  // Server-side pages of 12 cards: the server keeps to this client's own
  // bookings, applies the tab, search and dates, orders by schedule date
  // (newest first) and counts every status for the tabs.
  const table = useServerTable(
    (q) => bookingService.fetchClientBookingsPage({
      page:  q.page,
      limit: PAGE_SIZE,
      ...(activeTab !== 'all' && { status: activeTab.toLowerCase() }),
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(dateFrom && { date_from: dateFrom }),
      ...(dateTo   && { date_to: dateTo }),
    }),
    `${activeTab}|${debouncedSearch}|${dateFrom}|${dateTo}`,
    { enabled: !!clientId, errorMessage: 'Failed to load bookings. Please try again.' },
  )
  const { rows: bookings, setRows: setBookings, error, page, setPage, total, totalPages } = table
  const loading = !!clientId && table.loading
  const loadBookings = table.reload

  // The signal is id-only and covers every client's bookings; the re-read goes
  // through the API, which only ever returns this client's own.
  useLiveTable(['live:bookings'], () => { void loadBookings(true) }, { enabled: !!clientId })

  // The open booking is live too: its status, details and the completion and
  // rejection panels follow every change. Those panels keep what the client is
  // typing in their own state, so a re-read never clears it; the panels below
  // (stop times, documents, resubmission changes) re-read themselves.
  const selectedId = selected?.booking_id as string | undefined
  useLiveTable(['live:bookings'], () => {
    if (!selectedId) return
    bookingService.getBookingById(selectedId)
      .then((b) => setSelected((cur) => (cur?.booking_id === selectedId ? b as BookingWithRelations : cur)))
      .catch(() => {})
  }, { enabled: !!clientId && view === 'detail' && !!selectedId })

  // Notification deep-link: open the booking named in ?booking=. It is fetched
  // on its own, since the list is paged and it may not be on the page showing.
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null)
  const deepLinkAppliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!deepLinkId || deepLinkAppliedRef.current === deepLinkId) return
    deepLinkAppliedRef.current = deepLinkId
    bookingService.getBookingById(deepLinkId)
      .then((b) => { setSelected(b as BookingWithRelations); setView('detail') })
      .catch(() => {})
  }, [deepLinkId])

  // Counted by the server over every booking of this client.
  const statusCounts = table.meta?.statusCounts ?? {}
  const counts = TABS.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] = statusCounts[t.key === 'all' ? 'all' : t.key.toLowerCase()] ?? 0
    return acc
  }, {})

  const hasActiveFilters =
    !!dateFrom || !!dateTo || !!search || activeTab !== 'all'

  function clearFilters() {
    setDateFrom(''); setDateTo('')
    setSearch(''); setActiveTab('all')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG_PAGE, color: '#fff' }}>

      <Suspense fallback={null}>
        <DeepLinkReader onId={setDeepLinkId} />
      </Suspense>

      {/* Header: a booking's back button, number and badges. The list needs
          none: the module's name is in the page header at the very top. */}
      <div className={`${view === 'list' ? 'hidden' : 'flex'} items-center gap-3 px-4 lg:px-6 py-4 border-b shrink-0`}
        style={{ borderColor: BORDER }}>
        {view === 'detail' && (
          <button onClick={() => { setView('list'); setSelected(null) }}
            className="flex items-center justify-center w-8 h-8 rounded-lg border transition-colors
                       hover:border-white/30 hover:text-white cursor-pointer shrink-0"
            style={{ borderColor: BORDER_C, color: MUTED }}>
            <ChevronLeft size={16} />
          </button>
        )}
        <h1 className="font-[family-name:var(--font-alegreya-sc)] text-[17px] 3xl:text-[20px] font-bold text-white truncate">
          {bookingRef(selected)}
        </h1>
        {view === 'detail' && selected && (
          <div className="ml-auto flex items-center gap-2">
            {hasOpenClientIssue(selected) && (
              <ProblemReportedBadge className="" note={selected.client_issue_note as string | null | undefined} />
            )}
            <ResubmittedBadge className="" count={resubmissionsOf(selected)} />
            <StatusBadge status={selected.status} />
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      {view === 'detail' && selected && (
        <div className="flex items-center gap-1.5 px-4 lg:px-6 py-2 text-xs border-b shrink-0"
          style={{ borderColor: BORDER, color: MUTED }}>
          <button onClick={() => { setView('list'); setSelected(null) }}
            className="hover:text-white transition-colors cursor-pointer">
            Transaction History
          </button>
          <ChevronRight size={11} />
          <span style={{ color: CYAN }}>{bookingRef(selected)}</span>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">

          {view === 'list' && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-[1_0_auto] flex-col gap-4">

              {/* Untitled UI's table card, as on the staff tables: the header (title +
                  count), then its filter row with the status tabs on the left (a
                  dropdown on phones) and search and dates on the right. No Refresh:
                  the list is live.
                  The booking cards stay as they are, inside the card. */}
              {/* Reaches the bottom of the screen even with only a few cards. */}
              <TableCard.Root untitled className="flex flex-[1_0_auto] flex-col">
              <TableCard.Header title="Bookings" />
              <FilterBar
                layout="untitled"
                leading={
                  <TabsMinimal
                  untitled
                    label="Booking status"
                    items={TABS.map((t) => ({ id: t.key, label: `${t.label} (${counts[t.key] ?? 0})` }))}
                    selectedKey={activeTab}
                    onSelectionChange={setActiveTab}
                  />
                }
                search={{ value: search, onChange: setSearch, placeholder: 'Search' }}
                // Untitled UI's "Select dates": the scheduled-date window.
                dateRange={{
                  value: dateFrom || dateTo ? { from: dateFrom || dateTo, to: dateTo || dateFrom } : null,
                  onChange: (r) => { setDateFrom(r?.from ?? ''); setDateTo(r?.to ?? '') },
                }}
              />

              <div className="flex flex-[1_0_auto] flex-col gap-4 p-4 md:p-6">
              {/* Legend */}
              <div className="ff-sc flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:text-base font-bold"
                style={{ color: MUTED }}>
                <span>Legend:</span>
                <span className="flex items-center gap-1"><HistoryIcon name="pin-pickup.svg" size={17} />Pick Up Point</span>
                <span className="flex items-center gap-1"><HistoryIcon name="pin-dropoff.svg" size={17} />Drop Off Point</span>
              </div>

              {/* Results count */}
              {(search || dateFrom || dateTo) && !loading && (
                <p className="text-xs" style={{ color: MUTED }}>
                  {total} result{total !== 1 ? 's' : ''} found
                </p>
              )}

              {/* Loading */}
              {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              )}

              {/* Error */}
              {!loading && error && (
                <div className="flex flex-col items-center gap-3 py-16">
                  <AlertCircle size={32} style={{ color: ERROR }} />
                  <p className="text-sm" style={{ color: ERROR }}>{error}</p>
                  <button onClick={() => void loadBookings()}
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider
                               transition-opacity hover:opacity-70 cursor-pointer"
                    style={{ color: CYAN }}>
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              )}

              {/* Empty */}
              {!loading && !error && bookings.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16">
                  <Package size={32} style={{ color: MUTED }} />
                  <p className="text-sm" style={{ color: MUTED }}>
                    {(statusCounts.all ?? 0) === 0 ? 'No bookings yet.' : 'No bookings match your filters.'}
                  </p>
                  {hasActiveFilters && (
                    <button onClick={clearFilters}
                      className="text-xs underline underline-offset-2 cursor-pointer hover:opacity-80"
                      style={{ color: CYAN }}>
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              {/* Cards */}
              {!loading && !error && bookings.length > 0 && (
                <motion.div key={page} variants={stagger} initial="hidden" animate="show"
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {bookings.map((b) => (
                    <BookingCard key={b.booking_id} booking={b}
                      onSelect={() => { setSelected(b); setView('detail') }} />
                  ))}
                </motion.div>
              )}
              </div>
              {/* The card's own footer, full width under the cards, as on Booking
                  Management; the body above grows to keep it at the bottom. */}
              {!loading && !error && bookings.length > 0 && (
                <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={table.fetching} />
              )}
              </TableCard.Root>
            </motion.div>
          )}

          {/* Detail */}
          {view === 'detail' && selected && (
            <div key="detail" className="flex flex-col gap-4">
              {/* Completion is the client's call once the driver is done. */}
              <CompletionPanel booking={selected} mode="client" onUpdated={(next) => {
                setSelected(next)
                setBookings((prev) => prev.map((b) => (b.booking_id === next.booking_id ? next : b)))
              }} />
              {/* A rejection is the client's to answer: resubmit or cancel. */}
              <RejectionPanel booking={selected} onUpdated={(next) => {
                setSelected(next)
                setBookings((prev) => prev.map((b) => (b.booking_id === next.booking_id ? next : b)))
              }} />
              <TransactionDetail booking={selected} showDocuments={false} />
              <ResubmissionChanges key={`rev-${selected.booking_id as string}`} bookingId={selected.booking_id as string}
                resubmissionCount={resubmissionsOf(selected)} />
              <StopTimesPanel key={`times-${selected.booking_id as string}`} bookingId={selected.booking_id as string} />
              <BookingDocuments key={selected.booking_id as string} bookingId={selected.booking_id as string} />
            </div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
