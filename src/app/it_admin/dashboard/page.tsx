'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Loader2,
  Mail, MapPin, Bell, ScanLine, Cloud, ShieldAlert, Plug,
} from 'lucide-react'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { systemLogService, type IssueAction, type SystemLogEventType, type SystemLogLevel } from '@/lib/services/admin/system-logs.service'
import {
  itDashboardService,
  type ItDashboardSummary,
  type SchedulerHealth,
  type SchedulerStatus,
  type ServiceHealth,
  type ServiceStatus,
  type SecurityWindow,
} from '@/lib/services/admin/it-dashboard.service'
import { OverallBanner, HealthGrid, TodayCard, plainProblem, PLAIN_LEVEL } from './PlainOverview'
import { formatDateTime } from '@/app/utils/timeFormat'
import { roleLabel } from '@/lib/roles'

import ItAdminHandoverPanel from '@/components/admin/ItAdminHandoverPanel'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { systemSourceLabel } from '@/lib/log-labels'
import { cachedData, storeData } from '@/lib/query/useApiQuery'
import { Tip } from '@/components/ui/tooltip'
// ── Helpers ──────────────────────────────────────────────────────────────────

/** Scheduler staleness is a function of time, not of any row changing. */
const POLL_MS = 60_000

const COLOR = {
  cyan:     '#4df9ed',
  green:    '#3af626',
  amber:    '#ffea00',
  red:      '#f62626',
  critical: '#f62626',
  muted:    '#818181',
} as const

const EVENT_LABEL: Record<SystemLogEventType, string> = {
  server_error: 'Server error',
  auth_event:   'Sign-in event',
  email_event:  'Email',
  external_api: 'External service',
  cron_job:     'Scheduled job',
  db_event:     'Database',
}

const SCHEDULER_STATUS: Record<SchedulerStatus, { label: string; color: string }> = {
  ok:      { label: 'Running',         color: COLOR.green },
  failing: { label: 'Failing',         color: COLOR.red },
  late:    { label: 'Late',            color: COLOR.amber },
  down:    { label: 'Stopped',         color: COLOR.critical },
  never:   { label: 'No heartbeat yet', color: COLOR.muted },
}

const SERVICE_STATUS: Record<ServiceStatus, { label: string; color: string }> = {
  ok:       { label: 'No failures recorded', color: COLOR.green },
  degraded: { label: 'Failures today',       color: COLOR.amber },
  failing:  { label: 'Failing now',          color: COLOR.red },
}

const SERVICE_ICON: Record<string, ReactNode> = {
  'email':         <Mail size={15} />,
  'storage':       <Cloud size={15} />,
  'google-maps':   <MapPin size={15} />,
  'push':          <Bell size={15} />,
  'idanalyzer':    <ScanLine size={15} />,
}

function ago(iso: string | null, now: number): string {
  if (!iso) return 'Never'
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 45)    return 'Just now'
  const m = Math.round(s / 60)
  if (m < 60)    return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24)    return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function every(minutes: number): string {
  if (minutes % (24 * 60) === 0) {
    const d = minutes / (24 * 60)
    return d === 1 ? 'Every day' : `Every ${d} days`
  }
  if (minutes % 60 === 0) return `Every ${minutes / 60} hours`
  return `Every ${minutes} minutes`
}

/** Deep link into Logs → System Logs with filters pre-applied. */
function logsHref(params: { level?: SystemLogLevel; event_type?: SystemLogEventType; search?: string } = {}) {
  const q = new URLSearchParams({ tab: 'system' })
  if (params.level)      q.set('level', params.level)
  if (params.event_type) q.set('event_type', params.event_type)
  if (params.search)     q.set('search', params.search)
  return `/it_admin/logs?${q.toString()}`
}

// ── Building blocks ──────────────────────────────────────────────────────────
//
// Laid out as Untitled UI's dashboard-04 (header, metric row, a card with a
// time-range tab list, then table cards), in our palette: bg-primary →
// #1b1b1b, ring-secondary → #424242, text-tertiary → #818181.

