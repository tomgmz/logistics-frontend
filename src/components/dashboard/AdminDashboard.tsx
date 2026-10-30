'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { TableCard } from '@/components/ui/untitled/table-card'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDate } from '@/app/utils/timeFormat'
import { bookingStatusColor } from '@/lib/palette'
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

const TONE = { cyan: '#4df9ed', amber: '#ffea00', red: '#f62626', green: '#3af626', muted: '#818181' } as const

const CARD = 'rounded-xl bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] ring-inset'

/** Untitled UI's secondary button, size sm, as a link. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1b1b1b] px-3 py-2 text-sm font-semibold text-[#e5e5e5] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] ring-inset transition [@media(hover:hover)]:hover:bg-[#262626] [@media(hover:hover)]:hover:text-white"
    >
      {children} <ExternalLink size={14} className="text-[#818181]" />
    </Link>
  )
}

// ── Metric row ───────────────────────────────────────────────────────────────

/** dashboard-04's metric cards, each a link into the module where the work is done. */
export function MetricRow({ cards, cols = 'md:grid-cols-3' }: { cards: CardSpec[]; cols?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 ${cols}`}>
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

// ── Bookings overall (status donut) and busiest clients (bars) ───────────────

/** Delivered and Completed share the palette's green, so Delivered is striped. */
const STRIPED = new Set(['delivered'])
const stripeId = (s: string) => `status-stripe-${s}`

const TOOLTIP = {
  contentStyle: { background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 },
  labelStyle:   { color: '#e5e5e5' },
  itemStyle:    { color: '#e5e5e5' },
}

function Swatch({ status }: { status: string }) {
  const color = bookingStatusColor(status)
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={STRIPED.has(status)
        ? { background: `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 4px)`, boxShadow: `inset 0 0 0 1px ${color}` }
        : { background: color }}
    />
  )
}

/**
 * The booking totals and where every booking stands, in one card: an
 * Untitled UI pie-chart card (donut + legend). Total sits in the middle;
 * In transit, Completed and Cancelled are legend rows.
 */
function BookingsOverallCard({ d }: { d: Data }) {
  const mix    = d.analytics.status_mix
  const total  = d.analytics.totals.bookings
  const known  = STATUS_ORDER.filter((s) => s in STATUS_LABEL)
  const slices = known.filter((s) => (mix[s] ?? 0) > 0).map((s) => ({ status: s, name: STATUS_LABEL[s], value: mix[s] }))
  const sum    = slices.reduce((n, s) => n + s.value, 0)

  return (
    <TableCard.Root untitled className="flex flex-col">
      <TableCard.Header title="Bookings overall" contentTrailing={<CardLink href={`${BASE}/booking-management`}>Booking Management</CardLink>} />
      <div className="flex flex-col items-center gap-6 p-4 md:flex-row md:gap-10 md:p-6">
        <div className="relative size-44 shrink-0 sm:size-52">
          {sum > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {[...STRIPED].map((s) => (
                    <pattern key={s} id={stripeId(s)} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="6" height="6" fill={bookingStatusColor(s)} fillOpacity={0.35} />
                      <rect width="3" height="6" fill={bookingStatusColor(s)} />
                    </pattern>
                  ))}
                </defs>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="#1b1b1b"
                  strokeWidth={2}
                  cornerRadius={4}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.status} fill={STRIPED.has(s.status) ? `url(#${stripeId(s.status)})` : bookingStatusColor(s.status)} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {sum === 0 && <div className="absolute inset-0 rounded-full border-[14px] border-white/[0.06]" />}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-[#818181]">Total bookings</span>
            <span className="text-3xl font-semibold font-mono leading-tight text-white">{total.toLocaleString()}</span>
          </div>
        </div>

        <ul className="ff-regular flex w-full min-w-0 flex-col gap-3">
          {known.map((s) => {
            const n = mix[s] ?? 0
            return (
              <li key={s} className="flex min-w-0 items-center gap-2.5 text-sm">
                <Swatch status={s} />
                <span className={`min-w-0 flex-1 truncate ${n > 0 ? 'text-white' : 'text-[#818181]'}`}>{STATUS_LABEL[s]}</span>
                <span className={`font-mono ${n > 0 ? 'text-white' : 'text-[#818181]'}`}>{n.toLocaleString()}</span>
                <span className="w-10 text-right font-mono text-[#818181]">{Math.round((n / Math.max(1, sum)) * 100)}%</span>
              </li>
            )
          })}
        </ul>
      </div>
    </TableCard.Root>
  )
}

/** Untitled UI's horizontal bar card: one bar per client, count at the end. */
function TopClientsCard({ d }: { d: Data }) {
  const top = d.analytics.top_clients
  return (
    <TableCard.Root untitled className="flex flex-col">
      <TableCard.Header title="Busiest clients, last 30 days" />
      {top.length === 0 ? (
        <p className="px-4 md:px-6 py-6 text-sm text-[#818181]">No bookings in the last 30 days.</p>
      ) : (
        <div className="p-4 md:p-6" style={{ height: top.length * 44 + 32 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical" barCategoryGap="30%" margin={{ top: 0, right: 36, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.08)" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: '#818181', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="client"
                width={110}
                tick={{ fill: '#e5e5e5', fontSize: 13 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
              />
              <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" name="Bookings" fill={SERIES.created} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}>
                <LabelList dataKey="count" position="right" fill="#e5e5e5" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </TableCard.Root>
  )
}

// ── Page body ────────────────────────────────────────────────────────────────

export default function AdminDashboard({ data, cards }: { data: Data; cards: CardSpec[] }) {
  return (
    <>
      <MetricRow cards={cards} />
      <BookingsChart d={data} />
      <div className="grid grid-cols-1 gap-5 lg:gap-6 xl:grid-cols-2">
        <BookingsOverallCard d={data} />
        <TopClientsCard d={data} />
      </div>
    </>
  )
}

/** The dashboard's own layout in grey, shown until the first load lands. */
/** The metric row in grey, for any dashboard that opens with MetricRow. */
export function MetricRowSkeleton({ cards, cols = 'md:grid-cols-3' }: { cards: number; cols?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 ${cols}`}>
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
  )
}

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

      <div className="grid grid-cols-1 gap-5 lg:gap-6 xl:grid-cols-2">
        <div className={CARD}>
          <div className="flex items-center justify-between gap-4 border-b border-[#424242] px-4 py-5 md:px-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </div>
          <div className="flex flex-col items-center gap-6 p-4 md:flex-row md:gap-10 md:p-6">
            <Skeleton className="size-44 shrink-0 rounded-full sm:size-52" />
            <div className="w-full space-y-3">
              {Array.from({ length: 7 }).map((_, j) => <Skeleton key={j} className="h-3.5 w-full" />)}
            </div>
          </div>
        </div>
        <div className={CARD}>
          <div className="border-b border-[#424242] px-4 py-5 md:px-6">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="space-y-5 p-4 md:p-6">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex items-center gap-4">
                <Skeleton className="h-3.5 w-24 shrink-0" />
                <Skeleton className={`h-3.5 ${['w-full', 'w-3/4', 'w-3/5', 'w-2/5', 'w-1/4'][j]}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
