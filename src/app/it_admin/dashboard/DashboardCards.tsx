'use client'

import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Navigation, Package, Route, Truck, UserRound } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Dropdown from '@/components/ui/Dropdown'
import BookingStatusTag from '@/components/transactions/BookingStatusTag'
import { Tip } from '@/components/ui/tooltip'
import { TruncatedText } from '@/components/ui/TruncatedText'
import { formatDateTime } from '@/app/utils/timeFormat'
import type { ActivityRow, LogisticsOverview, LogisticsPeriod } from '@/lib/services/admin/it-dashboard.service'

/**
 * The IT Administrator dashboard's cards, copied from TailAdmin's logistics
 * dashboard (user 2026-11-26: "just copy the data that is in the link"):
 * three stat cards with a change badge, Delivery Statistics, Delivery
 * Vehicles, On-route and Tracking Delivery. Filled with our bookings and fleet;
 * the link's money figures (revenue, price) are left out because the system
 * handles no amounts (2026-11-17), and a change badge shows only where there
 * is an earlier period to compare with.
 */

const GREEN  = '#3af626'
const YELLOW = '#ffea00'
const CYAN   = '#4df9ed'
const RED    = '#f62626'
const ORANGE = '#ff7a30'
const MUTED  = '#818181'

/** The table card's frame (table-card.tsx), so the cards and the table match. */
export const CARD = 'rounded-[10px] border-[0.5px] border-[#424242] bg-[#1b1b1b] shadow-[0_4px_4px_rgba(0,0,0,0.25)]'

const en = (v: number) => v.toLocaleString('en-PH')

// ── Stat cards ──────────────────────────────────────────────────────────────

/**
 * TailAdmin's "+20%" badge: the last 30 days against the 30 before. Nothing
 * when the earlier 30 days had none (a percentage of nothing means nothing).
 */
function Change({ now, before, what }: { now: number; before: number; what: string }) {
  if (before === 0) return null
  const pct = Math.round(((now - before) / before) * 100)
  const color = pct > 0 ? GREEN : pct < 0 ? RED : MUTED
  return (
    <Tip label={`${what}: ${en(now)} in the last 30 days, ${en(before)} in the 30 days before`}>
      <span
        className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ color, background: `${color}14`, border: `1px solid ${color}40` }}
      >
        {pct > 0 ? <ArrowUpRight size={12} /> : pct < 0 ? <ArrowDownRight size={12} /> : null}
        {pct > 0 ? '+' : pct < 0 ? '−' : ''}{Math.abs(pct)}%
      </span>
    </Tip>
  )
}

function StatCard({ icon, color, value, label, badge, hint }: {
  icon: ReactNode; color: string; value: number; label: string; badge?: ReactNode
  /** What the number counts, on hover / focus of the label. */
  hint?: string
}) {
  return (
    <div className={`${CARD} flex min-w-0 flex-col p-5`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ color, background: `${color}14` }}>
        {icon}
      </span>
      <div className="mt-5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight text-white 3xl:text-[28px]">{en(value)}</p>
          {hint
            ? <Tip label={hint}><p className="mt-1 w-fit text-sm text-[#818181]">{label}</p></Tip>
            : <p className="mt-1 text-sm text-[#818181]">{label}</p>}
        </div>
        {badge}
      </div>
    </div>
  )
}

export function StatCards({ o }: { o: LogisticsOverview }) {
  const t = o.totals
  return (
    <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-3 3xl:gap-4">
      <StatCard icon={<Package size={20} />} color={CYAN} value={t.bookings} label="Total bookings"
                badge={<Change now={t.booked_30d} before={t.booked_prev_30d} what="New bookings" />} />
      <StatCard icon={<Navigation size={20} />} color={YELLOW} value={t.in_transit} label="Bookings in transit" />
      <StatCard icon={<CheckCircle2 size={20} />} color={GREEN} value={t.delivered} label="Delivered bookings"
                badge={<Change now={t.delivered_30d} before={t.delivered_prev_30d} what="Deliveries finished" />} />
    </div>
  )
}

// ── Delivery Statistics ─────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Nov" or "2026" from a YYYY-MM-DD bucket start (no Date parsing). */
function bucketLabel(start: string, period: LogisticsPeriod) {
  const [y, m] = start.split('-').map(Number)
  return period === 'annually' ? String(y) : MONTHS[m - 1]
}

const PERIOD_LABEL: Record<LogisticsPeriod, string> = { monthly: 'Monthly', annually: 'Yearly' }
const RANGE_WORDS: Record<LogisticsPeriod, string> = { monthly: 'last 12 months', annually: 'last 5 years' }

const SERIES = [
  { key: 'booked',    label: 'Booked',     color: CYAN },
  { key: 'delivered', label: 'Delivered',  color: GREEN },
] as const

