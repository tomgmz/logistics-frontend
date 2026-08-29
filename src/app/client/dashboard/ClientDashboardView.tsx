'use client'

import { motion, Variants } from 'framer-motion'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard, RefreshCw, AlertCircle, Truck, Clock,
  CheckCircle2, MapPin, Package, Plus, ChevronRight, Bell,
  CalendarDays, CreditCard, XCircle, Inbox,
} from 'lucide-react'

import { bookingService } from '@/lib/services/client/booking.service'
import {
  clientBillingService,
  actionFor,
  statusExplanation,
  periodLabel,
  type BillingPeriod,
  type PeriodAction,
} from '@/lib/services/client/billing.service'
import { notificationService, type AppNotification } from '@/lib/services/notification.service'
import { useAuthStore } from '@/lib/store/auth.store'
import type { BookingWithRelations, BookingDestination } from '@/lib/store/slice/routeMap.slice'
import { type BookingStatus, asBookingStatus } from '@/app/types/maps/routemap.types'
import { bookingRef } from '@/lib/booking'
import { getApiErrorMessage } from '@/lib/api-error'

const BG_PAGE  = '#0a0a0a'
const BG_PANEL = '#2A2828'
const BG_CARD  = '#424242'
const BORDER   = 'rgba(255,255,255,0.07)'
const BORDER_C = 'rgba(255,255,255,0.12)'
const CYAN     = '#4DF9ED'
const MUTED    = '#818181'
const ERROR    = '#f87171'
const AMBER    = '#FBBF24'
const GREEN    = '#3af626'

/** Statuses that mean a shipment is live: accepted, and not yet finished. */
const ACTIVE_STATUSES: BookingStatus[] = ['APPROVED', 'ASSIGNED', 'IN_TRANSIT']

/** In-transit first — that is what a client opens the dashboard to look at. */
const ACTIVE_SORT: Record<string, number> = { IN_TRANSIT: 0, ASSIGNED: 1, APPROVED: 2 }

const STATUS_META: Record<BookingStatus, { label: string; color: string; icon: React.ReactNode }> = {
  BOOKED:     { label: 'Booked',     color: CYAN,  icon: <CheckCircle2 size={11} /> },
  PENDING:    { label: 'Pending',    color: AMBER, icon: <Clock        size={11} /> },
  APPROVED:   { label: 'Approved',   color: CYAN,  icon: <CheckCircle2 size={11} /> },
  ASSIGNED:   { label: 'Assigned',   color: CYAN,  icon: <Truck        size={11} /> },
  IN_TRANSIT: { label: 'In Transit', color: GREEN, icon: <Truck        size={11} /> },
  ARRIVED:    { label: 'Arrived',    color: GREEN, icon: <MapPin       size={11} /> },
  COMPLETED:  { label: 'Completed',  color: CYAN,  icon: <CheckCircle2 size={11} /> },
  CANCELLED:  { label: 'Cancelled',  color: ERROR, icon: <XCircle      size={11} /> },
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
  const assignments = booking.driver_assignments as Array<{
    drivers?: { users?: { first_name?: string; last_name?: string } }
  }> | undefined
  const u = assignments?.[0]?.drivers?.users
  if (!u) return null
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || null
}

function getPlateNumber(booking: BookingWithRelations): string | null {
  const assignments = booking.truck_assignments as Array<{
    trucks?: { plate_number?: string }
  }> | undefined
  return assignments?.[0]?.trucks?.plate_number ?? null
}

/**
 * How far along a shipment is, as stops the driver has actually confirmed.
 *
 * There is no live vehicle position anywhere in the system, so this is the only
 * honest progress signal we have — and it is a real one, written when the driver
 * confirms a stop with a proof photo.
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

function formatDayShort(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** Today in the Philippines as YYYY-MM-DD — schedule_date is a PH calendar day. */
function phToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

const ACTION_LABEL: Record<Exclude<PeriodAction, 'none'>, string> = {
  submit:   'File reverse billing',
  resubmit: 'Correct & resubmit',
  review:   'Review summary',
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35 } },
}
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
}

// ── presentational ─────────────────────────────────────────────────────────

function SectionHeader({ icon, title, action }: {
  icon: React.ReactNode; title: string; action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white">{icon}</span>
      <h3 className="ff-sc text-white font-bold tracking-wide text-sm">{title}</h3>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status)
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm shrink-0"
      style={{ color: m.color, background: `${m.color}18`, border: `1px solid ${m.color}40` }}
    >
      {m.icon}{m.label}
    </span>
  )
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={fadeUp}
      className={`rounded-xl border p-4 flex flex-col gap-3 ${className}`}
      style={{ background: BG_PANEL, borderColor: BORDER }}
    >
      {children}
    </motion.div>
  )
}

