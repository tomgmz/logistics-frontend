'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertOctagon, CheckCircle2, ExternalLink, Loader2,
  Mail, MapPin, Bell, ScanLine, Cloud, ShieldAlert, Plug,
} from 'lucide-react'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { systemLogService, type SystemLogEventType, type SystemLogLevel } from '@/lib/services/admin/system-logs.service'
import {
  itDashboardService,
  type ItDashboardSummary,
  type SchedulerHealth,
  type SchedulerStatus,
  type ServiceHealth,
  type ServiceStatus,
  type SecurityWindow,
} from '@/lib/services/admin/it-dashboard.service'
import { formatDateTime } from '@/app/utils/timeFormat'
import { roleLabel } from '@/lib/roles'

import RefreshButton from '@/components/ui/RefreshButton'
import ItAdminHandoverPanel from '@/components/admin/ItAdminHandoverPanel'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
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

const LEVEL_COLOR: Record<SystemLogLevel, string> = {
  info:     COLOR.cyan,
  warn:     COLOR.amber,
  error:    COLOR.red,
  critical: COLOR.critical,
}

const LEVEL_LABEL: Record<SystemLogLevel, string> = {
  info: 'Info', warn: 'Warning', error: 'Error', critical: 'Critical',
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
  'cloudinary':    <Cloud size={15} />,
  'google-maps':   <MapPin size={15} />,
  'push':          <Bell size={15} />,
  'google-vision': <ScanLine size={15} />,
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
function logsHref(params: { level?: SystemLogLevel; event_type?: SystemLogEventType; search?: string; resolved?: boolean } = {}) {
  const q = new URLSearchParams({ tab: 'system' })
  if (params.level)      q.set('level', params.level)
  if (params.event_type) q.set('event_type', params.event_type)
  if (params.search)     q.set('search', params.search)
  if (params.resolved !== undefined) q.set('resolved', String(params.resolved))
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
      <table className={`w-full text-sm ${minWidth}`}>
        <thead className={`bg-[#222222] ${SC}`}>
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

/** Untitled UI's simple metric card: label, big number, link in the footer. */
function MetricCard({ label, value, color, href, linkLabel }: {
  label: string; value: number; color: string; href: string; linkLabel: string
}) {
  return (
    <div className="flex flex-col rounded-xl bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] min-w-0">
      <div className="flex flex-col gap-2 px-4 py-5 md:px-5">
        <p className="text-sm font-medium text-[#818181]">{label}</p>
        <p className="text-3xl font-semibold leading-none font-mono" style={{ color: value > 0 ? color : COLOR.muted }}>
          {value.toLocaleString()}
        </p>
      </div>
      <div className="flex justify-end border-t border-[#2a2a2a] px-4 py-3 md:px-5">
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-[#e5e5e5] [@media(hover:hover)]:hover:text-white">
          {linkLabel} <ExternalLink size={13} className="text-[#818181]" />
        </Link>
      </div>
    </div>
  )
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
    ? <Link href={href} title={hint} className={`${cls} transition [@media(hover:hover)]:hover:ring-[#424242]`}>{body}</Link>
    : <div title={hint} className={cls}>{body}</div>
}

// ── A · Problems waiting ─────────────────────────────────────────────────────

function ProblemMetrics({ data }: { data: ItDashboardSummary['problems'] }) {
  const { critical, error, warn } = data.unresolved
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
      <MetricCard label="Unresolved critical" value={critical} color={COLOR.critical}
                  href={logsHref({ level: 'critical', resolved: false })} linkLabel="View critical" />
      <MetricCard label="Unresolved errors" value={error} color={COLOR.red}
                  href={logsHref({ level: 'error', resolved: false })} linkLabel="View errors" />
      <MetricCard label="Unresolved warnings" value={warn} color={COLOR.amber}
                  href={logsHref({ level: 'warn', resolved: false })} linkLabel="View warnings" />
    </div>
  )
}

function ProblemsCard({ data, now, onResolve, resolving }: {
  data: ItDashboardSummary['problems']; now: number
  onResolve: (id: string) => void; resolving: Set<string>
}) {
  return (
    <TableCard.Root>
      <TableCard.Header
        title="Problems waiting"
        contentTrailing={<CardLink href={logsHref({ resolved: false })}>All unresolved</CardLink>}
      />
      <Table head={['Level', 'Type', 'Message', 'When', '']} minWidth="min-w-[760px]">
        {data.latest.length === 0 ? (
          <EmptyRow cols={5}>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={15} className="text-[#3af626]" /> Nothing critical or failing is waiting.
            </span>
          </EmptyRow>
        ) : data.latest.map((row) => (
          <tr key={row.log_id}>
            <td className={`${TD} whitespace-nowrap`}><Pill label={LEVEL_LABEL[row.log_level]} color={LEVEL_COLOR[row.log_level]} /></td>
            <td className={TD}>
              <p className="whitespace-nowrap text-white">{EVENT_LABEL[row.event_type] ?? row.event_type}</p>
              <p className="font-mono text-xs text-[#818181] break-all">{row.source}</p>
            </td>
            <td className={`${TD} text-white break-words`}>{row.message}</td>
            <td className={`${TD} whitespace-nowrap text-[#c4c4c4]`} title={formatDateTime(row.timestamp)}>
              {ago(row.timestamp, now)}
            </td>
            <td className={`${TD} text-right`}>
              <button
                type="button"
                onClick={() => onResolve(row.log_id)}
                disabled={resolving.has(row.log_id)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#3af626]/30 bg-[#3af626]/10 px-2.5 py-1 text-xs font-medium text-[#3af626] transition [@media(hover:hover)]:hover:bg-[#3af626]/20 disabled:opacity-50"
              >
                {resolving.has(row.log_id) ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Resolve
              </button>
            </td>
          </tr>
        ))}
      </Table>
    </TableCard.Root>
  )
}

// ── B · Scheduled jobs ───────────────────────────────────────────────────────

function SchedulersCard({ data, now }: { data: SchedulerHealth[]; now: number }) {
  return (
    <TableCard.Root>
      <TableCard.Header
        title="Scheduled jobs"
        contentTrailing={<CardLink href={logsHref({ event_type: 'cron_job' })}>Job logs</CardLink>}
      />
      <Table head={['Job', 'Runs', 'Status', 'Last run', 'Errors today']} minWidth="min-w-[820px]">
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
              <td className={`${TD} whitespace-nowrap text-[#c4c4c4]`}>{every(s.interval_minutes)}</td>
              <td className={TD}><Pill label={st.label} color={st.color} /></td>
              <td className={`${TD} whitespace-nowrap text-[#c4c4c4]`} title={s.last_success_at ? formatDateTime(s.last_success_at) : undefined}>
                {ago(s.last_success_at, now)}
              </td>
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
        A job is Late after two missed runs and Stopped after four. That usually means the backend
        server restarted or went to sleep.
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
        title="External services"
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
                    <p className="whitespace-nowrap text-[#c4c4c4]" title={formatDateTime(s.last_failure_at)}>{ago(s.last_failure_at, now)}</p>
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
            <h2 className="text-base font-semibold text-white">Sign-in security</h2>
            <p className="text-sm text-[#818181]">Counts and accounts only. IP addresses are never recorded.</p>
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
                hint="Wrong password, or a locked or inactive account" />
          <Stat label="Account lockouts" value={w.lockouts} color={COLOR.red} />
          <Stat label="Rate limit hits" value={w.rate_limit_trips} color={COLOR.amber}
                href={logsHref({ event_type: 'auth_event', search: 'rate-limit' })}
                hint="Too many requests to sign-in or reset endpoints" />
          <Stat label="Critical sign-in alerts" value={w.critical_auth_alerts} color={COLOR.critical}
                href={logsHref({ event_type: 'auth_event', level: 'critical' })}
                hint="Permanent lockouts and reuse of an already-replaced session token" />
          <Stat label="Passkey failures" value={w.passkey_failures} color={COLOR.amber}
                href={logsHref({ search: 'webauthn.service' })} />
          <Stat label="Password reset requests" value={w.reset_requests} color={COLOR.cyan} />
          <Stat label="Passkeys enrolled" value={w.passkeys_enrolled} color={COLOR.cyan} />
          <Stat label="Sessions ended by the system" value={w.sessions_revoked} color={COLOR.cyan}
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
          <div className="overflow-hidden rounded-xl ring-1 ring-[#2a2a2a] ring-inset">
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
            <TableFooter shown={Math.min(data.locked_accounts.length, DASHBOARD_ROWS)} total={data.locked_accounts.length} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[#2a2a2a] px-4 md:px-6 py-3 text-sm text-[#818181]">
        <span>Signed-in sessions now: <span className="font-mono text-white">{data.active_sessions}</span></span>
        <span>
          Open password reset requests:{' '}
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
      <Table head={['Role', 'Active', 'Revoked', 'Locked', 'Archived']} minWidth="min-w-[520px]">
        {data.by_role.map((r) => (
          <tr key={r.role}>
            <td className="px-4 md:px-6 py-3 text-white whitespace-nowrap">{roleLabel(r.role)}</td>
            <td className="px-4 md:px-6 py-3 font-mono text-white">{r.active}</td>
            <td className="px-4 md:px-6 py-3 font-mono" style={{ color: r.inactive ? COLOR.amber : COLOR.muted }}>{r.inactive}</td>
            <td className="px-4 md:px-6 py-3 font-mono" style={{ color: r.permanently_locked ? COLOR.critical : COLOR.muted }}>{r.permanently_locked}</td>
            <td className="px-4 md:px-6 py-3 font-mono text-[#818181]">{r.archived}</td>
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

function AdministratorsCard({ data, now }: { data: ItDashboardSummary['accounts']; now: number }) {
  const lastSignIn = (iso: string | null) => (
    <span className={iso ? 'text-[#c4c4c4]' : 'text-[#ffea00]'} title={iso ? formatDateTime(iso) : undefined}>
      {iso ? ago(iso, now) : 'Never signed in'}
    </span>
  )
  // The IT Administrator counts as one of the five rows.
  const total  = data.administrators.length + (data.it_admin ? 1 : 0)
  const admins = data.administrators.slice(0, DASHBOARD_ROWS - (data.it_admin ? 1 : 0))
  return (
    <TableCard.Root className="flex flex-col">
      <TableCard.Header
        title="Administrators"
      />
      {!data.it_admin && (
        <p className="border-b border-[#424242] bg-[#f62626]/10 px-4 md:px-6 py-3 text-sm text-[#f62626]">
          No active IT Administrator. Staff password resets cannot be handled until one is set.
        </p>
      )}
      <Table head={['Name', 'Role', 'Status', 'Last sign-in']} minWidth="min-w-[640px]">
        {data.it_admin && (
          <tr>
            <td className="px-4 md:px-6 py-3">
              <p className="text-white">{data.it_admin.name}</p>
              <p className="text-xs text-[#818181] break-all">{data.it_admin.email}</p>
            </td>
            <td className="px-4 md:px-6 py-3 whitespace-nowrap text-[#c4c4c4]">IT Administrator</td>
            <td className="px-4 md:px-6 py-3"><Pill label="Active" color={COLOR.green} /></td>
            <td className="px-4 md:px-6 py-3 whitespace-nowrap">{lastSignIn(data.it_admin.last_login_at)}</td>
          </tr>
        )}
        {admins.map((a) => (
          <tr key={a.user_id}>
            <td className="px-4 md:px-6 py-3">
              <p className="text-white">{a.name}</p>
              <p className="text-xs text-[#818181] break-all">{a.email}</p>
            </td>
            <td className="px-4 md:px-6 py-3 whitespace-nowrap text-[#c4c4c4]">Company Administrator</td>
            <td className="px-4 md:px-6 py-3">
              {a.status === 'active'
                ? <Pill label="Active" color={COLOR.green} />
                : <Pill label={a.status === 'inactive' ? 'Revoked' : 'Locked'} color={COLOR.amber} />}
            </td>
            <td className="px-4 md:px-6 py-3 whitespace-nowrap">{lastSignIn(a.last_login_at)}</td>
          </tr>
        ))}
      </Table>
      <div className="mt-auto">
        <TableFooter shown={(data.it_admin ? 1 : 0) + admins.length} total={total} />
      </div>
    </TableCard.Root>
  )
}

// ── Overall banner ───────────────────────────────────────────────────────────

function attentionItems(s: ItDashboardSummary): string[] {
  const items: string[] = []
  const { critical, error } = s.problems.unresolved
  if (critical) items.push(`${critical} unresolved critical log entr${critical === 1 ? 'y' : 'ies'}`)
  if (error)    items.push(`${error} unresolved error${error === 1 ? '' : 's'}`)
  for (const j of s.schedulers) {
    if (j.status === 'down')    items.push(`${j.label} has stopped`)
    if (j.status === 'late')    items.push(`${j.label} is late`)
    if (j.status === 'failing') items.push(`${j.label} is failing`)
  }
  for (const v of s.services) if (v.status === 'failing') items.push(`${v.label} is failing`)
  const locked = s.security.locked_accounts.length
  if (locked) items.push(`${locked} locked account${locked === 1 ? '' : 's'}`)
  if (!s.accounts.it_admin) items.push('No active IT Administrator')
  return items
}

function StatusBanner({ summary }: { summary: ItDashboardSummary }) {
  const items = attentionItems(summary)
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#3af626]/25 bg-[#3af626]/[0.06] px-4 py-3 text-sm text-[#3af626]">
        <CheckCircle2 size={16} /> All systems normal. Nothing needs your attention.
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-[#f62626]/30 bg-[#f62626]/[0.06] px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#f62626]">
        <AlertOctagon size={16} /> {items.length} item{items.length === 1 ? '' : 's'} need{items.length === 1 ? 's' : ''} attention
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-[#f62626] list-disc">
        {items.map((t) => <li key={t}>{t}</li>)}
      </ul>
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
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const data = await itDashboardService.getSummary()
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
  useLiveTable(['live:system_logs', 'live:audit_logs', 'live:users', 'live:password_resets'], load, { debounceMs: 5_000 })

  // Staleness ("Late", "x min ago") moves with the clock even when no row does.
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => window.clearInterval(tick)
  }, [load])

  const resolve = useCallback(async (id: string) => {
    setResolving((s) => new Set(s).add(id))
    try {
      await systemLogService.setResolved(id, true)
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err.response?.data?.message ?? err.message ?? 'Could not resolve that entry')
    } finally {
      setResolving((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }, [load])

  return (
    // The dashboard shell clips its content area (overflow-hidden), so the page
    // owns its scroll: fill that area and scroll inside it.
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#0a0a0a] text-white px-4 py-5 lg:px-8 lg:py-6">

      <div className="flex w-full flex-col gap-5 lg:gap-6">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {summary && (
              <p className="text-sm text-[#818181]" title={formatDateTime(summary.generated_at)}>
                Updated {ago(summary.generated_at, now).toLowerCase()}
              </p>
            )}
          </div>
          <RefreshButton onClick={() => load()} loading={loading} disabled={loading} />
        </div>

        <ItAdminHandoverPanel />

        {error && (
          <div className="rounded-xl border border-[#f62626]/30 bg-[#f62626]/10 px-4 py-2.5 text-sm text-[#f62626]">
            {error}
          </div>
        )}

        {!summary ? (
          loading && (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-[#818181]">
              <Loader2 size={16} className="animate-spin" /> Loading dashboard…
            </div>
          )
        ) : (
          <>
            <StatusBanner summary={summary} />
            <ProblemMetrics data={summary.problems} />
            <SecurityCard data={summary.security} />
            <ProblemsCard data={summary.problems} now={now} onResolve={resolve} resolving={resolving} />
            <SchedulersCard data={summary.schedulers} now={now} />
            <ServicesCard data={summary.services} now={now} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6">
              <AccountsCard data={summary.accounts} />
              <AdministratorsCard data={summary.accounts} now={now} />
            </div>
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  )
}
