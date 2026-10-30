'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  AlertTriangle, CalendarCheck, CheckCircle2, ClipboardCheck, Gauge,
  MapPin, PackageCheck, ShieldAlert, Truck, Wrench, ChevronRight, Clock, Ticket,
} from 'lucide-react'
import SupportTicketsPanel from './SupportTicketsPanel'
import AdminDashboard, { AdminDashboardSkeleton } from './AdminDashboard'
import { Skeleton } from '@/components/ui/Skeleton'

import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { getApiErrorMessage } from '@/lib/api-error'
import { formatDate } from '@/app/utils/timeFormat'
import {
  fetchStaffDashboard,
  type StaffDashboard as Data,
  type DashboardBooking,
  type DashboardVehicle,
} from '@/lib/services/admin/staff-dashboard.service'

/**
 * The staff dashboards.
 *
 * The Company Administrator gets analytics (the last two weeks, the status mix,
 * the busiest clients) on top of every desk's queue. The General Manager, the
 * Operations Manager and the Fleet Manager get shortcuts: what is waiting on
 * their desk right now, each card a link into the module where it is done, and
 * the first few items listed so the next one is a click away.
 */

export type StaffRole = 'admin' | 'general_manager' | 'operations_manager' | 'fleet_manager'

const BASE: Record<StaffRole, string> = {
  admin:              '/admin',
  general_manager:    '/general_manager',
  operations_manager: '/operations_admin',
  fleet_manager:      '/fleet_admin',
}

type Tone = 'cyan' | 'amber' | 'red' | 'green' | 'muted'
const TONE: Record<Tone, string> = {
  cyan:  'var(--color-cyan)',
  amber: '#ffea00',
  red:   '#f62626',
  green: '#3af626',
  muted: '#818181',
}

export interface CardSpec {
  label: string
  hint:  string
  count: number
  href:  string
  icon:  ReactNode
  /** Tone when there is something waiting; an empty queue always reads muted. */
  tone:  Tone
}

function bookingHref(base: string, b: DashboardBooking) {
  return `${base}/booking-management?booking=${encodeURIComponent(b.booking_id)}`
}

function cardsFor(role: StaffRole, d: Data): CardSpec[] {
  const base = BASE[role]
  const q    = d.queues
  const v    = d.vehicles
  const notReady = v.recheck_due.count + v.failed_inspection.count

  const gmCard: CardSpec = {
    label: 'Awaiting approval', hint: 'Approve or reject new bookings',
    count: q.gm_pending.count, href: `${base}/booking-management`, icon: <CalendarCheck size={16} />, tone: 'amber',
  }
  const opsCard: CardSpec = {
    label: 'Needs vehicle and driver', hint: 'Approved bookings to crew',
    count: q.ops_pending.count, href: `${base}/booking-management`, icon: <Truck size={16} />, tone: 'amber',
  }
  const issuesCard: CardSpec = {
    label: 'Client reported problems', hint: 'Resolve so the booking can complete',
    count: q.open_issues.count, href: `${base}/booking-management`, icon: <AlertTriangle size={16} />, tone: 'red',
  }
  const reportsCard: CardSpec = {
    label: 'Open driver reports', hint: 'Alerts and incident reports from the road',
    count: d.open_driver_reports, href: `${base}/reports`, icon: <ShieldAlert size={16} />, tone: 'red',
  }

  // Client support tickets from the help assistant. The Company Administrator
  // works them on the Tickets page; Operations from the panel on this page.
  const ticketsCard: CardSpec = {
    label: 'Client support tickets', hint: 'Reply by email, then mark resolved',
    count: d.support_tickets.count, href: role === 'admin' ? `${base}/support-tickets` : '#support-tickets',
    icon: <Ticket size={16} />, tone: 'amber',
  }

  switch (role) {
    case 'general_manager':
      return [
        gmCard,
        { ...opsCard, hint: 'Approved, with the Operations Manager', tone: 'muted' },
        { label: 'In transit', hint: 'On the road now', count: q.in_transit.count,
          href: `${base}/booking-management`, icon: <MapPin size={16} />, tone: 'cyan' },
        { label: 'Vehicles not cleared', hint: 'Waiting on a BLOWBAGETS inspection', count: notReady,
          href: `${base}/vehicle-management`, icon: <ClipboardCheck size={16} />, tone: 'muted' },
      ]
    case 'operations_manager':
      return [
        opsCard,
        { label: 'Dispatching today', hint: 'Crewed bookings leaving today', count: q.dispatch_today.count,
          href: `${base}/booking-management`, icon: <Clock size={16} />, tone: 'cyan' },
        { label: 'In transit', hint: 'Follow them on the map', count: q.in_transit.count,
          href: `${base}/transit-tracking`, icon: <MapPin size={16} />, tone: 'cyan' },
        issuesCard,
        ticketsCard,
        reportsCard,
      ]
    case 'fleet_manager':
      return [
        { label: 'Return odometer due', hint: 'Back from a delivery, reading owed', count: v.return_odometer_due.count,
          href: `${base}/vehicle-management`, icon: <Gauge size={16} />, tone: 'amber' },
        { label: 'BLOWBAGETS due', hint: 'Never inspected or back from a job', count: v.recheck_due.count,
          href: `${base}/vehicle-management`, icon: <ClipboardCheck size={16} />, tone: 'amber' },
        { label: 'Dispatching tomorrow', hint: 'Re-check these vehicles the day before', count: q.dispatch_tomorrow.count,
          href: `${base}/vehicle-management`, icon: <CalendarCheck size={16} />, tone: 'cyan' },
        { label: 'Failed or service overdue', hint: 'Blocked from assignment', count: v.failed_inspection.count + v.service_overdue.count,
          href: `${base}/vehicle-management?tab=upkeep`, icon: <Wrench size={16} />, tone: 'red' },
        { ...reportsCard, hint: 'Vehicle-related reports from drivers' },
      ]
    case 'admin':
      return [
        gmCard,
        opsCard,
        issuesCard,
        { label: 'Vehicles needing attention', hint: 'Odometer, inspection or service', count:
            v.return_odometer_due.count + notReady + v.service_overdue.count,
          href: `${base}/vehicle-management`, icon: <Truck size={16} />, tone: 'amber' },
        reportsCard,
        ticketsCard,
      ]
  }
}

