'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Calendar,
  Clock,
  Truck,
  Building2,
  Trash2,
  User,
  AlertTriangle,
} from 'lucide-react'

import { statusColor } from '@/components/map/status.colors'
import type { BookingDetail } from '@/app/types/maps/routemap.types'
import {
  bookingService,
  type AdminBookingLifecycleStatus,
  type DestinationDeliveryStatus,
} from '@/lib/services/client/booking.service'

const PAGE_SIZE = 12

const BOOKING_STATUSES: AdminBookingLifecycleStatus[] = [
  'pending',
  'assigned',
  'in_transit',
  'completed',
  'cancelled',
]

const DEST_STATUSES: DestinationDeliveryStatus[] = ['pending', 'delivered', 'failed']

function fmtStatus(s: string) {
  return (s ?? '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function normalizeBookingStatus(raw: string): AdminBookingLifecycleStatus {
  const s = (raw ?? '').toLowerCase().replace(/\s+/g, '_') as AdminBookingLifecycleStatus
  return BOOKING_STATUSES.includes(s) ? s : 'pending'
}

function axiosMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const data = (err as { response?: { data?: { message?: string } } }).response?.data
    if (data?.message && typeof data.message === 'string') return data.message
  }
  if (err instanceof Error) return err.message
  return 'Request failed'
}

interface ListRow {
  booking_id: string
  origin?: string
  status: string
  schedule_date?: string
  truck_type_needed?: string
  company?: string | null
  stops: number
}

function toRows(raw: Record<string, unknown>[]): ListRow[] {
  return raw.map((b) => {
    const clients = b.clients as { company_name?: string | null } | undefined
    const dests = b.booking_destinations as unknown[] | undefined
    return {
      booking_id:      String(b.booking_id ?? ''),
      origin:          typeof b.origin === 'string' ? b.origin : undefined,
      status:          typeof b.status === 'string' ? b.status : 'pending',
      schedule_date:   typeof b.schedule_date === 'string' ? b.schedule_date : undefined,
      truck_type_needed: typeof b.truck_type_needed === 'string' ? b.truck_type_needed : undefined,
      company:         clients?.company_name ?? null,
      stops:           Array.isArray(dests) ? dests.length : 0,
    }
  })
}