const SC = 'font-[family-name:var(--font-alegreya-sc)]'
const TH = 'px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]'
const TD = 'px-4 md:px-6 py-4 align-top'

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`${SC} inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold`}
      style={{ color, background: `${color}14`, border: `1px solid ${color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

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

function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 md:px-6 py-6 text-sm text-[#818181]">{children}</td>
    </tr>
  )
}

/** The dashboard's account lists show this many rows; User Management has the rest. */
const DASHBOARD_ROWS = 5

/** Under a shortened list: how much is showing, and the way to the whole list. */
function TableFooter({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2a2a2a] px-4 md:px-6 py-3">
      <p className="text-xs text-[#818181]">
        {total > shown ? `Showing ${shown} of ${total}` : `${total} in total`}
      </p>
      <CardLink href="/it_admin/administrator-management">Open in User Management</CardLink>
    </div>
  )
}

function Footnote({ children }: { children: ReactNode }) {
  return <p className="border-t border-[#2a2a2a] px-4 md:px-6 py-3 text-xs text-[#818181] leading-snug">{children}</p>
}

/** A small number inside a card, for the sign-in and account counts. */
function Stat({ label, value, color, href, hint }: {
  label: string; value: number; color: string; href?: string; hint?: string
}) {
  const body = (
    <>
      <p className="text-sm font-medium text-[#818181] leading-snug">{label}</p>
      <p className="mt-2 text-2xl font-semibold font-mono leading-none" style={{ color: value > 0 ? color : COLOR.muted }}>
        {value.toLocaleString()}
      </p>
    </>
  )
  const cls = 'block rounded-xl bg-[#141414] ring-1 ring-[#2a2a2a] ring-inset px-4 py-3 min-w-0'
  return href
    ? <Tip label={hint}><Link href={href} className={`${cls} transition [@media(hover:hover)]:hover:ring-[#424242]`}>{body}</Link></Tip>
    : <Tip label={hint}><div className={cls}>{body}</div></Tip>
}

// ── A · Problems to look at ──────────────────────────────────────────────────

/**
 * Open issues: repeated errors grouped (Sentry-style), so one Resolve closes
 * every occurrence. Critical first, then most recently seen.
 */
function ProblemsCard({ data, now, onAct, busy }: {
  data: ItDashboardSummary['problems']; now: number
  onAct: (issueId: string, body: IssueAction) => void; busy: Set<string>
}) {
  const open = data.open_issues ?? data.unresolved.critical + data.unresolved.error
  return (
    <TableCard.Root>
      <TableCard.Header
        title={open > data.latest.length ? `Problems to look at (${data.latest.length} of ${open.toLocaleString()})` : 'Problems to look at'}
        contentTrailing={<CardLink href="/it_admin/logs?tab=issues">See all</CardLink>}
      />
      <p className="border-b border-[#2a2a2a] px-4 md:px-6 py-3 text-sm text-[#a3a3a3]">
        The same problem happening many times is one line. Press Resolve once it is fixed; if it happens again it comes back here.
      </p>
      <Table head={['How bad', 'What happened', 'Times', 'Last time', '']} minWidth="min-w-[820px]">
        {data.latest.length === 0 ? (
          <EmptyRow cols={5}>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={15} className="text-[#3af626]" /> Nothing to look at.
            </span>
          </EmptyRow>
        ) : data.latest.map((row) => {
          const id = row.issue_id ?? row.log_id
          const lvl = PLAIN_LEVEL[row.log_level === 'critical' ? 'critical' : 'error']
          return (
            <tr key={id}>
              <td className={`${TD} whitespace-nowrap`}><Pill label={lvl.word} color={lvl.color} /></td>
              <td className={TD}>
                <p className="text-white">
                  {plainProblem(row.log_level, row.event_type, row.source)}
                  {row.regressed && <span className="ml-2 text-xs text-[#ff7a30]">Came back after being resolved</span>}
                </p>
                <Tip label={`${EVENT_LABEL[row.event_type] ?? row.event_type} · ${row.source}`}>
                  <p className="mt-0.5 text-xs text-[#818181] break-words">{systemSourceLabel(row.source)}: {row.message}</p>
                </Tip>
              </td>
              <Tip label={row.first_seen ? `First seen ${formatDateTime(row.first_seen)}` : undefined}>
                <td className={`${TD} whitespace-nowrap font-mono text-white`}>{(row.event_count ?? 1).toLocaleString()}</td>
              </Tip>
              <Tip label={formatDateTime(row.timestamp)}><td className={`${TD} whitespace-nowrap`}>
                {ago(row.timestamp, now)}
              </td></Tip>
              <td className={`${TD} text-right whitespace-nowrap`}>
                <span className="inline-flex gap-2">
                  <button
                    type="button"
                    onClick={() => onAct(id, { action: 'resolve' })}
                    disabled={busy.has(id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#3af626]/30 bg-[#3af626]/10 px-2.5 py-1 text-xs font-medium text-[#3af626] transition [@media(hover:hover)]:hover:bg-[#3af626]/20 disabled:opacity-50"
                  >
                    {busy.has(id) ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => onAct(id, { action: 'ignore', hours: 24 })}
                    disabled={busy.has(id)}
                    className="inline-flex items-center rounded-lg border border-[#424242] px-2.5 py-1 text-xs font-medium text-[#e0e0e0] transition [@media(hover:hover)]:hover:bg-white/5 disabled:opacity-50"
                  >
                    Ignore 24 hours
                  </button>
                </span>
              </td>
            </tr>
          )
        })}
      </Table>
    </TableCard.Root>
  )
}

// ── B · Scheduled jobs ───────────────────────────────────────────────────────

function SchedulersCard({ data, now }: { data: SchedulerHealth[]; now: number }) {
  return (
    <TableCard.Root>
      <TableCard.Header
        title="Automatic tasks"
        contentTrailing={<CardLink href={logsHref({ event_type: 'cron_job' })}>Task logs</CardLink>}
      />
      <Table head={['Task', 'Runs', 'Status', 'Last run', 'Failures today']} minWidth="min-w-[820px]">
        {data.map((s) => {
          const st = SCHEDULER_STATUS[s.status]
          return (
            <tr key={s.source}>
              <td className={TD}>
                <p className="font-medium text-white">{s.label}</p>
                <p className="text-xs text-[#818181]">{s.description}</p>
                {s.status === 'failing' && s.last_error_message && (
                  <p className="mt-1 text-xs text-[#f62626] break-words">{s.last_error_message}</p>
                )}
              </td>
              <td className={`${TD} whitespace-nowrap`}>{every(s.interval_minutes)}</td>
              <td className={TD}><Pill label={st.label} color={st.color} /></td>
              <Tip label={s.last_success_at ? formatDateTime(s.last_success_at) : undefined}><td className={`${TD} whitespace-nowrap`}>
                {ago(s.last_success_at, now)}
              </td></Tip>
              <td className={`${TD} whitespace-nowrap`}>
                {s.errors_24h > 0 ? (
                  <Link href={logsHref({ event_type: 'cron_job', search: s.source })} className="font-mono text-[#f62626] hover:underline">
                    {s.errors_24h}
                  </Link>
                ) : <span className="font-mono text-[#818181]">0</span>}
              </td>
            </tr>
          )
        })}
      </Table>
      <Footnote>
        A task is Late after two missed runs and Stopped after four. That usually means the server
        restarted or went to sleep.
      </Footnote>
    </TableCard.Root>
  )
}

// ── C · External services ────────────────────────────────────────────────────

function ServicesCard({ data, now }: { data: ServiceHealth[]; now: number }) {
  const count = (n: number) => (
    <span className="font-mono" style={{ color: n > 0 ? COLOR.red : COLOR.muted }}>{n}</span>
  )
  return (
    <TableCard.Root>
      <TableCard.Header
        title="Connected services"
        contentTrailing={<CardLink href={logsHref({ event_type: 'external_api' })}>Service logs</CardLink>}
      />
      <Table head={['Service', 'Status', 'Last hour', '24 hours', '7 days', 'Last failure']} minWidth="min-w-[900px]">
        {data.map((s) => {
          const st = SERVICE_STATUS[s.status]
          return (
            <tr key={s.key}>
              <td className={TD}>
                <div className="flex items-center gap-2">
                  <span className="text-[#818181]">{SERVICE_ICON[s.key] ?? <Plug size={15} />}</span>
                  <p className="font-medium text-white whitespace-nowrap">{s.label}</p>
                </div>
                <p className="mt-0.5 text-xs text-[#818181]">{s.description}</p>
              </td>
              <td className={TD}><Pill label={st.label} color={st.color} /></td>
              <td className={TD}>{count(s.failures_1h)}</td>
              <td className={TD}>{count(s.failures_24h)}</td>
              <td className={TD}>{count(s.failures_7d)}</td>
              <td className={`${TD} text-xs`}>
                {s.last_failure_at ? (
                  <>
                    <Tip label={formatDateTime(s.last_failure_at)}><p className="whitespace-nowrap">{ago(s.last_failure_at, now)}</p></Tip>
                    {s.last_failure_message && <p className="mt-0.5 text-[#f62626] break-words">{s.last_failure_message}</p>}
                  </>
                ) : <span className="text-[#818181]">None</span>}
              </td>
            </tr>
          )
        })}
      </Table>
      <Footnote>
        Only failures are recorded, so &ldquo;No failures recorded&rdquo; means nothing has gone wrong. It does not
        prove the provider was called.
      </Footnote>
    </TableCard.Root>
  )
}

// ── D · Sign-in security ─────────────────────────────────────────────────────

function SecurityCard({ data }: { data: ItDashboardSummary['security'] }) {
  const [range, setRange] = useState<'24h' | '7d'>('24h')
  const w: SecurityWindow = range === '24h' ? data.last_24h : data.last_7d

  return (
    <section className="rounded-xl bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] min-w-0">
      <div className="flex flex-col gap-4 border-b border-[#424242] px-4 py-5 md:flex-row md:items-start md:px-6">
        <div className="flex flex-1 items-start gap-3 min-w-0">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4df9ed]/10 text-[#4df9ed]">
            <ShieldAlert size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">Sign-in safety</h2>
            <p className="text-sm text-[#818181]">Who had trouble signing in, and what the system blocked. IP addresses are never recorded.</p>
          </div>
        </div>
        <TabsMinimal
          label="Time range"
          items={[{ id: '24h', label: '24 hours' }, { id: '7d', label: '7 days' }]}
          selectedKey={range}
          onSelectionChange={setRange}
        />
      </div>

      <div className="p-4 md:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Failed sign-ins" value={w.failed_sign_ins} color={COLOR.amber}
                hint="Wrong password, or the account was locked or switched off" />
          <Stat label="Accounts locked" value={w.lockouts} color={COLOR.red}
                hint="Locked after too many wrong passwords" />
          <Stat label="Blocked for trying too fast" value={w.rate_limit_trips} color={COLOR.amber}
                href={logsHref({ event_type: 'auth_event', search: 'rate-limit' })}
                hint="Someone (or a bot) tried to sign in or reset a password too many times in a row" />
          <Stat label="Unsafe sign-ins blocked" value={w.critical_auth_alerts} color={COLOR.critical}
                href={logsHref({ event_type: 'auth_event', level: 'critical' })}
                hint="A copied or old sign-in was used again, or an account was locked for good" />
          <Stat label="Passkey problems" value={w.passkey_failures} color={COLOR.amber}
                href={logsHref({ search: 'webauthn.service' })} />
          <Stat label="Password reset requests" value={w.reset_requests} color={COLOR.cyan} />
          <Stat label="New passkeys set up" value={w.passkeys_enrolled} color={COLOR.cyan} />
          <Stat label="Signed out by the system" value={w.sessions_revoked} color={COLOR.cyan}
                hint="Signed in elsewhere, password reset, deactivation or revoked passkey. Sign-outs are not counted." />
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="overflow-hidden rounded-xl ring-1 ring-[#2a2a2a] ring-inset">
            <Table head={['Most failed sign-ins · 24 hours', 'Count']} minWidth="min-w-[320px]">
              {data.most_failed_accounts.length === 0 ? (
                <EmptyRow cols={2}>No failed sign-ins.</EmptyRow>
              ) : data.most_failed_accounts.map((a) => (
                <tr key={a.email}>
                  <td className="px-4 md:px-6 py-3 text-white break-all">{a.email}</td>
                  <td className="px-4 md:px-6 py-3 font-mono font-semibold text-[#ffea00]">{a.count}</td>
                </tr>
              ))}
            </Table>
          </div>
          {/* Stretched to the row's height; the footer stays at the bottom. */}
          <div className="flex flex-col overflow-hidden rounded-xl ring-1 ring-[#2a2a2a] ring-inset">
            <Table head={['Locked accounts right now', 'Lock']} minWidth="min-w-[420px]">
              {data.locked_accounts.length === 0 ? (
                <EmptyRow cols={2}>No accounts are locked.</EmptyRow>
              ) : data.locked_accounts.slice(0, DASHBOARD_ROWS).map((a) => (
                <tr key={a.user_id}>
                  <td className="px-4 md:px-6 py-3">
                    <p className="text-white">{a.name}</p>
                    <p className="text-xs text-[#818181] break-all">
                      {roleLabel(a.role)} · {a.email}
                      {!a.permanent && a.locked_until && <> · until {formatDateTime(a.locked_until)}</>}
                    </p>
                  </td>
                  <td className="px-4 md:px-6 py-3">
                    <Pill label={a.permanent ? 'Permanently locked' : 'Temporarily locked'} color={a.permanent ? COLOR.critical : COLOR.amber} />
                  </td>
                </tr>
              ))}
            </Table>
            <div className="mt-auto">
              <TableFooter shown={Math.min(data.locked_accounts.length, DASHBOARD_ROWS)} total={data.locked_accounts.length} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[#2a2a2a] px-4 md:px-6 py-3 text-sm text-[#818181]">
        <span>Signed in right now: <span className="font-mono text-white">{data.active_sessions}</span></span>
        <span>
          Password reset requests waiting:{' '}
          <Link href="/it_admin/administrator-management" className={data.open_reset_requests > 0 ? 'font-mono text-[#ffea00] hover:underline' : 'font-mono text-white'}>
            {data.open_reset_requests}
          </Link>
        </span>
      </div>
    </section>
  )
}

// ── E · Accounts ─────────────────────────────────────────────────────────────

function AccountsCard({ data }: { data: ItDashboardSummary['accounts'] }) {
  return (
    <TableCard.Root className="flex flex-col">
      <TableCard.Header
        title="Accounts"
        contentTrailing={<CardLink href="/it_admin/administrator-management">Manage</CardLink>}
      />
      {/* Archived accounts are counted in the Archive module (2026-11-11). */}
      <Table head={['Role', 'Active', 'Locked']} minWidth="min-w-[320px]">
        {data.by_role.map((r) => (
          <tr key={r.role}>
            <td className="px-4 md:px-6 py-3 text-white whitespace-nowrap">{roleLabel(r.role)}</td>
            <td className="px-4 md:px-6 py-3 font-mono text-white">{r.active}</td>
            <td className="px-4 md:px-6 py-3 font-mono" style={{ color: r.permanently_locked ? COLOR.critical : COLOR.muted }}>{r.permanently_locked}</td>
          </tr>
        ))}
      </Table>
      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-[#2a2a2a] p-4 md:px-6">
        <Stat label="Active, never signed in" value={data.never_signed_in} color={COLOR.amber} />
        <Stat label={`No sign-in for ${data.dormant_days} days`} value={data.dormant} color={COLOR.amber} />
      </div>
    </TableCard.Root>
  )
}

// ── Loading ──────────────────────────────────────────────────────────────────

const CARD = 'rounded-xl bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] ring-inset'

/** A table card in grey: title bar, then rows. */
function TableCardSkeleton({ rows }: { rows: number }) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-4 border-b border-[#424242] px-4 py-5 md:px-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="divide-y divide-[#2a2a2a]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-4 md:px-6">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="hidden h-3.5 w-24 sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** The dashboard's own layout in grey, shown until the first load lands. */
function ItDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5 lg:gap-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-12 w-full rounded-xl" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${CARD} space-y-3 px-4 py-4`}>
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48 max-w-full" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ))}
      </div>

      <Skeleton className="h-60 w-full rounded-xl" />

      <div className={CARD}>
        <div className="flex items-center gap-3 border-b border-[#424242] px-4 py-5 md:px-6">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 md:p-6 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2.5 rounded-xl bg-[#141414] px-4 py-3 ring-1 ring-[#2a2a2a] ring-inset">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-6 w-10" />
            </div>
          ))}
        </div>
      </div>

      <TableCardSkeleton rows={4} />
      <TableCardSkeleton rows={5} />
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ItAdminDashboard() {
  const [summary, setSummary]     = useState<ItDashboardSummary | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [now, setNow]             = useState(() => Date.now())
  const [resolving, setResolving] = useState<Set<string>>(new Set())
  const [showDetails, setShowDetails] = useState(false)
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    // Coming back: the last summary shows at once and is re-read behind it.
    type Summary = Awaited<ReturnType<typeof itDashboardService.getSummary>>
    const cached = cachedData<Summary>(['page', 'it-dashboard|summary'])
    if (cached) setSummary((cur) => cur ?? cached)
    else setLoading(true)
    try {
      const data = await itDashboardService.getSummary()
      storeData(['page', 'it-dashboard|summary'], data)
      setSummary(data)
      setError(null)
      setNow(Date.now())
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err.response?.data?.message ?? err.message ?? 'Failed to load the dashboard')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Long debounce: system_logs is a busy topic (scheduler heartbeats, sign-in
  // bursts) and the dashboard only needs to be current, not instant.
  useLiveTable(['live:system_logs', 'live:system_log_issues', 'live:audit_logs', 'live:users', 'live:password_resets'], load, { debounceMs: 5_000 })

  // Staleness ("Late", "x min ago") moves with the clock even when no row does.
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(tick)
  }, [load])

  const act = useCallback(async (issueId: string, body: IssueAction) => {
    setResolving((s) => new Set(s).add(issueId))
    try {
      await systemLogService.actOnIssue(issueId, body)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err.response?.data?.message ?? err.message ?? 'Could not update that issue')
    } finally {
      setResolving((s) => { const n = new Set(s); n.delete(issueId); return n })
    }
  }, [load])

  return (
    // The dashboard shell clips its content area (overflow-hidden), so the page
    // owns its scroll: fill that area and scroll inside it.
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white px-4 py-5 lg:px-8 lg:py-6">

      <div className="flex w-full flex-col gap-5 lg:gap-6">

        {error && (
          <div className="rounded-xl border border-[#f62626]/30 bg-[#f62626]/10 px-4 py-2.5 text-sm text-[#f62626]">
            {error}
          </div>
        )}

        {!summary ? (
          loading && <ItDashboardSkeleton />
        ) : (
          <>
            <OverallBanner summary={summary} />
            {summary.health && <HealthGrid parts={summary.health} />}
            {summary.traffic && <TodayCard t={summary.traffic} />}
            <ProblemsCard data={summary.problems} now={now} onAct={act} busy={resolving} />
            <SecurityCard data={summary.security} />
            <AccountsCard data={summary.accounts} />

            {/* The detail behind the tiles, for whoever has to fix something. */}
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
              className="inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-semibold text-[#e5e5e5] ring-1 ring-[#424242] ring-inset transition [@media(hover:hover)]:hover:bg-[#262626]"
            >
              {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {showDetails ? 'Hide technical details' : 'Show technical details'}
            </button>
            {showDetails && (
              <>
                <SchedulersCard data={summary.schedulers} now={now} />
                <ServicesCard data={summary.services} now={now} />
              </>
            )}
          </>
        )}

        {/* The handover is rare, so it sits below everything else. */}
        <ItAdminHandoverPanel />

        <div className="h-4" />
      </div>
    </div>
  )
}