function KpiTile({ label, value, sub, color }: {
  label: string; value: number; sub: string; color: string
}) {
  return (
    <motion.div
      variants={fadeUp}
      className="rounded-xl border p-3 flex flex-col gap-1"
      style={{ background: BG_PANEL, borderColor: BORDER }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: MUTED }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      <p className="text-[10px]" style={{ color: MUTED }}>{sub}</p>
    </motion.div>
  )
}

/** Stops confirmed out of total, as a bar. */
function StopProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: BG_CARD }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: done === total && total > 0 ? GREEN : CYAN }}
        />
      </div>
      <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: MUTED }}>
        {done}/{total} stops
      </span>
    </div>
  )
}

function EmptyPanel({ icon, message, cta }: {
  icon: React.ReactNode; message: string; cta?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span style={{ color: MUTED }}>{icon}</span>
      <p className="text-xs" style={{ color: MUTED }}>{message}</p>
      {cta}
    </div>
  )
}

function SkeletonPanel({ height = 'h-44' }: { height?: string }) {
  return (
    <div
      className={`rounded-xl border ${height} animate-pulse`}
      style={{ background: BG_PANEL, borderColor: BORDER }}
    />
  )
}

// ── rows ───────────────────────────────────────────────────────────────────

function ActiveShipmentRow({ booking }: { booking: BookingWithRelations }) {
  const stops    = destinationsOf(booking)
  const progress = stopProgress(booking)
  const driver   = getDriverName(booking)
  const plate    = getPlateNumber(booking)
  const inTransit = asBookingStatus(booking.status) === 'IN_TRANSIT'

  return (
    <div
      className="rounded-lg border p-3 flex flex-col gap-2"
      style={{ background: BG_PAGE, borderColor: BORDER }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={`/client/history?booking=${booking.booking_id}`}
          className="text-sm font-bold text-white hover:opacity-80 transition-opacity"
        >
          {bookingRef(booking)}
        </Link>
        <StatusBadge status={booking.status} />
        <span className="ml-auto text-[11px]" style={{ color: MUTED }}>
          {formatDate(booking.schedule_date)}
          {typeof booking.call_time === 'string' ? ` · ${booking.call_time}` : ''}
        </span>
      </div>

      <div className="flex items-start gap-1.5 text-[11px]" style={{ color: MUTED }}>
        <MapPin size={12} className="mt-0.5 shrink-0" style={{ color: CYAN }} />
        <span className="truncate">
          {(booking.origin as string | undefined) ?? '—'}
          <span style={{ color: BORDER_C }}> → </span>
          {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
        </span>
      </div>

      <StopProgressBar done={progress.done} total={progress.total} />

      <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: MUTED }}>
        {driver ? (
          <span className="flex items-center gap-1"><Truck size={11} /> {driver}{plate ? ` · ${plate}` : ''}</span>
        ) : (
          <span className="italic">Driver not assigned yet</span>
        )}
        {inTransit && (
          <Link
            href="/client/tracking"
            className="ml-auto flex items-center gap-0.5 font-bold hover:opacity-80 transition-opacity"
            style={{ color: CYAN }}
          >
            Track <ChevronRight size={11} />
          </Link>
        )}
      </div>
    </div>
  )
}

function AttentionRow({ period }: { period: BillingPeriod }) {
  const action   = actionFor(period)
  const deadline = action === 'review' ? period.review_due_on : period.submission_end

  return (
    <div className="rounded-lg border p-3 flex flex-col gap-2" style={{ background: BG_PAGE, borderColor: BORDER }}>
      <div className="flex items-center gap-2">
        <CreditCard size={13} style={{ color: AMBER }} />
        <span className="text-sm font-bold text-white">{periodLabel(period)}</span>
        <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
          {period.mode}
        </span>
      </div>
      {deadline && (
        <span className="text-[11px] font-bold" style={{ color: AMBER }}>
          Due {formatDate(deadline)}
        </span>
      )}
      <p className="text-[11px] leading-snug" style={{ color: MUTED }}>
        {statusExplanation(period)}
      </p>
      <Link
        href="/client/reverse-billing"
        className="flex items-center gap-0.5 text-[11px] font-bold hover:opacity-80 transition-opacity w-fit"
        style={{ color: CYAN }}
      >
        {action !== 'none' ? ACTION_LABEL[action] : 'View details'} <ChevronRight size={11} />
      </Link>
    </div>
  )
}

