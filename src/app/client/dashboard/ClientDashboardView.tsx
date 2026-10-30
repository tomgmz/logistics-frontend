'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  AlertCircle, Truck, Clock, CheckCircle2, MapPin, Plus, ChevronRight, XCircle,
} from 'lucide-react'

import { bookingService } from '@/lib/services/client/booking.service'
import { useAuthStore } from '@/lib/store/auth.store'
import type { BookingWithRelations, BookingDestination } from '@/lib/store/slice/routeMap.slice'
import { type BookingStatus, asBookingStatus } from '@/app/types/maps/routemap.types'
import { bookingRef } from '@/lib/booking'
import { bookingStatusColor } from '@/lib/palette'
import { isAwaitingResubmit } from '@/lib/booking-resubmit'
import RejectionPanel from '@/components/transactions/RejectionPanel'
import { getApiErrorMessage } from '@/lib/api-error'
import { RouteStepper, countSteps } from '@/components/map/RouteStepper'
import { TableCard } from '@/components/ui/untitled/table-card'
import { Skeleton } from '@/components/ui/Skeleton'
import { CardLink, MetricRow, MetricRowSkeleton } from '@/components/dashboard/AdminDashboard'
import type { CardSpec } from '@/components/dashboard/StaffDashboard'

/**
 * The client's dashboard, in the same Untitled UI dashboard-04 format as the
 * Company Administrator's: the metric row, then Active shipments as a table
 * card, then Needs your attention under it.
 */

const CYAN  = '#4DF9ED'
const MUTED = '#818181'
const ERROR = '#f62626'

/** Four metric cards across from lg up. */
const METRIC_COLS = 'md:grid-cols-2 lg:grid-cols-4'

/** Rows shown in each card; the rest are in Transaction History. */
const MAX_ROWS = 5

/** Statuses that mean a shipment is live: accepted, and not yet finished. */
const ACTIVE_STATUSES: BookingStatus[] = ['APPROVED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED']

// Delivered first: it is the one waiting on the client's confirmation.
const ACTIVE_SORT: Record<string, number> = { DELIVERED: -1, IN_TRANSIT: 0, ASSIGNED: 1, APPROVED: 2 }

const STATUS_META: Record<BookingStatus, { label: string; color: string; icon: React.ReactNode }> = {
  BOOKED:     { label: 'Booked',     color: bookingStatusColor('BOOKED'),  icon: <CheckCircle2 size={11} /> },
  PENDING:    { label: 'Pending',    color: bookingStatusColor('PENDING'), icon: <Clock        size={11} /> },
  APPROVED:   { label: 'Approved',   color: bookingStatusColor('APPROVED'),  icon: <CheckCircle2 size={11} /> },
  ASSIGNED:   { label: 'Assigned',   color: bookingStatusColor('ASSIGNED'),  icon: <Truck        size={11} /> },
  IN_TRANSIT: { label: 'In Transit', color: bookingStatusColor('IN_TRANSIT'), icon: <Truck        size={11} /> },
  ARRIVED:    { label: 'Arrived',    color: bookingStatusColor('ARRIVED'), icon: <MapPin       size={11} /> },
  DELIVERED:  { label: 'Delivered — Please Confirm', color: bookingStatusColor('DELIVERED'), icon: <CheckCircle2 size={11} /> },
  COMPLETED:  { label: 'Completed',  color: bookingStatusColor('COMPLETED'),  icon: <CheckCircle2 size={11} /> },
  CANCELLED:  { label: 'Cancelled',  color: bookingStatusColor('CANCELLED'), icon: <XCircle      size={11} /> },
}

const UNKNOWN_META = { label: 'Unknown', color: MUTED, icon: <AlertCircle size={11} /> }

function statusMeta(status: string) {
  const normalized = asBookingStatus(status)
  return normalized !== 'UNKNOWN' ? STATUS_META[normalized] : UNKNOWN_META
}

// ── helpers ────────────────────────────────────────────────────────────────
// Same shapes BookingHistoryModule reads. BookingWithRelations carries an index
// signature, so the nested relations have to be narrowed on the way out.