export default function BookingManagementView() {
  const [rawBookings, setRawBookings] = useState<Record<string, unknown>[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [listMeta, setListMeta] = useState<{
    total: number
    totalPages: number
    statusCounts: Record<string, number>
  } | null>(null)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<BookingDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [pendingStatus, setPendingStatus] = useState(false)
  const [destBusyId, setDestBusyId] = useState<string | null>(null)
  const [deleteAskId, setDeleteAskId] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(t)
  }, [search])

  const loadPage = useCallback(async () => {
    try {
      setListLoading(true)
      setListError(null)
      const res = await bookingService.fetchBookingsAdminPaginated({
        page:   page + 1,
        limit:  PAGE_SIZE,
        status: statusFilter,
        search: debouncedSearch,
      })
      setRawBookings(res.rows)
      setListMeta({
        total:        res.meta.total,
        totalPages:   res.meta.totalPages,
        statusCounts: res.meta.statusCounts,
      })
      if (res.meta.totalPages >= 1 && page > res.meta.totalPages - 1) {
        setPage(res.meta.totalPages - 1)
      }
    } catch (e) {
      setListError(axiosMessage(e))
    } finally {
      setListLoading(false)
    }
  }, [page, statusFilter, debouncedSearch])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  const listRows = useMemo(() => toRows(rawBookings), [rawBookings])

  const pageCount = Math.max(1, listMeta?.totalPages ?? 1)
  const pageSafe   = Math.min(page, pageCount - 1)
  const totalRows  = listMeta?.total ?? 0

  const openDetail = useCallback(async (bookingId: string) => {
    setSelectedId(bookingId)
    setDetail(null)
    setDetailError(null)
    setActionMsg(null)
    setDeleteAskId(null)
    try {
      setDetailLoading(true)
      const d = (await bookingService.getBookingById(bookingId)) as BookingDetail
      setDetail(d)
    } catch (e) {
      setDetailError(axiosMessage(e))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setDetail(null)
    setDetailError(null)
    setActionMsg(null)
    setDeleteAskId(null)
  }, [])

  const mergeListRow = useCallback((bookingId: string, patch: Partial<ListRow>) => {
    setRawBookings((prev) =>
      prev.map((b) => {
        if (String(b.booking_id) !== bookingId) return b
        return { ...b, ...patch }
      }),
    )
  }, [])

  const handleBookingStatusChange = async (next: AdminBookingLifecycleStatus) => {
    if (!selectedId || !detail) return
    if (normalizeBookingStatus(detail.status) === next) return
    setPendingStatus(true)
    setActionMsg(null)
    try {
      await bookingService.updateBookingStatusAdmin(selectedId, next)
      setDetail({ ...detail, status: next })
      mergeListRow(selectedId, { status: next })
      setActionMsg({ type: 'ok', text: 'Booking status updated.' })
    } catch (e) {
      setActionMsg({ type: 'err', text: axiosMessage(e) })
    } finally {
      setPendingStatus(false)
    }
  }

  const handleDestStatus = async (destinationId: string, status: DestinationDeliveryStatus) => {
    setDestBusyId(destinationId)
    setActionMsg(null)
    try {
      const deliveredAt = status === 'delivered' ? new Date().toISOString() : undefined
      await bookingService.updateDestinationStatus(destinationId, status, deliveredAt)
      if (selectedId) await openDetail(selectedId)
      await loadPage()
      setActionMsg({ type: 'ok', text: 'Stop updated.' })
    } catch (e) {
      setActionMsg({ type: 'err', text: axiosMessage(e) })
    } finally {
      setDestBusyId(null)
    }
  }

  const handleDeleteDest = async (destinationId: string) => {
    setDeleteBusy(true)
    setActionMsg(null)
    try {
      await bookingService.deleteDestinationAdmin(destinationId)
      setDeleteAskId(null)
      if (selectedId) await openDetail(selectedId)
      await loadPage()
      setActionMsg({ type: 'ok', text: 'Stop removed.' })
    } catch (e) {
      setActionMsg({ type: 'err', text: axiosMessage(e) })
    } finally {
      setDeleteBusy(false)
    }
  }

  const statusCounts = listMeta?.statusCounts ?? { all: 0 }

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-body bg-[var(--color-bg)]">
      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Booking management</h1>
          <p className="text-xs text-white/45 mt-0.5 max-w-xl">
            View all bookings, change workflow status, and update or remove delivery stops. Client-only edits
            (full booking body, create/delete booking) stay on the client portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPage()}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 p-3 lg:p-4 gap-3">
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between shrink-0">
            <div className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-md" style={{ background: '#2a2828' }}>
              <Search size={16} className="text-white/40 shrink-0" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(0)
                }}
                placeholder="Search ID, client, origin, truck type…"
                className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'pending', 'assigned', 'in_transit', 'completed', 'cancelled'] as const).map((key) => {
                const label = key === 'all' ? 'All' : fmtStatus(key)
                const count = key === 'all' ? statusCounts.all : statusCounts[key] ?? 0
                const active = statusFilter === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setStatusFilter(key)
                      setPage(0)
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                    style={{
                      background: active ? 'rgba(77,249,237,0.12)' : 'transparent',
                      borderColor: active ? 'rgba(77,249,237,0.35)' : 'rgba(255,255,255,0.08)',
                      color: active ? 'var(--color-cyan)' : '#888',
                    }}
                  >
                    {label}
                    <span className="ml-1 opacity-70">({count})</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
            {listLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
                <div
                  className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: 'var(--color-cyan)' }}
                />
                <p className="text-sm text-white/45">Loading bookings…</p>
              </div>
            ) : listError ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-red-400 text-sm">{listError}</p>
                <button
                  type="button"
                  onClick={() => void loadPage()}
                  className="text-[var(--color-cyan)] text-sm font-semibold"
                >
                  Try again
                </button>
              </div>
            ) : listRows.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-white/45 py-12">
                No bookings match your filters.
              </div>
            ) : (
              <>
                <div className="overflow-auto flex-1 min-h-0">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="sticky top-0 z-[1] bg-[#141414] border-b border-white/[0.07]">
                      <tr className="text-[11px] uppercase tracking-wider text-white/40">
                        <th className="px-3 py-2.5 font-bold">Status</th>
                        <th className="px-3 py-2.5 font-bold">Schedule</th>
                        <th className="px-3 py-2.5 font-bold hidden md:table-cell">Client</th>
                        <th className="px-3 py-2.5 font-bold">Origin</th>
                        <th className="px-3 py-2.5 font-bold hidden lg:table-cell">Truck</th>
                        <th className="px-3 py-2.5 font-bold text-right">Stops</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listRows.map((r) => {
                        const active = selectedId === r.booking_id
                        const c = statusColor(r.status)
                        return (
                          <tr
                            key={r.booking_id}
                            role="button"
                            tabIndex={0}
                            onClick={() => void openDetail(r.booking_id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                void openDetail(r.booking_id)
                              }
                            }}
                            className="border-b border-white/[0.05] cursor-pointer transition-colors hover:bg-white/[0.04]"
                            style={{
                              background: active ? 'rgba(77,249,237,0.06)' : undefined,
                            }}
                          >
                            <td className="px-3 py-2.5">
                              <span
                                className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                                style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}
                              >
                                {fmtStatus(r.status)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-white/75 whitespace-nowrap">{r.schedule_date ?? '—'}</td>
                            <td className="px-3 py-2.5 text-white/70 max-w-[180px] truncate hidden md:table-cell">
                              {r.company ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-white/85 max-w-[220px] truncate">{r.origin ?? '—'}</td>
                            <td className="px-3 py-2.5 text-white/55 text-xs hidden lg:table-cell">
                              {r.truck_type_needed ?? '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right text-white/60">{r.stops}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/[0.07] text-xs text-white/50">
                  <span>
                    Showing{' '}
                    {totalRows === 0
                      ? '0'
                      : `${pageSafe * PAGE_SIZE + 1}–${Math.min((pageSafe + 1) * PAGE_SIZE, totalRows)}`}{' '}
                    of {totalRows}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={pageSafe <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-2 tabular-nums">
                      {pageSafe + 1} / {pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={pageSafe >= pageCount - 1}
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      className="p-1.5 rounded-md border border-white/10 disabled:opacity-30 hover:bg-white/5"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <AnimatePresence>
          {selectedId && (
            <>
              <motion.button
                type="button"
                aria-label="Close panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[40] bg-black/60 lg:hidden"
                onClick={closeDetail}
              />
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                className="fixed lg:relative z-[50] inset-y-0 right-0 w-full max-w-md lg:max-w-[420px] shrink-0 border-l border-white/[0.08] bg-[var(--color-surface)] flex flex-col shadow-2xl lg:shadow-none"
              >
                <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-white/[0.07]">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/45">Booking</span>
                  <button
                    type="button"
                    onClick={closeDetail}
                    className="p-2 rounded-lg hover:bg-white/5 text-white/60"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
                  {detailLoading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-2">
                      <div
                        className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: 'var(--color-cyan)' }}
                      />
                      <p className="text-sm text-white/45">Loading…</p>
                    </div>
                  )}
                  {detailError && !detailLoading && (
                    <p className="text-sm text-red-400 text-center py-8">{detailError}</p>
                  )}
                  {detail && !detailLoading && (
                    <>
                      <div className="rounded-xl border border-white/[0.08] p-3 space-y-2 bg-black/20">
                        <p className="text-[10px] font-mono text-white/35 break-all">{detail.booking_id}</p>
                        <div className="flex items-start gap-2 text-white/90 text-sm">
                          <MapPin size={16} className="text-[var(--color-cyan)] shrink-0 mt-0.5" />
                          <span>{detail.origin}</span>
                        </div>
                        <div className="grid gap-2 text-sm text-white/70">
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-white/35" />
                            {detail.clients?.company_name ?? '—'}
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-white/35" />
                            {detail.schedule_date}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-white/35" />
                            {detail.call_time}
                          </div>
                          <div className="flex items-center gap-2">
                            <Truck size={14} className="text-white/35" />
                            {detail.truck_type_needed}
                          </div>
                          {detail.driver?.name && (
                            <div className="flex items-center gap-2">
                              <User size={14} className="text-white/35" />
                              Driver: {detail.driver.name}
                              {detail.driver.truck?.plate_number
                                ? ` · ${detail.driver.truck.plate_number}`
                                : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                          Booking status
                        </label>
                        <select
                          value={normalizeBookingStatus(detail.status)}
                          disabled={pendingStatus}
                          onChange={(e) =>
                            void handleBookingStatusChange(e.target.value as AdminBookingLifecycleStatus)
                          }
                          className="w-full rounded-lg border border-white/10 bg-[#1a1a1a] text-sm text-white px-3 py-2.5 outline-none focus:border-[var(--color-cyan)]/50 disabled:opacity-50"
                        >
                          {BOOKING_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {fmtStatus(s)}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-white/35 mt-1.5">
                          Backend rules: you cannot move backwards in the workflow except to set{' '}
                          <strong className="text-white/55">Cancelled</strong>.
                        </p>
                      </div>

                      <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
                          Delivery stops
                        </h3>
                        <ul className="space-y-2">
                          {(detail.booking_destinations ?? [])
                            .slice()
                            .sort((a, b) => a.sequence_order - b.sequence_order)
                            .map((d) => (
                              <li
                                key={d.destination_id}
                                className="rounded-lg border border-white/[0.08] p-2.5 space-y-2 bg-black/20"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm text-white/85 leading-snug min-w-0">{d.address}</p>
                                  <span
                                    className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border"
                                    style={{
                                      color:       statusColor(d.status),
                                      borderColor: `${statusColor(d.status)}44`,
                                    }}
                                  >
                                    {fmtStatus(d.status)}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {DEST_STATUSES.map((st) => (
                                    <button
                                      key={st}
                                      type="button"
                                      disabled={destBusyId === d.destination_id}
                                      onClick={() => void handleDestStatus(d.destination_id, st)}
                                      className="text-[11px] font-semibold px-2 py-1 rounded-md border border-white/10 hover:bg-white/5 disabled:opacity-40"
                                      style={
                                        d.status === st
                                          ? { borderColor: 'var(--color-cyan)', color: 'var(--color-cyan)' }
                                          : undefined
                                      }
                                    >
                                      {fmtStatus(st)}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    disabled={destBusyId !== null || deleteBusy}
                                    onClick={() => setDeleteAskId(d.destination_id)}
                                    className="text-[11px] font-semibold px-2 py-1 rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 ml-auto inline-flex items-center gap-1"
                                  >
                                    <Trash2 size={12} />
                                    Remove
                                  </button>
                                </div>
                                {deleteAskId === d.destination_id && (
                                  <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-500/25 p-2 text-xs text-red-200/90">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <div className="flex-1 space-y-2">
                                      <p>Remove this stop from the booking? This cannot be undone.</p>
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          disabled={deleteBusy}
                                          onClick={() => void handleDeleteDest(d.destination_id)}
                                          className="px-2 py-1 rounded bg-red-600 text-white text-[11px] font-bold disabled:opacity-50"
                                        >
                                          {deleteBusy ? '…' : 'Confirm'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={deleteBusy}
                                          onClick={() => setDeleteAskId(null)}
                                          className="px-2 py-1 rounded border border-white/20 text-[11px]"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </li>
                            ))}
                        </ul>
                        {(detail.booking_destinations?.length ?? 0) === 0 && (
                          <p className="text-sm text-white/40">No stops on this booking.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {actionMsg && (
                  <div
                    className="shrink-0 mx-3 mb-3 px-3 py-2 rounded-lg text-xs font-medium border"
                    style={{
                      background: actionMsg.type === 'ok' ? 'rgba(58,246,38,0.1)' : 'rgba(246,38,38,0.1)',
                      borderColor:
                        actionMsg.type === 'ok' ? 'rgba(58,246,38,0.25)' : 'rgba(246,38,38,0.25)',
                      color: actionMsg.type === 'ok' ? '#86efac' : '#fca5a5',
                    }}
                  >
                    {actionMsg.text}
                  </div>
                )}
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
