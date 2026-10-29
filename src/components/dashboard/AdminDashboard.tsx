'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { TableCard } from '@/components/ui/untitled/table-card'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDate } from '@/app/utils/timeFormat'
import type { StaffDashboard as Data } from '@/lib/services/admin/staff-dashboard.service'
import type { CardSpec } from './StaffDashboard'

/**
 * The Company Administrator's dashboard, laid out as Untitled UI's
 * dashboard-04 like the IT Administrator's (metric row, a chart section, then
 * table cards), in our palette: bg-primary → #1b1b1b, ring-secondary →
 * #424242, text-tertiary → #818181. Same data as before; only the layout moved.
 */

const BASE = '/admin'

// Validated (dataviz validate_palette, dark, surface #1b1b1b): both inside the
// lightness band, CVD and normal-vision separation pass.
const SERIES = { created: '#4df9ed', delivered: '#8a38f5' } as const

const STATUS_LABEL: Record<string, string> = {
  pending:    'Pending approval',
  approved:   'Approved, awaiting assignment',
  assigned:   'Assigned',
  in_transit: 'In transit',
  delivered:  'Delivered, awaiting client',
  completed:  'Completed',
  cancelled:  'Cancelled',
}
const STATUS_ORDER = ['pending', 'approved', 'assigned', 'in_transit', 'delivered', 'completed', 'cancelled']

const TONE = { cyan: '#4df9ed', amber: '#ffea00', red: '#f62626', muted: '#818181' } as const

const TH   = 'px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]'
const TD   = 'px-4 md:px-6 py-4 align-top'
const CARD = 'rounded-xl bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] ring-inset'

/** Untitled UI's secondary button, size sm, as a link. */
function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1b1b1b] px-3 py-2 text-sm font-semibold text-[#e5e5e5] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] ring-inset transition [@media(hover:hover)]:hover:bg-[#262626] [@media(hover:hover)]:hover:text-white"
    >
      {children} <ExternalLink size={14} className="text-[#818181]" />
    </Link>
  )
}

/** A table that keeps its columns on phones and slides sideways. */
function Table({ head, minWidth, children }: { head: string[]; minWidth: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className={`data-table ${minWidth}`}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} className={TH}>{h}</th>)}</tr>
        </thead>
        <tbody className="ff-regular divide-y divide-[#2a2a2a]">{children}</tbody>
      </table>
    </div>
  )
}

// ── Metric row ───────────────────────────────────────────────────────────────

