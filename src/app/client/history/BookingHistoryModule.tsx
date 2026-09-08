'use client'

import { motion, Variants, AnimatePresence } from 'framer-motion'
import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  History, Search, ChevronRight, ChevronLeft,
  MapPin, Truck, Package, Calendar, Hash,
  X, AlertCircle, RefreshCw, ArrowUpRight, Filter,
} from 'lucide-react'

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
import { StatusBadge } from '@/components/transactions/TransactionStatus'
import {
  formatDate, formatPeso, buildCargoSummary, getDropoffs,
} from '@/components/transactions/transaction-format'
import {
  BG_PAGE, BG_PANEL, BG_CARD, BORDER, BORDER_C, CYAN, MUTED, ERROR, RADIUS,
} from '@/components/transactions/transaction-theme'

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

const TABS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'PENDING',    label: 'Pending' },
  { key: 'APPROVED',   label: 'Approved' },
  { key: 'ASSIGNED',   label: 'Assigned' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
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

function BookingCard({ booking, onSelect }: {
  booking: BookingWithRelations
  onSelect: () => void
}) {
  const dropoffs   = getDropoffs(booking)
  const summary    = buildCargoSummary(booking)
  const schedDate  = booking.schedule_date as string | undefined
  const totalCost  = booking.total_cost as number | null | undefined

  return (
    <motion.div variants={fadeUp} layout
      className="rounded-xl border p-4 flex flex-col gap-3 cursor-pointer group transition-colors"
      style={{ background: BG_PANEL, borderColor: BORDER }}
      onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Hash size={12} style={{ color: CYAN }} />
            <span className="font-bold text-white text-sm tracking-wide font-mono">
              {bookingRef(booking)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
            <Calendar size={11} />
            <span>Scheduled {formatDate(schedDate)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={booking.status} />
          <ArrowUpRight size={14} style={{ color: MUTED }}
            className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs">
          <Truck size={11} style={{ color: CYAN }} />
          <span className="truncate text-white/70">{booking.origin as string | undefined}</span>
        </div>
        {dropoffs.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs pl-0.5">
            <MapPin size={11} style={{ color: ERROR }} />
            <span className="truncate text-white/70">{d}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
          <Package size={11} />
          <span>{summary}</span>
        </div>
        <span className="text-sm font-bold text-white">{formatPeso(totalCost)}</span>
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
  const dateFromRef = useRef<HTMLInputElement>(null)
  const dateToRef   = useRef<HTMLInputElement>(null)

  const loadBookings = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const data = await bookingService.fetchBookingsByClient(clientId)
      setBookings(data)
    } catch {
      setError('Failed to load bookings. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { loadBookings() }, [loadBookings])

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
        <div className="flex items-center gap-2">
          <History size={18} style={{ color: CYAN }} />
          <h1 className="font-bold text-white text-base tracking-wide">
            {view === 'list' ? 'Transaction History' : bookingRef(selected)}
          </h1>
        </div>
        {view === 'list' && !loading && (
          <>
            <button onClick={loadBookings} title="Refresh"
              className="ml-2 flex items-center justify-center w-7 h-7 rounded-lg border transition-colors
                         hover:border-white/30 hover:text-white cursor-pointer"
              style={{ borderColor: BORDER_C, color: MUTED }}>
              <RefreshCw size={13} />
            </button>
            <span className="ml-auto text-xs uppercase tracking-widest font-bold px-2 py-0.5 rounded"
              style={{ background: `${CYAN}18`, color: CYAN }}>
              {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {view === 'detail' && selected && (
          <div className="ml-auto"><StatusBadge status={selected.status} /></div>
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
              <div className="flex gap-2">
                <div className="flex-1">
                  <TextField
                    fullWidth
                    placeholder="Search by reference number, pickup, or drop-off…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="outlined"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search size={15} style={{ color: MUTED }} />
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
                      ...fieldSx(BG_PANEL, BORDER),
                      '& .MuiInputBase-input': {
                        padding: '0 8px', height: 36, boxSizing: 'border-box',
                        '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
                      },
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-bold
                             uppercase tracking-wider transition-all cursor-pointer shrink-0"
                  style={{
                    borderColor: showFilters ? `${CYAN}60` : BORDER_C,
                    background:  showFilters ? `${CYAN}10` : 'transparent',
                    color:       showFilters ? CYAN : MUTED,
                  }}>
                  <Filter size={13} />Filters
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
                                    style={{ color: MUTED }} onClick={() => dateFromRef.current?.showPicker()} />
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
                                    style={{ color: MUTED }} onClick={() => dateToRef.current?.showPicker()} />
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

              {/* Tab bar */}
              <div className="flex items-center gap-0 border-b overflow-x-auto scrollbar-none"
                style={{ borderColor: BORDER }}>
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    className="flex items-center gap-1.5 pb-2 px-3 text-xs font-bold uppercase
                               tracking-wider transition-colors whitespace-nowrap cursor-pointer"
                    style={
                      activeTab === t.key
                        ? { color: '#fff', borderBottom: `2px solid ${CYAN}`, marginBottom: -1 }
                        : { color: MUTED }
                    }>
                    {t.label}
                    <span className="px-1.5 py-0.5 rounded-sm text-[10px]"
                      style={{
                        background: activeTab === t.key ? `${CYAN}22` : 'rgba(255,255,255,0.06)',
                        color:      activeTab === t.key ? CYAN : MUTED,
                      }}>
                      {counts[t.key] ?? 0}
                    </span>
                  </button>
                ))}
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
                  <button onClick={loadBookings}
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
                <motion.div variants={stagger} initial="hidden" animate="show"
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filtered.map((b) => (
                    <BookingCard key={b.booking_id} booking={b}
                      onSelect={() => { setSelected(b); setView('detail') }} />
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Detail */}
          {view === 'detail' && selected && (
            <TransactionDetail key="detail" booking={selected} />
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