export interface ListSpec {
  title: string
  empty: string
  bookings?: DashboardBooking[]
  vehicles?: DashboardVehicle[]
  total: number
}

function listsFor(role: StaffRole, d: Data): ListSpec[] {
  const q = d.queues
  const v = d.vehicles
  const vehicleList = (): DashboardVehicle[] => {
    const seen = new Set<string>()
    return [...v.return_odometer_due.items, ...v.failed_inspection.items, ...v.service_overdue.items,
            ...v.recheck_due.items, ...v.service_due_soon.items]
      .filter((x) => (seen.has(x.truck_id + x.reason) ? false : (seen.add(x.truck_id + x.reason), true)))
      .slice(0, 8)
  }
  const vehicleTotal = v.return_odometer_due.count + v.failed_inspection.count + v.service_overdue.count +
    v.recheck_due.count + v.service_due_soon.count

  switch (role) {
    case 'general_manager':
      return [
        { title: 'Waiting for your decision', empty: 'Nothing to approve.', bookings: q.gm_pending.items, total: q.gm_pending.count },
        { title: 'Dispatching today', empty: 'No dispatches today.', bookings: q.dispatch_today.items, total: q.dispatch_today.count },
      ]
    case 'operations_manager':
      return [
        { title: 'Choose a vehicle and driver', empty: 'Every approved booking is crewed.', bookings: q.ops_pending.items, total: q.ops_pending.count },
        { title: 'Client reported a problem', empty: 'No open problems.', bookings: q.open_issues.items, total: q.open_issues.count },
        { title: 'Dispatching today', empty: 'No dispatches today.', bookings: q.dispatch_today.items, total: q.dispatch_today.count },
      ]
    case 'fleet_manager':
      return [
        { title: 'Vehicles needing a look', empty: 'Every vehicle is ready.', vehicles: vehicleList(), total: vehicleTotal },
        { title: 'Dispatching tomorrow', empty: 'Nothing leaves tomorrow.', bookings: q.dispatch_tomorrow.items, total: q.dispatch_tomorrow.count },
        { title: 'Dispatching today', empty: 'No dispatches today.', bookings: q.dispatch_today.items, total: q.dispatch_today.count },
      ]
    case 'admin':
      // The Company Administrator's cards already open each queue's module.
      return []
  }
}

function ShortcutCard({ card, index }: { card: CardSpec; index: number }) {
  const active = card.count > 0
  const color  = active ? TONE[card.tone] : TONE.muted
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Link
        href={card.href}
        className="group flex h-full flex-col gap-2 rounded-xl border border-white/[0.08] bg-[var(--color-surface)] p-3.5 transition-colors hover:border-white/20"
      >
        <div className="flex items-center justify-between">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]" style={{ color }}>
            {card.icon}
          </span>
          <ChevronRight size={15} className="text-white/25 transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className="text-3xl font-bold tabular-nums leading-none text-white">{card.count}</p>
        <div>
          <p className="text-sm font-semibold text-white">{card.label}</p>
          <p className="text-[11px] leading-snug text-white/45">{card.hint}</p>
        </div>
      </Link>
    </motion.div>
  )
}