/** dashboard-04's metric cards, each a link into the module where the work is done. */
function MetricRow({ cards }: { cards: CardSpec[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
      {cards.map((c) => {
        const color = c.count > 0 ? TONE[c.tone] : TONE.muted
        return (
          <Link
            key={c.label}
            href={c.href}
            className={`${CARD} min-w-0 transition [@media(hover:hover)]:hover:ring-[#5a5a5a]`}
          >
            <div className="flex flex-col gap-4 px-4 py-5 md:px-5 xl:flex-row">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-[#424242] ring-inset shadow-[0_1px_2px_rgba(0,0,0,0.4)]" style={{ color }}>
                {c.icon}
              </span>
              <div className="flex w-full min-w-0 flex-col gap-2">
                <p className="text-sm font-semibold text-[#818181]">{c.label}</p>
                <p className="text-3xl font-semibold leading-none font-mono" style={{ color: c.count > 0 ? color : TONE.muted }}>
                  {c.count.toLocaleString()}
                </p>
                <p className="text-xs leading-snug text-[#818181]">{c.hint}</p>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Chart ────────────────────────────────────────────────────────────────────

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[#818181]">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label} <span className="font-mono text-white">{value.toLocaleString()}</span>
    </span>
  )
}

/** dashboard-04's chart section: a heading with the totals, then thin bars. */
function BookingsChart({ d }: { d: Data }) {
  const series = d.analytics.series.map((p) => ({ ...p, label: formatDate(p.day).replace(/,?\s*\d{4}$/, '') }))
  const created   = series.reduce((s, p) => s + p.created, 0)
  const delivered = series.reduce((s, p) => s + p.delivered, 0)

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col items-start justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h2 className="text-lg font-semibold text-white">Bookings, last 14 days</h2>
          <p className="text-sm text-[#818181]">Created per day against delivered per day</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <LegendDot color={SERIES.created} label="Created" value={created} />
          <LegendDot color={SERIES.delivered} label="Delivered" value={delivered} />
        </div>
      </div>

      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} barGap={2} barCategoryGap="30%" margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" tick={{ fill: '#818181', fontSize: 12 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#e5e5e5' }}
              itemStyle={{ color: '#e5e5e5' }}
            />
            <Bar dataKey="created"   name="Created"   fill={SERIES.created}   radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
            <Bar dataKey="delivered" name="Delivered" fill={SERIES.delivered} radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

// ── Totals, status mix, busiest clients ──────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#141414] px-4 py-3 ring-1 ring-[#2a2a2a] ring-inset">
      <p className="text-sm font-medium leading-snug text-[#818181]">{label}</p>
      <p className="mt-2 text-2xl font-semibold font-mono leading-none text-white">{value.toLocaleString()}</p>
    </div>
  )
}

function TotalsCard({ d }: { d: Data }) {
  const a = d.analytics
  return (
    <TableCard.Root untitled>
      <TableCard.Header title="Bookings overall" contentTrailing={<CardLink href={`${BASE}/booking-management`}>Booking Management</CardLink>} />
      <div className="grid grid-cols-2 gap-3 p-4 md:p-6 lg:grid-cols-4">
        <Stat label="Total bookings" value={a.totals.bookings} />
        <Stat label="In transit now" value={d.queues.in_transit.count} />
        <Stat label="Completed"      value={a.totals.completed} />
        <Stat label="Cancelled"      value={a.totals.cancelled} />
      </div>
    </TableCard.Root>
  )
}

function StatusMixCard({ d }: { d: Data }) {
  const mix   = d.analytics.status_mix
  const total = Object.values(mix).reduce((s, n) => s + n, 0)
  const rows  = STATUS_ORDER.filter((s) => mix[s])
  return (
    <TableCard.Root untitled className="flex flex-col">
      <TableCard.Header title="Where bookings stand" />
      <Table head={['Status', 'Bookings', 'Share']} minWidth="min-w-[420px]">
        {total === 0 ? (
          <tr><td colSpan={3} className="px-4 md:px-6 py-6 text-sm text-[#818181]">No bookings yet.</td></tr>
        ) : rows.map((s) => (
          <tr key={s}>
            <td className={`${TD} text-white`}>{STATUS_LABEL[s] ?? s}</td>
            <td className={`${TD} font-mono text-white`}>{mix[s].toLocaleString()}</td>
            <td className={`${TD} font-mono text-[#818181]`}>{Math.round((mix[s] / Math.max(1, total)) * 100)}%</td>
          </tr>
        ))}
      </Table>
    </TableCard.Root>
  )
}

function TopClientsCard({ d }: { d: Data }) {
  const top = d.analytics.top_clients
  const max = Math.max(1, ...top.map((c) => c.count))
  return (
    <TableCard.Root untitled className="flex flex-col">
      <TableCard.Header title="Busiest clients, last 30 days" />
      <Table head={['Client', 'Bookings', '']} minWidth="min-w-[420px]">
        {top.length === 0 ? (
          <tr><td colSpan={3} className="px-4 md:px-6 py-6 text-sm text-[#818181]">No bookings in the last 30 days.</td></tr>
        ) : top.map((c) => (
          <tr key={c.client}>
            <td className={`${TD} text-white break-words`}>{c.client}</td>
            <td className={`${TD} font-mono text-white`}>{c.count.toLocaleString()}</td>
            <td className={`${TD} w-2/5`}>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06]">
                <div className="h-1.5 rounded-full" style={{ width: `${(c.count / max) * 100}%`, background: SERIES.created }} />
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </TableCard.Root>
  )
}

// ── Page body ────────────────────────────────────────────────────────────────

export default function AdminDashboard({ data, cards }: { data: Data; cards: CardSpec[] }) {
  return (
    <>
      <MetricRow cards={cards} />
      <BookingsChart d={data} />
      <TotalsCard d={data} />
      <div className="grid grid-cols-1 gap-5 lg:gap-6 xl:grid-cols-2">
        <StatusMixCard d={data} />
        <TopClientsCard d={data} />
      </div>
    </>
  )
}

/** The dashboard's own layout in grey, shown until the first load lands. */
export function AdminDashboardSkeleton({ cards }: { cards: number }) {
  return (
    <div className="flex flex-col gap-5 lg:gap-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className={`${CARD} flex min-w-0 flex-col gap-4 px-4 py-5 md:px-5 xl:flex-row`}>
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex w-full flex-col gap-3">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-5">
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-5 w-52" />
        </div>
        <Skeleton className="h-60 w-full rounded-xl" />
      </section>

      <div className={CARD}>
        <div className="flex items-center justify-between gap-4 border-b border-[#424242] px-4 py-5 md:px-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 md:p-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2.5 rounded-xl bg-[#141414] px-4 py-3 ring-1 ring-[#2a2a2a] ring-inset">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-6 w-10" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:gap-6 xl:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className={CARD}>
          <div className="border-b border-[#424242] px-4 py-5 md:px-6">
            <Skeleton className="h-5 w-40" />
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
        </div>
      ))}
      </div>
    </div>
  )
}
