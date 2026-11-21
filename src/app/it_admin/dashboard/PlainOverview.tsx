'use client'

import type { ReactNode } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleHelp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type {
  HealthPart,
  HealthState,
  ItDashboardSummary,
  TrafficSection,
} from '@/lib/services/admin/it-dashboard.service'
import type { SystemLogEventType, SystemLogLevel } from '@/lib/services/admin/system-logs.service'
import { formatDateTime } from '@/app/utils/timeFormat'
import { Tip } from '@/components/ui/tooltip'

/**
 * The top of the IT Administrator dashboard, written for someone with no IT
 * knowledge (user 2026-11-21). Modelled on Apple's System Status and Atlassian
 * Statuspage: one sentence for the whole system, then each part named the way a
 * user would say it with a coloured dot, a word, and one sentence of why. Then
 * Google SRE's golden signals in plain words: how many requests, how many
 * failed, how long people waited.
 */

const GREEN = '#3af626'
const AMBER = '#ffea00'
const RED   = '#f62626'
const MUTED = '#818181'

export const STATE: Record<HealthState, { word: string; color: string; icon: ReactNode }> = {
  working: { word: 'Working',        color: GREEN, icon: <CheckCircle2 size={16} /> },
  trouble: { word: 'Having trouble', color: AMBER, icon: <AlertTriangle size={16} /> },
  down:    { word: 'Not working',    color: RED,   icon: <AlertOctagon size={16} /> },
  unknown: { word: 'Checking',       color: MUTED, icon: <CircleHelp size={16} /> },
}

const CARD = 'rounded-xl bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] ring-inset'

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {sub && <p className="text-sm text-[#a3a3a3]">{sub}</p>}
    </div>
  )
}

// ── 1 · One sentence for the whole system ───────────────────────────────────

function attention(s: ItDashboardSummary): { serious: boolean; items: string[] } {
  const items: string[] = []
  let serious = false
  for (const p of s.health) {
    if (p.state === 'down')    { serious = true; items.push(`${p.name} is not working. ${p.summary}`) }
    if (p.state === 'trouble') items.push(`${p.name} is having trouble. ${p.summary}`)
  }
  const { critical, error } = s.problems.unresolved
  if (critical) {
    serious = true
    items.push(`${critical} serious problem${critical === 1 ? ' is' : 's are'} waiting for you. See "Problems to look at" below.`)
  } else if (error) {
    items.push(`${error} problem${error === 1 ? ' is' : 's are'} waiting for you. See "Problems to look at" below.`)
  }
  const locked = s.security.locked_accounts.length
  if (locked) items.push(`${locked} account${locked === 1 ? ' is' : 's are'} locked and can't sign in.`)
  if (!s.accounts.it_admin && !s.accounts.it_standin) {
    serious = true
    items.push('Nobody is the IT Administrator right now.')
  }
  return { serious, items }
}

export function OverallBanner({ summary }: { summary: ItDashboardSummary }) {
  const { serious, items } = attention(summary)
  if (items.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl px-4 py-4 md:px-5" style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}40` }}>
        <CheckCircle2 size={22} className="mt-0.5 shrink-0" style={{ color: GREEN }} />
        <div>
          <p className="text-lg font-semibold text-white">Everything is working normally.</p>
          <p className="text-sm text-[#a3a3a3]">Nothing needs your attention right now.</p>
        </div>
      </div>
    )
  }
  const color = serious ? RED : AMBER
  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-4 md:px-5" style={{ background: `${color}10`, border: `1px solid ${color}40` }}>
      {serious
        ? <AlertOctagon size={22} className="mt-0.5 shrink-0" style={{ color }} />
        : <AlertTriangle size={22} className="mt-0.5 shrink-0" style={{ color }} />}
      <div className="min-w-0">
        <p className="text-lg font-semibold text-white">
          {items.length === 1 ? '1 thing needs your attention.' : `${items.length} things need your attention.`}
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-[#e0e0e0]">
          {items.map((t) => <li key={t} className="break-words">{t}</li>)}
        </ul>
      </div>
    </div>
  )
}

// ── 2 · Is everything working? ──────────────────────────────────────────────

function HealthTile({ part }: { part: HealthPart }) {
  const st = STATE[part.state]
  return (
    <div className={`${CARD} flex min-w-0 flex-col gap-2 px-4 py-4`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-semibold text-white">{part.name}</p>
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ color: st.color, background: `${st.color}14`, border: `1px solid ${st.color}40` }}>
          <span className="h-2 w-2 rounded-full" style={{ background: st.color }} />
          {st.word}
        </span>
      </div>
      <p className="text-xs text-[#818181]">{part.what}</p>
      <p className="text-sm text-[#e0e0e0]">{part.summary}</p>
      {part.last_problem_at && part.state === 'working' && (
        <p className="text-xs text-[#818181]">Last problem: {formatDateTime(part.last_problem_at)}</p>
      )}
    </div>
  )
}

export function HealthGrid({ parts }: { parts: HealthPart[] }) {
  // Problems first, so the eye lands on them; the rest keep their order.
  const rank: Record<HealthState, number> = { down: 0, trouble: 1, unknown: 2, working: 3 }
  const sorted = [...parts].sort((a, b) => rank[a.state] - rank[b.state])
  return (
    <section>
      <SectionTitle title="Is everything working?" sub="Each part of the system, checked every minute." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
        {sorted.map((p) => <HealthTile key={p.key} part={p} />)}
      </div>
    </section>
  )
}

