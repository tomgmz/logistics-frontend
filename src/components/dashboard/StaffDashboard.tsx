'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, CalendarCheck, CheckCircle2, ClipboardCheck, Gauge,
  MapPin, ShieldAlert, Truck, Wrench, Clock, Ticket,
} from 'lucide-react'
import AdminDashboard, { AdminDashboardSkeleton, CardLink, MetricRow, MetricRowSkeleton } from './AdminDashboard'
import { TableCard } from '@/components/ui/untitled/table-card'
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

/** A card's colour when its queue has something in it (MetricRow's TONE). */
type Tone = 'cyan' | 'amber' | 'red' | 'green' | 'muted'

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
    label: 'Needs vehicle and driver', hint: 'Approved bookings to assign',
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

  // Client support tickets from the help assistant, worked on the Tickets page
  // (the Company Administrator's and the Operations Manager's).
  const ticketsCard: CardSpec = {
    label: 'Client support tickets', hint: 'Reply by email, then mark resolved',
    count: d.support_tickets.count, href: `${base}/support-tickets`,
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
        { label: 'Dispatching today', hint: 'Assigned bookings leaving today', count: q.dispatch_today.count,
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
      .slice(0, 5)
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
        { title: 'Choose a vehicle and driver', empty: 'Every approved booking has a vehicle and driver.', bookings: q.ops_pending.items, total: q.ops_pending.count },
        { title: 'Client reported a problem', empty: 'No open problems.', bookings: q.open_issues.items, total: q.open_issues.count },
        // Running 15+ min past the planned arrival (an older backend sends no queue).
        { title: 'Delayed deliveries', empty: 'Every delivery on the road is on time.', bookings: q.delayed?.items ?? [], total: q.delayed?.count ?? 0 },
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

/** How many shortcut cards and lists each desk shows (cardsFor / listsFor). */
const SKELETON_COUNTS: Record<StaffRole, { cards: number; lists: number }> = {
  admin:              { cards: 6, lists: 0 },
  general_manager:    { cards: 4, lists: 2 },
  operations_manager: { cards: 6, lists: 3 },
  fleet_manager:      { cards: 5, lists: 3 },
}

// ── General Manager, Operations Manager, Fleet Manager: dashboard-04 format ──

type DeskRole = Exclude<StaffRole, 'admin'>

/** General Manager: 4 cards across. Operations and Fleet Manager: 3 per row. */
const DESK_METRIC_COLS: Record<DeskRole, string> = {
  general_manager:    'md:grid-cols-2 lg:grid-cols-4',
  operations_manager: 'md:grid-cols-3',
  fleet_manager:      'md:grid-cols-3',
}
const DESK_HEAD = ['Booking', 'Client', 'Pickup', 'Schedule', 'Call time']
/** Rows per table card; the rest are in Booking Management. */
const DESK_ROWS = 5
/** Two table cards across; an odd last one takes the full width. */
const DESK_LISTS = 'grid grid-cols-1 gap-5 lg:gap-6 xl:grid-cols-2 xl:[&>*:last-child:nth-child(odd)]:col-span-2'

/** One of a desk's queues as a table card: bookings, or the Fleet Manager's vehicles. */
function ListCard({ list, base }: { list: ListSpec; base: string }) {
  if (list.vehicles) return <VehicleListCard list={list} base={base} />
  const rows = (list.bookings ?? []).slice(0, DESK_ROWS)
  return (
    <TableCard.Root untitled className="flex flex-col">
      <TableCard.Header title={list.title} contentTrailing={<CardLink href={`${base}/booking-management`}>Booking Management</CardLink>} />
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-[#818181] md:px-6">
          <CheckCircle2 size={16} /> {list.empty}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[560px]">
            <thead>
              <tr>{DESK_HEAD.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody className="ff-regular text-sm text-white">
              {rows.map((b) => (
                <tr key={b.booking_id}>
                  <td className="whitespace-nowrap">
                    <Link href={bookingHref(base, b)} className="transition-opacity [@media(hover:hover)]:hover:opacity-80">
                      {b.reference_number ?? 'Booking'}
                    </Link>
                  </td>
                  <td className="max-w-[180px] truncate">{b.client ?? '—'}</td>
                  <td className="max-w-[180px] truncate">{b.origin?.split(',')[0] ?? '—'}</td>
                  <td className="whitespace-nowrap">{b.schedule_date ? formatDate(b.schedule_date) : '—'}</td>
                  <td className="whitespace-nowrap">{b.call_time ? b.call_time.slice(0, 5) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableCard.Root>
  )
}

/** The Fleet Manager's vehicles that need something before their next job. */
function VehicleListCard({ list, base }: { list: ListSpec; base: string }) {
  const rows = (list.vehicles ?? []).slice(0, DESK_ROWS)
  return (
    <TableCard.Root untitled className="flex flex-col">
      <TableCard.Header title={list.title} contentTrailing={<CardLink href={`${base}/vehicle-management`}>Vehicle Management</CardLink>} />
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-[#818181] md:px-6">
          <CheckCircle2 size={16} /> {list.empty}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[420px]">
            <thead>
              <tr><th>Plate number</th><th>Needs</th></tr>
            </thead>
            <tbody className="ff-regular text-sm text-white">
              {rows.map((v) => (
                <tr key={v.truck_id + v.reason}>
                  <td className="whitespace-nowrap">
                    <Link href={`${base}/vehicle-management`} className="transition-opacity [@media(hover:hover)]:hover:opacity-80">
                      {v.plate_number}
                    </Link>
                  </td>
                  <td className="text-[#ffea00]">{v.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableCard.Root>
  )
}

function DeskSkeleton({ role }: { role: DeskRole }) {
  return (
    <div className="flex flex-col gap-5 lg:gap-6" aria-busy="true" aria-label="Loading dashboard">
      <MetricRowSkeleton cards={SKELETON_COUNTS[role].cards} cols={DESK_METRIC_COLS[role]} />
      <div className={DESK_LISTS}>
        {Array.from({ length: SKELETON_COUNTS[role].lists }).map((_, i) => (
          <TableCard.Root key={i} untitled>
            <div className="flex items-center justify-between gap-4 border-b border-[#424242] px-4 py-5 md:px-6">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-9 w-48 rounded-lg" />
            </div>
            <div className="divide-y divide-[#2a2a2a]">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-6 px-4 py-4 md:px-6">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="hidden h-3.5 w-24 sm:block" />
                </div>
              ))}
            </div>
          </TableCard.Root>
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

  // Every other desk follows the same format, each with its own cards and queues.
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white px-4 py-5 lg:px-8 lg:py-6">
      <div className="flex w-full flex-col gap-5 lg:gap-6">
        {error && (
          <div className="rounded-xl border border-[#f62626]/30 bg-[#f62626]/10 px-4 py-2.5 text-sm text-[#f62626]">{error}</div>
        )}
        {!data ? loading && <DeskSkeleton role={role} /> : (
          <>
            <MetricRow cards={cardsFor(role, data)} cols={DESK_METRIC_COLS[role]} />
            <div className={DESK_LISTS}>
              {listsFor(role, data).map((l) => <ListCard key={l.title} list={l} base={base} />)}
            </div>
          </>
        )}
        <div className="h-4" />
      </div>
    </div>
  )
}
