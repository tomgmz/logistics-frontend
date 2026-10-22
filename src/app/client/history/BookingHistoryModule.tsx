'use client'

import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { motion, Variants, AnimatePresence } from 'framer-motion'
import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ChevronRight, ChevronLeft, Package, Calendar,
  X, AlertCircle, RefreshCw,
} from 'lucide-react'
import RefreshButton from '@/components/ui/RefreshButton'
import Pagination from '@/components/ui/Pagination'

import TextField from '@mui/material/TextField'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import { SxProps, Theme } from '@mui/material/styles'

import { bookingService } from '@/lib/services/client/booking.service'
import { useAuthStore }    from '@/lib/store/auth.store'
import type {
  BookingWithRelations,
  BookingDestination,
} from '@/lib/store/slice/routeMap.slice'
import { type BookingStatus, asBookingStatus } from '@/app/types/maps/routemap.types'
import { bookingRef } from '@/lib/booking'

import TransactionDetail from '@/components/transactions/TransactionDetail'
import RejectionPanel from '@/components/transactions/RejectionPanel'
import CompletionPanel from '@/components/transactions/CompletionPanel'
import BookingDocuments from '@/components/transactions/BookingDocuments'
import { StatusBadge, getStatusMeta } from '@/components/transactions/TransactionStatus'
import ProblemReportedBadge, { hasOpenClientIssue } from '@/components/transactions/ProblemReportedBadge'
import {
  formatDate, getDropoffs,
} from '@/components/transactions/transaction-format'
import {
  BG_PAGE, BG_PANEL, BG_CARD, BORDER, BORDER_C, CYAN, MUTED, ERROR, RADIUS,
} from '@/components/transactions/transaction-theme'
import StopTimesPanel from '@/components/transactions/StopTimesPanel'


/* showPicker() is missing on iOS Safari before 16.4 (and throws if the input
   cannot open a picker); focusing the field opens the native wheel there. */