function ListPanel({ list, base }: { list: ListSpec; base: string }) {
  const rows = list.bookings ?? list.vehicles ?? []
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[var(--color-surface)]">
      <header className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
        <h2 className="text-sm font-bold text-white">{list.title}</h2>
        <span className="text-[11px] tabular-nums text-white/40">{list.total}</span>
      </header>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-3.5 py-6 text-xs text-white/40">
          <CheckCircle2 size={14} className="text-[var(--color-cyan)]" /> {list.empty}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {list.bookings?.map((b) => (
            <li key={b.booking_id}>
              <Link href={bookingHref(base, b)} className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-white/[0.03]">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-mono font-bold text-white/80">{b.reference_number ?? 'Booking'}</span>
                  <span className="block truncate text-[11px] text-white/45">
                    {[b.client, b.origin?.split(',')[0]].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-white/55">
                  {b.schedule_date ? formatDate(b.schedule_date) : '—'}
                  {b.call_time && <span className="block text-white/35">{b.call_time.slice(0, 5)}</span>}
                </span>
              </Link>
            </li>
          ))}
          {list.vehicles?.map((v) => (
            <li key={v.truck_id + v.reason}>
              <Link href={`${base}/vehicle-management`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-white/[0.03]">
                <span className="text-xs font-mono font-bold text-white/80">{v.plate_number}</span>
                <span className="text-[11px] text-amber-200/90">{v.reason}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** How many shortcut cards and lists each desk shows (cardsFor / listsFor). */
const SKELETON_COUNTS: Record<StaffRole, { cards: number; lists: number }> = {
  admin:              { cards: 6, lists: 0 },
  general_manager:    { cards: 4, lists: 2 },
  operations_manager: { cards: 6, lists: 3 },
  fleet_manager:      { cards: 5, lists: 3 },
}

function cardGrid(role: StaffRole) {
  return `grid grid-cols-2 gap-3 md:grid-cols-3 ${role === 'general_manager' ? 'xl:grid-cols-4' : 'xl:grid-cols-5'}`
}

const PANEL = 'rounded-xl border border-white/[0.08] bg-[var(--color-surface)]'

/** The dashboard's own layout in grey, shown until the first load lands. */
function StaffDashboardSkeleton({ role }: { role: StaffRole }) {
  const { cards, lists } = SKELETON_COUNTS[role]
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
      <div className={cardGrid(role)}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className={`${PANEL} flex flex-col gap-2 p-3.5`}>
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-[30px] w-12" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: lists }).map((_, i) => (
          <section key={i} className={PANEL}>
            <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-5" />
            </div>
            <div className="divide-y divide-white/[0.05]">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2.5 w-36" />
                  </div>
                  <Skeleton className="h-2.5 w-16" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export default function StaffDashboard({ role }: { role: StaffRole }) {
  const [data,    setData]    = useState<Data | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setData(await fetchStaffDashboard())
      setError(null)
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load the dashboard.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  // Every queue here is a projection of bookings, vehicles and reports, so a
  // change to any of them re-reads.
  useLiveTable(['live:bookings', 'live:trucks', 'live:driver_reports', 'live:support_tickets'], () => { void load() }, { debounceMs: 2_000 })

  const base = BASE[role]

  // The Company Administrator's dashboard follows Untitled UI's dashboard-04,
  // like the IT Administrator's, so it has its own shell and layout.
  if (role === 'admin') {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white px-4 py-5 lg:px-8 lg:py-6">
        <div className="flex w-full flex-col gap-5 lg:gap-6">
          {error && (
            <div className="rounded-xl border border-[#f62626]/30 bg-[#f62626]/10 px-4 py-2.5 text-sm text-[#f62626]">{error}</div>
          )}
          {!data
            ? loading && <AdminDashboardSkeleton cards={SKELETON_COUNTS.admin.cards} />
            : <AdminDashboard data={data} cards={cardsFor(role, data)} />}
          <div className="h-4" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-bg)] ff-sc">
      <div className="w-full space-y-5 px-4 py-4 lg:px-5">
        <header className="flex items-center justify-between gap-3">
          <h1 className="font-[family-name:var(--font-alegreya-sc)] text-[17px] 3xl:text-[20px] font-bold text-white">Dashboard</h1>
        </header>

        {error && !data && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        )}

        {!data ? (
          loading && <StaffDashboardSkeleton role={role} />
        ) : (
          <>
            <div className={cardGrid(role)}>
              {cardsFor(role, data).map((c, i) => <ShortcutCard key={c.label} card={c} index={i} />)}
            </div>

            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {listsFor(role, data).map((l) => <ListPanel key={l.title} list={l} base={base} />)}
            </div>

            {role === 'operations_manager' && (
              <SupportTicketsPanel
                count={data.support_tickets.count}
                items={data.support_tickets.items}
                inbox={data.support_tickets.inbox}
                onChanged={() => { void load() }}
              />
            )}

            <p className="flex items-center gap-2 text-xs text-white/45">
              <PackageCheck size={15} className="shrink-0" /> Updates live as bookings, vehicles and reports change.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