function destinationsOf(booking: BookingWithRelations): BookingDestination[] {
  const destinations = booking.booking_destinations as BookingDestination[] | undefined
  return (destinations ?? []).slice().sort((a, b) => {
    const ao = (a.sequence_order as number | undefined) ?? 0
    const bo = (b.sequence_order as number | undefined) ?? 0
    return ao - bo
  })
}

function getDriverName(booking: BookingWithRelations): string | null {
  // Main driver first, then the optional second driver ("Juan Cruz & Pedro Reyes").
  const assignments = (booking.driver_assignments as Array<{
    crew_role?: 'lead' | 'second'
    drivers?: { users?: { first_name?: string; last_name?: string } }
  }> | undefined) ?? []
  const names = [...assignments]
    .sort((a, b) => (a.crew_role === 'second' ? 1 : 0) - (b.crew_role === 'second' ? 1 : 0))
    .map((a) => `${a.drivers?.users?.first_name ?? ''} ${a.drivers?.users?.last_name ?? ''}`.trim())
    .filter(Boolean)
  return names.length ? names.join(' & ') : null
}

function getPlateNumber(booking: BookingWithRelations): string | null {
  const assignments = booking.truck_assignments as Array<{
    trucks?: { plate_number?: string }
  }> | undefined
  return assignments?.[0]?.trucks?.plate_number ?? null
}

/**
 * How far along a shipment is, as stops the driver has actually confirmed —
 * written when the driver confirms a stop with a proof photo.
 */
function stopProgress(booking: BookingWithRelations): { done: number; total: number } {
  const stops = destinationsOf(booking)
  const done  = stops.filter((d) => (d.status as string | undefined) === 'delivered').length
  return { done, total: stops.length }
}

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Today in the Philippines as YYYY-MM-DD — schedule_date is a PH calendar day. */
function phToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

// ── presentational ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status)
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm whitespace-nowrap"
      style={{ color: m.color, background: `${m.color}1f`, border: `1px solid ${m.color}` }}
    >
      {m.icon}{m.label}
    </span>
  )
}

/** CardLink's shape in cyan with a plus, for starting a booking. */
function NewBookingLink() {
  return (
    <Link
      href="/client/booking"
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition [@media(hover:hover)]:hover:opacity-85"
      style={{ background: `${CYAN}1f`, color: CYAN, boxShadow: `inset 0 0 0 1px ${CYAN}` }}
    >
      <Plus size={14} /> New booking
    </Link>
  )
}

// ── active shipments ───────────────────────────────────────────────────────

const HEAD = ['Booking', 'Status', 'Schedule', 'Route', 'Progress', 'Driver', '']

function ActiveShipmentRow({ booking }: { booking: BookingWithRelations }) {
  const stops     = destinationsOf(booking)
  const progress  = stopProgress(booking)
  const driver    = getDriverName(booking)
  const plate     = getPlateNumber(booking)
  const inTransit = asBookingStatus(booking.status) === 'IN_TRANSIT'

  return (
    <tr>
      <td className="whitespace-nowrap">
        <Link
          href={`/client/history?booking=${booking.booking_id}`}
          className="text-white transition-opacity [@media(hover:hover)]:hover:opacity-80"
        >
          {bookingRef(booking)}
        </Link>
      </td>
      <td><StatusBadge status={booking.status} /></td>
      <td className="whitespace-nowrap">
        {formatDate(booking.schedule_date)}
        {typeof booking.call_time === 'string' && <span style={{ color: MUTED }}> · {booking.call_time}</span>}
      </td>
      <td className="max-w-[260px]">
        <span className="flex items-center gap-1.5">
          <MapPin size={13} className="shrink-0" style={{ color: CYAN }} />
          <span className="truncate">{(booking.origin as string | undefined) ?? '—'}</span>
          <span className="shrink-0" style={{ color: MUTED }}>→ {stops.length} {stops.length === 1 ? 'stop' : 'stops'}</span>
        </span>
      </td>
      <td className="min-w-[180px]">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><RouteStepper steps={countSteps(progress.done, progress.total)} compact /></div>
          <span className="shrink-0 font-mono text-xs">{progress.done}/{progress.total}</span>
        </div>
      </td>
      <td className="whitespace-nowrap">
        {driver
          ? <>{driver}{plate && <span style={{ color: MUTED }}> · {plate}</span>}</>
          : <span className="italic" style={{ color: MUTED }}>Not assigned yet</span>}
      </td>
      <td className="whitespace-nowrap text-right">
        {inTransit && (
          <Link
            href="/client/tracking"
            className="inline-flex items-center gap-0.5 transition-opacity [@media(hover:hover)]:hover:opacity-80"
            style={{ color: CYAN }}
          >
            Track <ChevronRight size={13} />
          </Link>
        )}
      </td>
    </tr>
  )
}