function openDatePicker(input: HTMLInputElement | null) {
  if (!input) return
  try { input.showPicker() } catch { input.focus() }
}
function fieldSx(bg: string, border: string): SxProps<Theme> {
  return {
    '& .MuiInputBase-root': {
      height: 36, borderRadius: RADIUS, backgroundColor: bg,
      color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
    },
    '& .MuiInputBase-input': {
      padding: '0 12px', height: 36, boxSizing: 'border-box',
      '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
    },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: border, borderRadius: RADIUS },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66` },
    '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66`, borderWidth: 1 },
    '& .MuiInputLabel-root': { display: 'none' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

function selectSx(bg: string, border: string): SxProps<Theme> {
  return {
    height: 36, borderRadius: RADIUS, backgroundColor: bg,
    color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
    '& .MuiSelect-select': {
      padding: '0 32px 0 10px !important', height: '36px !important',
      display: 'flex', alignItems: 'center',
    },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: border, borderRadius: RADIUS },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66` },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66`, borderWidth: 1 },
    '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

const MENU_PROPS = {
  PaperProps: {
    sx: {
      bgcolor: '#2A2828', color: '#fff',
      border: `1px solid ${BORDER_C}`, borderRadius: RADIUS,
      '& .MuiMenuItem-root': {
        fontSize: '0.875rem', fontFamily: 'inherit',
        '&:hover':              { bgcolor: 'rgba(77,249,237,0.08)' },
        '&.Mui-selected':       { bgcolor: 'rgba(77,249,237,0.14)' },
        '&.Mui-selected:hover': { bgcolor: 'rgba(77,249,237,0.20)' },
      },
    },
  },
}

/** An icon exported from the Figma Transaction History (public/icons/transaction-history). */
function HistoryIcon({ name, size, className = '' }: { name: string; size: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/icons/transaction-history/${name}`} alt="" width={size} height={size}
      className={`shrink-0 ${className}`} draggable={false} />
  )
}

// Figma lines and chips.
const LINE      = '#424242'
const CHIP_IDLE = '#343434'

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

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/80">
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

  const [bookings,    setBookings]    = useState<BookingWithRelations[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [view,        setView]        = useState<View>('list')
  const [selected,    setSelected]    = useState<BookingWithRelations | null>(null)
  const [search,      setSearch]      = useState('')
  const [activeTab,   setActiveTab]   = useState<BookingStatus | 'all'>('all')
  const [sortBy,      setSortBy]      = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page,        setPage]        = useState(1)
  const dateFromRef = useRef<HTMLInputElement>(null)
  const dateToRef   = useRef<HTMLInputElement>(null)

  // `quiet` re-reads in place (a live signal): no spinner, and a failed re-read
  // keeps the bookings already on screen instead of replacing them with an error.
  const loadBookings = useCallback(async (quiet = false) => {
    if (!clientId) { setLoading(false); return }
    if (!quiet) {
      setLoading(true)
      setError(null)
    }
    try {
      const data = await bookingService.fetchBookingsByClient(clientId)
      setBookings(data)
    } catch {
      if (!quiet) setError('Failed to load bookings. Please try again.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [clientId])

  useEffect(() => { loadBookings() }, [loadBookings])

  // The signal is id-only and covers every client's bookings; the re-read goes
  // through the API, which only ever returns this client's own.
  useLiveTable(['live:bookings'], () => { void loadBookings(true) }, { enabled: !!clientId })

  // Notification deep-link: once bookings load, open the one named in ?booking=.
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null)
  const deepLinkAppliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!deepLinkId || deepLinkAppliedRef.current === deepLinkId) return
    const match = bookings.find((b) => b.booking_id === deepLinkId)
    if (match) {
      deepLinkAppliedRef.current = deepLinkId
      setSelected(match)
      setView('detail')
    }
  }, [deepLinkId, bookings])

  const filtered = bookings
    .filter((b) => {
      const bStatus     = asBookingStatus(b.status)
      const matchTab    = activeTab === 'all' || bStatus === activeTab
      const q           = search.toLowerCase()
      const bRef        = typeof b.reference_number === 'string' ? b.reference_number : ''
      const bId         = typeof b.booking_id === 'string' ? b.booking_id : ''
      const bOrigin     = typeof b.origin === 'string' ? b.origin : ''
      const bDests      = (b.booking_destinations as BookingDestination[] | undefined) ?? []
      const matchSearch =
        !q ||
        bRef.toLowerCase().includes(q) ||
        bId.toLowerCase().includes(q) ||
        bOrigin.toLowerCase().includes(q) ||
        bDests.some((d) => (d.address as string | undefined)?.toLowerCase().includes(q))
      const schedDate   = (b.schedule_date as string | undefined) ?? ''
      const matchFrom   = !dateFrom || schedDate >= dateFrom
      const matchTo     = !dateTo   || schedDate <= dateTo
      return matchTab && matchSearch && matchFrom && matchTo
    })
    .sort((a, b) => {
      const aDate = (a.schedule_date as string | undefined) ?? ''
      const bDate = (b.schedule_date as string | undefined) ?? ''
      const aCost = (a.total_cost as number | null | undefined) ?? 0
      const bCost = (b.total_cost as number | null | undefined) ?? 0
      if (sortBy === 'date_desc')   return bDate.localeCompare(aDate)
      if (sortBy === 'date_asc')    return aDate.localeCompare(bDate)
      if (sortBy === 'amount_desc') return bCost - aCost
      if (sortBy === 'amount_asc')  return aCost - bCost
      return 0
    })

  // A new search, tab, sort or date range starts again from the first page.
  useEffect(() => { setPage(1) }, [search, activeTab, sortBy, dateFrom, dateTo])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageCards  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const counts = TABS.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] = t.key === 'all'
      ? bookings.length
      : bookings.filter((b) => asBookingStatus(b.status) === t.key).length
    return acc
  }, {})

  const hasActiveFilters =
    !!dateFrom || !!dateTo || sortBy !== 'date_desc' || !!search || activeTab !== 'all'

  function clearFilters() {
    setDateFrom(''); setDateTo('')
    setSortBy('date_desc'); setSearch(''); setActiveTab('all')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG_PAGE, color: '#fff' }}>

      <Suspense fallback={null}>
        <DeepLinkReader onId={setDeepLinkId} />
      </Suspense>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 lg:px-6 py-4 border-b shrink-0"
        style={{ borderColor: BORDER }}>
        {view === 'detail' && (
          <button onClick={() => { setView('list'); setSelected(null) }}
            className="flex items-center justify-center w-8 h-8 rounded-lg border transition-colors
                       hover:border-white/30 hover:text-white cursor-pointer shrink-0"
            style={{ borderColor: BORDER_C, color: MUTED }}>
            <ChevronLeft size={16} />
          </button>
        )}
        <h1 className="ff-sc text-white text-lg lg:text-xl truncate">
          {view === 'list' ? 'Transaction History' : bookingRef(selected)}
        </h1>
        {view === 'list' && !loading && (
          <div className="ml-auto flex items-center gap-3 shrink-0">
            <span className="ff-sc font-bold !text-[11px] uppercase whitespace-nowrap px-4 h-[30px] inline-flex items-center
                             rounded-full border"
              style={{ background: 'rgba(77,249,237,0.11)', borderColor: CYAN, color: CYAN }}>
              {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
            </span>
            <RefreshButton onClick={() => void loadBookings()} />
          </div>
        )}
        {view === 'detail' && selected && (
          <div className="ml-auto flex items-center gap-2">
            {hasOpenClientIssue(selected) && (
              <ProblemReportedBadge className="" note={selected.client_issue_note as string | null | undefined} />
            )}
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
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">

          {view === 'list' && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-4">

              {/* Search + filter toggle */}
              <div className="ff-sc flex gap-2">
                <div className="flex-1 min-w-0">
                  <TextField
                    fullWidth
                    placeholder="Search by booking reference or location…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="outlined"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <HistoryIcon name="search.svg" size={20} />
                        </InputAdornment>
                      ),
                      endAdornment: search ? (
                        <InputAdornment position="end">
                          <button onClick={() => setSearch('')}
                            className="cursor-pointer hover:text-white transition-colors"
                            style={{ color: MUTED }}>
                            <X size={14} />
                          </button>
                        </InputAdornment>
                      ) : null,
                    }}
                    sx={{
                      ...fieldSx(BG_PANEL, MUTED),
                      '& .MuiInputBase-root': {
                        height: 44, borderRadius: '15px', backgroundColor: BG_PANEL, paddingLeft: '14px',
                        color: '#fff', fontSize: '0.95rem', fontFamily: 'inherit',
                      },
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: MUTED, borderRadius: '15px' },
                      '& .MuiInputBase-input': {
                        padding: '0 8px', height: 44, boxSizing: 'border-box',
                        '&::placeholder': { color: MUTED, opacity: 1 },
                      },
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  aria-expanded={showFilters}
                  aria-label="Filters"
                  className="ff-sc flex items-center gap-2 px-4 sm:px-6 h-11 rounded-[15px] border text-base font-bold
                             uppercase transition-all cursor-pointer shrink-0"
                  style={{
                    borderColor: showFilters ? CYAN : MUTED,
                    background:  showFilters ? `${CYAN}10` : 'transparent',
                    color:       showFilters ? CYAN : MUTED,
                  }}>
                  <HistoryIcon name="filter.svg" size={18} />
                  <span className="hidden sm:inline">Filters</span>
                  {hasActiveFilters && (
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: CYAN }} />
                  )}
                </button>
              </div>

              {/* Expanded filters */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div key="filters"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="rounded-xl border p-4 flex flex-col gap-3"
                      style={{ background: BG_PANEL, borderColor: BORDER }}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: MUTED }}>Scheduled From</label>
                          <TextField
                            fullWidth type="date" value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            variant="outlined" inputRef={dateFromRef}
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <Calendar size={14} className="cursor-pointer hover:text-white transition-colors"
                                    style={{ color: MUTED }} onClick={() => openDatePicker(dateFromRef.current)} />
                                </InputAdornment>
                              ),
                            }}
                            sx={{
                              ...fieldSx(BG_CARD, BORDER_C),
                              '& input[type="date"]::-webkit-calendar-picker-indicator': { display: 'none' },
                              '& .MuiInputBase-input': { padding: '0 0 0 12px', height: 36, boxSizing: 'border-box', colorScheme: 'dark' },
                            }}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: MUTED }}>Scheduled To</label>
                          <TextField
                            fullWidth type="date" value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            variant="outlined" inputRef={dateToRef}
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <Calendar size={14} className="cursor-pointer hover:text-white transition-colors"
                                    style={{ color: MUTED }} onClick={() => openDatePicker(dateToRef.current)} />
                                </InputAdornment>
                              ),
                            }}
                            sx={{
                              ...fieldSx(BG_CARD, BORDER_C),
                              '& input[type="date"]::-webkit-calendar-picker-indicator': { display: 'none' },
                              '& .MuiInputBase-input': { padding: '0 0 0 12px', height: 36, boxSizing: 'border-box', colorScheme: 'dark' },
                            }}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: MUTED }}>Sort By</label>
                          <Select value={sortBy}
                            onChange={(e: SelectChangeEvent) => setSortBy(e.target.value as typeof sortBy)}
                            sx={{ ...selectSx(BG_CARD, BORDER_C), width: '100%' }} MenuProps={MENU_PROPS}>
                            <MenuItem value="date_desc">Date — Newest First</MenuItem>
                            <MenuItem value="date_asc">Date — Oldest First</MenuItem>
                            <MenuItem value="amount_desc">Amount — Highest First</MenuItem>
                            <MenuItem value="amount_asc">Amount — Lowest First</MenuItem>
                          </Select>
                        </div>
                      </div>
                      {hasActiveFilters && (
                        <div className="flex justify-end">
                          <button onClick={clearFilters}
                            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider
                                       transition-opacity hover:opacity-70 cursor-pointer"
                            style={{ color: ERROR }}>
                            <RefreshCw size={12} /> Clear Filters
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tab bar + legend */}
              <div className="ff-sc flex flex-col-reverse gap-2 lg:flex-row lg:items-end border-b"
                style={{ borderColor: LINE }}>
                <div className="flex items-end gap-1 overflow-x-auto scrollbar-none -mb-px">
                  {TABS.map((t) => {
                    const active = activeTab === t.key
                    return (
                      <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className="flex items-center gap-2 pb-2 px-3 text-sm lg:text-base font-bold
                                   transition-colors whitespace-nowrap cursor-pointer border-b-[1.5px]"
                        style={{ color: active ? '#fff' : MUTED, borderColor: active ? CYAN : 'transparent' }}>
                        {t.label}
                        <span className="min-w-5 h-5 px-1 inline-flex items-center justify-center rounded-[3px] text-sm"
                          style={{
                            background: active ? 'rgba(77,249,237,0.23)' : CHIP_IDLE,
                            color:      active ? CYAN : MUTED,
                          }}>
                          {counts[t.key] ?? 0}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="lg:ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-sm lg:text-base font-bold"
                  style={{ color: MUTED }}>
                  <span>Legend:</span>
                  <span className="flex items-center gap-1"><HistoryIcon name="pin-pickup.svg" size={17} />Pick Up Point</span>
                  <span className="flex items-center gap-1"><HistoryIcon name="pin-dropoff.svg" size={17} />Drop Off Point</span>
                </div>
              </div>

              {/* Results count */}
              {(search || dateFrom || dateTo) && !loading && (
                <p className="text-xs" style={{ color: MUTED }}>
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''} found
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
              {!loading && !error && filtered.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16">
                  <Package size={32} style={{ color: MUTED }} />
                  <p className="text-sm" style={{ color: MUTED }}>
                    {bookings.length === 0 ? 'No bookings yet.' : 'No bookings match your filters.'}
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
              {!loading && !error && filtered.length > 0 && (
                <>
                <motion.div key={safePage} variants={stagger} initial="hidden" animate="show"
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {pageCards.map((b) => (
                    <BookingCard key={b.booking_id} booking={b}
                      onSelect={() => { setSelected(b); setView('detail') }} />
                  ))}
                </motion.div>
                <Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} className="mt-3 rounded-[10px]" />
                </>
              )}
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
              <StopTimesPanel key={`times-${selected.booking_id as string}`} bookingId={selected.booking_id as string} />
              <BookingDocuments key={selected.booking_id as string} bookingId={selected.booking_id as string} />
            </div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