export function DeliveryStatistics({ o, period, onPeriod, loading }: {
  o: LogisticsOverview; period: LogisticsPeriod; onPeriod: (p: LogisticsPeriod) => void; loading: boolean
}) {
  const data = o.statistics.buckets.map((b) => ({ ...b, label: bucketLabel(b.start, o.statistics.period) }))
  return (
    <div className={`${CARD} flex min-w-0 flex-1 flex-col px-5 pt-5 pb-3`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">Delivery statistics</h2>
          <p className="text-sm text-[#818181]">
            Deliveries finished in the {RANGE_WORDS[o.statistics.period]}:{' '}
            <span className="font-semibold text-white">{en(o.statistics.delivered_in_range)}</span>
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-[150px]">
          <Dropdown
            value={period}
            onChange={(e) => onPeriod(e.target.value as LogisticsPeriod)}
            aria-label="Range"
            disabled={loading}
            className="ff-sc h-[38px] w-full cursor-pointer appearance-none rounded-[10px] border border-[#343434] bg-[#2a2828] pl-4 pr-10 text-[16px] md:text-[15px] text-white outline-hidden [color-scheme:dark] focus:border-[#4df9ed]"
          >
            {(Object.keys(PERIOD_LABEL) as LogisticsPeriod[]).map((p) => (
              <option key={p} value={p} className="bg-[#1b1b1b] text-white">{PERIOD_LABEL[p]}</option>
            ))}
          </Dropdown>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-sm text-[#a3a3a3]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}
          </span>
        ))}
      </div>

      <div className={`mt-3 h-64 w-full flex-1 xl:min-h-[260px] transition-opacity ${loading ? 'opacity-50' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }} barGap={2}>
            <CartesianGrid stroke="#2a2a2a" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#e5e5e5' }}
              formatter={(v, name) => [en(Number(v)), SERIES.find((s) => s.key === name)?.label ?? String(name)]}
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={s.color} isAnimationActive={false} maxBarSize={14} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Delivery Vehicles + On-route ────────────────────────────────────────────

/** The link's Delivery Vehicles and On-route, drawn as the stat cards beside them. */
export function FleetCards({ o }: { o: LogisticsOverview }) {
  return (
    <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2 3xl:gap-4">
      <StatCard icon={<Truck size={20} />} color={CYAN} value={o.vehicles.total} label="Delivery vehicles"
                hint="Company vehicles in the fleet (archived ones not counted)" />
      <StatCard icon={<Route size={20} />} color={ORANGE} value={o.vehicles.on_route} label="On-route"
                hint="Out on a booking until back at the parking" />
    </div>
  )
}

// ── Tracking Delivery ───────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}

/**
 * The link's "Tracking Delivery": one booking's steps and its driver. Shows
 * the delivery that started most recently until a row in the table below is
 * picked. The steps are in the order they really happen here: the truck
 * leaves for the pick-up, loads (pick-up proof), then finishes the last drop-off.
 */
export function TrackingCard({ row, picked, className = '' }: { row: ActivityRow | null; picked: boolean; className?: string }) {
  const steps = row ? [
    { label: 'Left for pick-up', at: row.started_at },
    { label: 'Picked up',        at: row.picked_up_at },
    { label: 'Delivered',        at: row.delivered_at },
  ] : []

  return (
    <div className={`${CARD} flex min-w-0 flex-1 flex-col overflow-hidden ${className}`}>
      <div className="shrink-0 px-5 pt-5">
        <h2 className="text-base font-semibold text-white">Tracking delivery</h2>
        <p className="text-sm text-[#818181]">{picked ? 'The booking you picked in the table' : 'The delivery that started most recently'}</p>
      </div>

      {!row ? (
        <p className="flex-1 px-5 py-6 text-sm text-[#818181]">No delivery has started yet.</p>
      ) : (
        <>
          <div className="mx-5 mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-[#141414] px-3 py-2.5 ring-1 ring-[#2a2a2a] ring-inset">
            <div className="min-w-0">
              <p className="text-xs text-[#818181]">Booking</p>
              <p className="font-mono text-sm text-white">{row.reference_number ?? '—'}</p>
            </div>
            <BookingStatusTag booking={{ ...row.tag, status: row.status }} staff align="end" />
          </div>

          <ol className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {steps.map((s, i) => {
              const done = !!s.at
              const color = done ? GREEN : '#424242'
              return (
                <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < steps.length - 1 && (
                    <span aria-hidden className="absolute left-[7px] top-5 bottom-0 w-px" style={{ background: steps[i + 1].at ? GREEN : '#2a2a2a' }} />
                  )}
                  <span className="relative mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full" style={{ background: `${color}33` }}>
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                    <p className={`text-sm font-medium ${done ? 'text-white' : 'text-[#818181]'}`}>{s.label}</p>
                    <p className="text-xs text-[#818181]">{s.at ? formatDateTime(s.at) : 'Not yet'}</p>
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="flex shrink-0 items-center gap-3 border-t border-[#2a2a2a] px-5 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#262626] text-sm font-semibold text-white">
              {row.driver ? initials(row.driver) : <UserRound size={18} className="text-[#818181]" />}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-[#818181]">Driver{row.plate ? ` · ${row.plate}` : ''}</p>
              <TruncatedText as="p" className="text-sm font-medium text-white">{row.driver ?? 'Not assigned yet'}</TruncatedText>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