function ActiveShipmentsCard({ active }: { active: BookingWithRelations[] }) {
  return (
    <TableCard.Root untitled>
      <TableCard.Header
        title="Active shipments"
        contentTrailing={
          <div className="flex flex-wrap items-center gap-2">
            <NewBookingLink />
            <CardLink href="/client/history">View all</CardLink>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="data-table min-w-[980px]">
          <thead>
            <tr>{HEAD.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody className="ff-regular text-sm text-white">
            {active.length === 0 ? (
              <tr>
                <td colSpan={HEAD.length} style={{ color: MUTED }}>
                  No active shipments right now.{' '}
                  <Link href="/client/booking" className="underline underline-offset-2" style={{ color: CYAN }}>Book a delivery</Link>
                </td>
              </tr>
            ) : active.slice(0, MAX_ROWS).map((b) => <ActiveShipmentRow key={b.booking_id} booking={b} />)}
          </tbody>
        </table>
      </div>
    </TableCard.Root>
  )
}

// ── needs your attention ───────────────────────────────────────────────────

function AttentionCard({ rejected, onUpdated }: {
  rejected:  BookingWithRelations[]
  onUpdated: (next: BookingWithRelations) => void
}) {
  return (
    <TableCard.Root untitled id="needs-attention" className="scroll-mt-4">
      <TableCard.Header title="Needs your attention" />
      {rejected.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm md:px-6" style={{ color: MUTED }}>
          <CheckCircle2 size={16} /> Nothing needs you right now.
        </p>
      ) : (
        <ul className="ff-regular divide-y divide-[#424242]">
          {rejected.slice(0, MAX_ROWS).map((b) => {
            const reason = b.rejection_reason as string | undefined
            return (
              <li key={b.booking_id} className="flex flex-col gap-2 px-4 py-4 md:px-6">
                <div className="flex items-center gap-2">
                  <XCircle size={15} style={{ color: ERROR }} />
                  <Link
                    href={`/client/history?booking=${b.booking_id}`}
                    className="text-sm font-semibold text-white transition-opacity [@media(hover:hover)]:hover:opacity-80"
                  >
                    {bookingRef(b)}
                  </Link>
                  <span className="ml-auto text-xs font-semibold uppercase tracking-wider" style={{ color: ERROR }}>Rejected</span>
                </div>
                <p className="text-sm leading-snug" style={{ color: MUTED }}>
                  {reason ? `Reason: ${reason}` : 'This booking was turned down.'}
                </p>
                <RejectionPanel booking={b} onUpdated={onUpdated} compact />
              </li>
            )
          })}
        </ul>
      )}
    </TableCard.Root>
  )
}

/** The page's own layout in grey, shown until the first load lands. */
function ClientDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5 lg:gap-6" aria-busy="true" aria-label="Loading dashboard">
      <MetricRowSkeleton cards={4} cols={METRIC_COLS} />
      <TableCard.Root untitled>
        <div className="flex items-center justify-between gap-4 border-b border-[#424242] px-4 py-5 md:px-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-48 rounded-lg" />
        </div>
        <div className="divide-y divide-[#2a2a2a]">
          {Array.from({ length: 4 }).map((_, j) => (
            <div key={j} className="flex items-center gap-6 px-4 py-4 md:px-6">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="hidden h-3.5 w-28 sm:block" />
            </div>
          ))}
        </div>
      </TableCard.Root>
      <TableCard.Root untitled>
        <div className="border-b border-[#424242] px-4 py-5 md:px-6"><Skeleton className="h-5 w-44" /></div>
        <div className="px-4 py-6 md:px-6"><Skeleton className="h-3.5 w-56" /></div>
      </TableCard.Root>
    </div>
  )
}