function RejectedRow({ booking }: { booking: BookingWithRelations }) {
  const reason = booking.rejection_reason as string | undefined
  return (
    <div className="rounded-lg border p-3 flex flex-col gap-1.5" style={{ background: BG_PAGE, borderColor: `${ERROR}40` }}>
      <div className="flex items-center gap-2">
        <XCircle size={13} style={{ color: ERROR }} />
        <Link
          href={`/client/history?booking=${booking.booking_id}`}
          className="text-sm font-bold text-white hover:opacity-80 transition-opacity"
        >
          {bookingRef(booking)}
        </Link>
        <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: ERROR }}>
          Cancelled
        </span>
      </div>
      <p className="text-[11px] leading-snug" style={{ color: MUTED }}>
        {reason ? `Reason: ${reason}` : 'This booking was turned down.'}
      </p>
    </div>
  )
}

// ── view ───────────────────────────────────────────────────────────────────

export default function ClientDashboardView() {
  const clientId = useAuthStore((s) => s.user?.clients?.client_id)
  const company  = useAuthStore((s) => s.user?.clients?.company_name)

  const [bookings, setBookings] = useState<BookingWithRelations[]>([])
  const [periods,  setPeriods]  = useState<BillingPeriod[]>([])
  const [notes,    setNotes]    = useState<AppNotification[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const [bookingRows, periodRows, noteRows] = await Promise.all([
        bookingService.fetchBookingsByClient(clientId),
        clientBillingService.listPeriods({ limit: 60 }),
        notificationService.list({ limit: 6 }),
      ])
      setBookings(bookingRows)
      setPeriods(periodRows ?? [])
      setNotes(noteRows ?? [])
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { void load() }, [load])

  // Every figure below is derived from the two lists already fetched — the
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

  const actionablePeriods = useMemo(
    () => periods.filter((p) => actionFor(p) !== 'none'),
    [periods],
  )

  const upcoming = useMemo(() => {
    const today = phToday()
    return bookings
      .filter((b) => {
        const s = asBookingStatus(b.status)
        return (s === 'PENDING' || s === 'APPROVED' || s === 'ASSIGNED') &&
               String(b.schedule_date ?? '') >= today
      })
      .sort((a, b) => String(a.schedule_date ?? '').localeCompare(String(b.schedule_date ?? '')))
      .slice(0, 5)
  }, [bookings])

  // Turned-down bookings belong next to the billing deadlines: both are things
  // the client has to act on, and a rejection is easy to miss otherwise.
  const rejected = useMemo(() => (
    bookings
      .filter((b) => asBookingStatus(b.status) === 'CANCELLED')
      .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
      .slice(0, 2)
  ), [bookings])

  const attentionCount = actionablePeriods.length + rejected.length

  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: BG_PAGE }}>
        <AlertCircle size={32} style={{ color: ERROR }} />
        <p className="text-sm" style={{ color: ERROR }}>
          Your account is not linked to a client company.
        </p>
        <p className="text-xs" style={{ color: MUTED }}>Please log out and sign in again.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG_PAGE, color: '#fff' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 lg:px-6 py-4 border-b shrink-0" style={{ borderColor: BORDER }}>
        <LayoutDashboard size={18} style={{ color: CYAN }} />
        <div className="min-w-0">
          <h1 className="font-bold text-white text-base tracking-wide truncate">
            {company ? `Welcome back, ${company}` : 'Dashboard'}
          </h1>
          <p className="text-[11px]" style={{ color: MUTED }}>
            {new Date().toLocaleDateString('en-PH', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </p>
        </div>

        {!loading && (
          <button onClick={load} title="Refresh"
            className="flex items-center justify-center w-7 h-7 rounded-lg border transition-colors
                       hover:border-white/30 hover:text-white cursor-pointer shrink-0"
            style={{ borderColor: BORDER_C, color: MUTED }}>
            <RefreshCw size={13} />
          </button>
        )}

        <Link
          href="/client/booking"
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold
                     uppercase tracking-wider transition-opacity hover:opacity-85 shrink-0"
          style={{ background: CYAN, color: '#000' }}
        >
          <Plus size={14} /> <span className="hidden sm:inline">New Booking</span>
        </Link>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 lg:p-6 flex flex-col gap-3 sm:gap-4">

        {loading && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => <SkeletonPanel key={i} height="h-[76px]" />)}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="xl:col-span-2"><SkeletonPanel height="h-80" /></div>
              <div className="flex flex-col gap-3">
                <SkeletonPanel />
                <SkeletonPanel />
              </div>
            </div>
          </>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-16">
            <AlertCircle size={32} style={{ color: ERROR }} />
            <p className="text-sm" style={{ color: ERROR }}>{error}</p>
            <button onClick={load}
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider
                         transition-opacity hover:opacity-70 cursor-pointer"
              style={{ color: CYAN }}>
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-3 sm:gap-4">

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <KpiTile label="Active Shipments" value={active.length}
                sub="approved, assigned or moving" color="#fff" />
              <KpiTile label="Awaiting Approval" value={pending.length}
                sub="with 8338" color={AMBER} />
              <KpiTile label="Completed This Month" value={completedThisMonth}
                sub="deliveries finished" color={GREEN} />
              <KpiTile label="Needs Your Attention" value={attentionCount}
                sub="billing and rejections" color={CYAN} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

              {/* Active shipments */}
              <Panel className="xl:col-span-2">
                <SectionHeader
                  icon={<Truck size={16} />}
                  title="Active Shipments"
                  action={
                    <Link href="/client/history"
                      className="flex items-center gap-0.5 text-[11px] font-bold hover:opacity-80 transition-opacity"
                      style={{ color: CYAN }}>
                      View all <ChevronRight size={11} />
                    </Link>
                  }
                />
                {active.length === 0 ? (
                  <EmptyPanel
                    icon={<Package size={26} />}
                    message="No active shipments right now."
                    cta={
                      <Link href="/client/booking"
                        className="text-[11px] font-bold underline underline-offset-2 hover:opacity-80"
                        style={{ color: CYAN }}>
                        Book a delivery
                      </Link>
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {active.slice(0, 6).map((b) => (
                      <ActiveShipmentRow key={b.booking_id} booking={b} />
                    ))}
                  </div>
                )}
              </Panel>

              {/* Right column */}
              <div className="flex flex-col gap-3">

                <Panel>
                  <SectionHeader icon={<AlertCircle size={16} />} title="Needs Your Attention" />
                  {attentionCount === 0 ? (
                    <EmptyPanel icon={<CheckCircle2 size={26} />} message="Nothing needs you right now." />
                  ) : (
                    <div className="flex flex-col gap-2">
                      {actionablePeriods.map((p) => <AttentionRow key={p.period_id} period={p} />)}
                      {rejected.map((b) => <RejectedRow key={b.booking_id} booking={b} />)}
                    </div>
                  )}
                </Panel>

                <Panel>
                  <SectionHeader icon={<CalendarDays size={16} />} title="Upcoming Pickups" />
                  {upcoming.length === 0 ? (
                    <EmptyPanel icon={<CalendarDays size={26} />} message="No pickups scheduled." />
                  ) : (
                    <div className="flex flex-col gap-2">
                      {upcoming.map((b) => (
                        <Link
                          key={b.booking_id}
                          href={`/client/history?booking=${b.booking_id}`}
                          className="flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors hover:border-white/20"
                          style={{ background: BG_PAGE, borderColor: BORDER }}
                        >
                          <div className="flex flex-col items-center justify-center w-11 shrink-0">
                            <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
                              {formatDayShort(b.schedule_date).split(' ')[0]}
                            </span>
                            <span className="text-base font-bold leading-none" style={{ color: CYAN }}>
                              {formatDayShort(b.schedule_date).split(' ')[1]}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">{bookingRef(b)}</p>
                            <p className="text-[11px] truncate" style={{ color: MUTED }}>
                              {(b.origin as string | undefined) ?? '—'}
                            </p>
                          </div>
                          <span className="text-[10px] uppercase tracking-wider shrink-0" style={{ color: MUTED }}>
                            {(b.truck_type_needed as string | undefined) ?? ''}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </Panel>

              </div>
            </div>

            {/* Recent activity */}
            <Panel>
              <SectionHeader icon={<Bell size={16} />} title="Recent Activity" />
              {notes.length === 0 ? (
                <EmptyPanel icon={<Inbox size={26} />} message="No activity yet." />
              ) : (
                <div className="flex flex-col">
                  {notes.map((n, i) => {
                    const href = typeof n.data?.action_url === 'string' ? n.data.action_url : null
                    const body = (
                      <div
                        className="flex items-start gap-2.5 py-2.5"
                        style={i > 0 ? { borderTop: `1px solid ${BORDER}` } : undefined}
                      >
                        <span
                          className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: n.read_at ? BG_CARD : CYAN }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{n.title}</p>
                          <p className="text-[11px] leading-snug" style={{ color: MUTED }}>{n.body}</p>
                        </div>
                        <span className="text-[10px] shrink-0" style={{ color: MUTED }}>
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                    )
                    return href
                      ? <Link key={n.notification_id} href={href} className="hover:opacity-80 transition-opacity">{body}</Link>
                      : <div key={n.notification_id}>{body}</div>
                  })}
                </div>
              )}
            </Panel>

          </motion.div>
        )}
      </div>
    </div>
  )
}