// ── 3 · How is the system doing today? ──────────────────────────────────────

function seconds(ms: number | null) {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`
}

/** "1 in 350", the way a person says a rate; "None" for zero. */
function oneIn(failed: number, total: number) {
  if (!total || !failed) return 'None'
  const per = Math.round(total / failed)
  return per <= 1 ? 'Almost all' : `1 in ${per.toLocaleString('en-PH')}`
}

function BigNumber({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className={`${CARD} min-w-0 px-4 py-4`}>
      <p className="text-sm text-[#a3a3a3]">{label}</p>
      <p className="mt-1 text-3xl font-semibold leading-tight" style={{ color: color ?? '#ffffff' }}>{value}</p>
      <p className="mt-1 text-xs text-[#818181]">{sub}</p>
    </div>
  )
}

function hourLabel(iso: string) {
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: true })
}

export function TodayCard({ t }: { t: TrafficSection }) {
  const d = t.last_24h
  if (!t.measured_since) {
    return (
      <section>
        <SectionTitle title="How is the system doing today?" />
        <div className={`${CARD} px-4 py-5 text-sm text-[#a3a3a3]`}>
          Measuring has just started. The numbers appear here within a few minutes.
        </div>
      </section>
    )
  }
  const failedShare = d.requests ? d.failed / d.requests : 0
  const failColor = d.failed === 0 ? GREEN : failedShare >= 0.02 ? RED : failedShare >= 0.005 ? AMBER : GREEN
  const waitColor = (d.avg_ms ?? 0) >= 1500 ? RED : (d.avg_ms ?? 0) >= 800 ? AMBER : GREEN
  // Measuring began inside the 24-hour window: say so, the totals are partial.
  const partial = Date.parse(t.measured_since) > Date.parse(t.hourly[0]?.start ?? t.measured_since)
  const data = t.hourly.map((h) => ({ hour: hourLabel(h.start), worked: h.requests - h.failed, failed: h.failed }))

  return (
    <section>
      <SectionTitle
        title="How is the system doing today?"
        sub={partial ? `Last 24 hours (measured since ${formatDateTime(t.measured_since)}).` : 'Last 24 hours.'}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BigNumber
          label="Requests handled"
          value={d.requests.toLocaleString('en-PH')}
          sub="Every page, button and app action is a request."
        />
        <Tip label={`${d.failed.toLocaleString('en-PH')} failed because of the system. ${d.refused.toLocaleString('en-PH')} more were turned away on purpose (wrong password, no permission) and are not counted as failures.`}>
          <div>
            <BigNumber
              label="Requests that failed"
              value={oneIn(d.failed, d.requests)}
              sub={d.failed ? `${d.failed.toLocaleString('en-PH')} in total (${(failedShare * 100).toFixed(2)}%).` : 'Nothing failed.'}
              color={failColor}
            />
          </div>
        </Tip>
        <BigNumber
          label="Average wait"
          value={seconds(d.avg_ms)}
          sub={d.slow ? `${d.slow.toLocaleString('en-PH')} request${d.slow === 1 ? '' : 's'} took 3 seconds or more.` : 'None took 3 seconds or more.'}
          color={waitColor}
        />
      </div>

      <div className={`${CARD} mt-3 px-2 pb-2 pt-4 sm:px-4`}>
        <p className="px-2 pb-2 text-sm text-[#a3a3a3]">
          Requests per hour <span className="text-[#818181]">(green = worked, red = failed)</span>
        </p>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#2a2a2a" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#e5e5e5' }}
                formatter={(v, name) => [Number(v).toLocaleString('en-PH'), name === 'failed' ? 'Failed' : 'Worked']}
              />
              <Bar dataKey="worked" stackId="r" fill={GREEN} fillOpacity={0.55} isAnimationActive={false} maxBarSize={18} />
              <Bar dataKey="failed" stackId="r" fill={RED} isAnimationActive={false} maxBarSize={18} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}

// ── 4 · Problems in plain words ─────────────────────────────────────────────

/** What a problem means, for someone who can't read the technical message. */
export function plainProblem(level: SystemLogLevel, event: SystemLogEventType, source: string): string {
  if (source === 'mailer' || event === 'email_event') return 'An email could not be sent.'
  if (event === 'auth_event') {
    return level === 'critical'
      ? 'A sign-in looked unsafe, so the system blocked it.'
      : 'Something went wrong while someone was signing in.'
  }
  if (event === 'cron_job')     return 'An automatic task (a reminder or alert the system sends on its own) failed.'
  if (event === 'db_event')     return 'Saving or loading data failed.'
  if (event === 'external_api') return 'A connected service (maps, files, notifications, the assistant) did not answer.'
  if (event === 'server_error') return 'Something went wrong while someone was using the system.'
  return 'Something went wrong.'
}

export const PLAIN_LEVEL: Record<'critical' | 'error', { word: string; color: string }> = {
  critical: { word: 'Serious', color: RED },
  error:    { word: 'Problem', color: '#ff7a30' },
}