// ── view ───────────────────────────────────────────────────────────────────

export default function ClientDashboardView() {
  const clientId = useAuthStore((s) => s.user?.clients?.client_id)

  const [bookings, setBookings] = useState<BookingWithRelations[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      setBookings(await bookingService.fetchBookingsByClient(clientId))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { void load() }, [load])

  // Every figure below is derived from the one list already fetched — the
  // dashboard adds no endpoint of its own.
  const active = useMemo(() => (
    bookings
      .filter((b) => ACTIVE_STATUSES.includes(asBookingStatus(b.status) as BookingStatus))
      .sort((a, b) => {
        const byStatus = (ACTIVE_SORT[asBookingStatus(a.status)] ?? 9)
                       - (ACTIVE_SORT[asBookingStatus(b.status)] ?? 9)
        if (byStatus !== 0) return byStatus
        return String(a.schedule_date ?? '').localeCompare(String(b.schedule_date ?? ''))
      })
  ), [bookings])

  const pending = useMemo(
    () => bookings.filter((b) => asBookingStatus(b.status) === 'PENDING'),
    [bookings],
  )

  const completedThisMonth = useMemo(() => {
    const prefix = phToday().slice(0, 7)   // YYYY-MM
    return bookings.filter((b) =>
      asBookingStatus(b.status) === 'COMPLETED' &&
      String(b.schedule_date ?? '').startsWith(prefix),
    ).length
  }, [bookings])

  // A rejection is easy to miss otherwise: it is the one thing on this screen
  // the client has to act on rather than just watch. It leaves the list once
  // the client resubmits it or cancels it.
  const rejected = useMemo(() => (
    bookings
      .filter(isAwaitingResubmit)
      .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
  ), [bookings])

  const cards: CardSpec[] = [
    { label: 'Active shipments',     hint: 'Approved, assigned or moving', count: active.length,      href: '/client/history',  icon: <Truck size={20} />,        tone: 'cyan' },
    { label: 'Awaiting approval',    hint: 'With 8338',                    count: pending.length,     href: '/client/history',  icon: <Clock size={20} />,        tone: 'amber' },
    { label: 'Completed this month', hint: 'Deliveries finished',          count: completedThisMonth, href: '/client/history',  icon: <CheckCircle2 size={20} />, tone: 'green' },
    { label: 'Needs your attention', hint: 'Rejected bookings',            count: rejected.length,    href: '#needs-attention', icon: <AlertCircle size={20} />,  tone: 'red' },
  ]

  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 bg-[#0a0a0a]">
        <AlertCircle size={32} style={{ color: ERROR }} />
        <p className="text-sm" style={{ color: ERROR }}>
          Your account is not linked to a client company.
        </p>
        <p className="text-xs" style={{ color: MUTED }}>Please log out and sign in again.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white px-4 py-5 lg:px-8 lg:py-6">
      <div className="flex w-full flex-col gap-5 lg:gap-6">
        {loading && <ClientDashboardSkeleton />}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-16">
            <AlertCircle size={32} style={{ color: ERROR }} />
            <p className="text-sm" style={{ color: ERROR }}>{error}</p>
            <button
              onClick={load}
              className="text-sm font-semibold transition-opacity [@media(hover:hover)]:hover:opacity-70 cursor-pointer"
              style={{ color: CYAN }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <MetricRow cards={cards} cols={METRIC_COLS} />
            <ActiveShipmentsCard active={active} />
            <AttentionCard
              rejected={rejected}
              onUpdated={(next) => setBookings((prev) => prev.map((x) => (x.booking_id === next.booking_id ? next : x)))}
            />
          </>
        )}
        <div className="h-4" />
      </div>
    </div>
  )
}
