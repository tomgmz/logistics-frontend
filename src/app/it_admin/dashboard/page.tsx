'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertOctagon, CheckCircle2, Clock, ExternalLink, Loader2,
  Mail, MapPin, Bell, ScanLine, Cloud, RefreshCw, ShieldAlert, Users, Plug,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Scheduler staleness is a function of time, not of any row changing. */
const POLL_MS = 60_000

const COLOR = {
  cyan:     '#4df9ed',
  green:    '#3af626',
  amber:    '#ffc83c',
  red:      '#ff6060',
  critical: '#ff3030',
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

function Card({ title, subtitle, icon, action, children, className = '' }: {
  title: string; subtitle?: string; icon: ReactNode; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-[#2a2a2a] px-4 py-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4df9ed]/10 text-[#4df9ed]">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-xs text-[#818181] mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  )
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, background: `${color}14`, border: `1px solid ${color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#424242] px-2.5 py-1 text-xs text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
    >
      {children} <ExternalLink size={11} />
    </Link>
  )
}

function Stat({ label, value, color, href, hint }: {
  label: string; value: number; color: string; href?: string; hint?: string
}) {
  const body = (
    <>
      <p className="text-2xl font-bold font-mono leading-none" style={{ color: value > 0 ? color : COLOR.muted }}>
        {value.toLocaleString()}
      </p>
      <p className="mt-1.5 text-[11px] text-[#818181] leading-snug">{label}</p>
    </>
  )
  const cls = 'block rounded-xl border border-[#2a2a2a] bg-[#0a0a0a]/40 px-3 py-2.5 min-w-0'
  return href
    ? <Link href={href} title={hint} className={`${cls} transition hover:border-[#424242] hover:bg-[#2a2a2a]/40`}>{body}</Link>
    : <div title={hint} className={cls}>{body}</div>
}

// ── A · Problems waiting ─────────────────────────────────────────────────────

function ProblemsCard({ data, now, onResolve, resolving }: {
  data: ItDashboardSummary['problems']; now: number
  onResolve: (id: string) => void; resolving: Set<string>
}) {
  const { critical, error, warn } = data.unresolved
  return (
    <Card
      title="Problems waiting"
      subtitle="Unresolved system log entries"
      icon={<AlertOctagon size={15} />}
      action={<CardLink href={logsHref({ resolved: false })}>All unresolved</CardLink>}
      className="lg:col-span-2"
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Critical" value={critical} color={COLOR.critical} href={logsHref({ level: 'critical', resolved: false })} />
        <Stat label="Errors"   value={error}    color={COLOR.red}      href={logsHref({ level: 'error', resolved: false })} />
        <Stat label="Warnings" value={warn}     color={COLOR.amber}    href={logsHref({ level: 'warn', resolved: false })} />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#818181]">
          Newest critical and error entries
        </p>
        {data.latest.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#2a2a2a] px-3 py-4 text-sm text-[#818181]">
            <CheckCircle2 size={15} className="text-[#3af626]" /> Nothing critical or failing is waiting.
          </div>
        ) : (
          <ul className="divide-y divide-[#2a2a2a] rounded-xl border border-[#2a2a2a]">
            {data.latest.map((row) => (
              <li key={row.log_id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill label={LEVEL_LABEL[row.log_level]} color={LEVEL_COLOR[row.log_level]} />
                    <span className="text-[11px] text-[#818181]">{EVENT_LABEL[row.event_type] ?? row.event_type}</span>
                    <span className="font-mono text-[11px] text-[#818181] truncate">{row.source}</span>
                  </div>
                  <p className="mt-1 text-sm text-white break-words">{row.message}</p>
                  <p className="mt-0.5 text-[11px] text-[#818181]" title={formatDateTime(row.timestamp)}>
                    {ago(row.timestamp, now)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onResolve(row.log_id)}
                  disabled={resolving.has(row.log_id)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#3af626]/30 bg-[#3af626]/10 px-2.5 py-1 text-xs font-medium text-[#3af626] transition hover:bg-[#3af626]/20 disabled:opacity-50"
                >
                  {resolving.has(row.log_id) ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Resolve
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

// ── B · Scheduled jobs ───────────────────────────────────────────────────────

function SchedulerRow({ s, now }: { s: SchedulerHealth; now: number }) {
  const st = SCHEDULER_STATUS[s.status]
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{s.label}</p>
          <p className="text-[11px] text-[#818181]">{every(s.interval_minutes)} · {s.description}</p>
        </div>
        <Pill label={st.label} color={st.color} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="text-[#818181]" title={s.last_success_at ? formatDateTime(s.last_success_at) : undefined}>
          Last run: <span className="text-white">{ago(s.last_success_at, now)}</span>
        </span>
        {s.errors_24h > 0 && (
          <Link href={logsHref({ event_type: 'cron_job', search: s.source })} className="text-[#ff6060] hover:underline">
            {s.errors_24h} error{s.errors_24h === 1 ? '' : 's'} today
          </Link>
        )}
      </div>
      {s.status === 'failing' && s.last_error_message && (
        <p className="mt-1 text-[11px] text-[#ff6060] break-words">{s.last_error_message}</p>
      )}
    </li>
  )
}

function SchedulersCard({ data, now }: { data: SchedulerHealth[]; now: number }) {
  return (
    <Card
      title="Scheduled jobs"
      subtitle="Background jobs, checked by their heartbeat"
      icon={<Clock size={15} />}
      action={<CardLink href={logsHref({ event_type: 'cron_job' })}>Job logs</CardLink>}
    >
      <ul className="divide-y divide-[#2a2a2a] rounded-xl border border-[#2a2a2a]">
        {data.map((s) => <SchedulerRow key={s.source} s={s} now={now} />)}
      </ul>
      <p className="mt-2 text-[11px] text-[#818181] leading-snug">
        A job is Late after two missed runs and Stopped after four. That usually means the backend
        server restarted or went to sleep.
      </p>
    </Card>
  )
}

// ── C · External services ────────────────────────────────────────────────────

function ServiceTile({ s, now }: { s: ServiceHealth; now: number }) {
  const st = SERVICE_STATUS[s.status]
  return (
    <div className="flex flex-col rounded-xl border border-[#2a2a2a] bg-[#0a0a0a]/40 p-3 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[#818181]">{SERVICE_ICON[s.key] ?? <Plug size={15} />}</span>
        <p className="text-sm font-medium text-white truncate">{s.label}</p>
      </div>
      <p className="mt-1 text-[11px] text-[#818181] leading-snug">{s.description}</p>
      <div className="mt-2"><Pill label={st.label} color={st.color} /></div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-center">
        {([['Hour', s.failures_1h], ['24 hours', s.failures_24h], ['7 days', s.failures_7d]] as const).map(([label, n]) => (
          <div key={label} className="rounded-lg bg-[#2a2a2a]/40 py-1">
            <p className="font-mono text-sm font-bold" style={{ color: n > 0 ? COLOR.red : COLOR.muted }}>{n}</p>
            <p className="text-[9px] uppercase tracking-wider text-[#818181]">{label}</p>
          </div>
        ))}
      </div>
      {s.last_failure_at && (
        <p className="mt-2 text-[11px] text-[#818181] break-words" title={formatDateTime(s.last_failure_at)}>
          Last failure {ago(s.last_failure_at, now).toLowerCase()}
          {s.last_failure_message && <>: <span className="text-[#ff9a9a]">{s.last_failure_message}</span></>}
        </p>
      )}
    </div>
  )
}

function ServicesCard({ data, now }: { data: ServiceHealth[]; now: number }) {
  return (
    <Card
      title="External services"
      subtitle="Failures recorded when the system called an outside provider"
      icon={<Plug size={15} />}
      action={<CardLink href={logsHref({ event_type: 'external_api' })}>Service logs</CardLink>}
      className="lg:col-span-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
        {data.map((s) => <ServiceTile key={s.key} s={s} now={now} />)}
      </div>
      <p className="mt-2 text-[11px] text-[#818181] leading-snug">
        Only failures are recorded, so &ldquo;No failures recorded&rdquo; means nothing has gone wrong. It does not
        prove the provider was called.
      </p>
    </Card>
  )
}

// ── D · Sign-in security ─────────────────────────────────────────────────────

function SecurityCard({ data }: { data: ItDashboardSummary['security'] }) {
  const [range, setRange] = useState<'24h' | '7d'>('24h')
  const w: SecurityWindow = range === '24h' ? data.last_24h : data.last_7d

  return (
    <Card
      title="Sign-in security"
      subtitle="Counts and accounts only. IP addresses are never recorded."
      icon={<ShieldAlert size={15} />}
      className="lg:col-span-2"
      action={
        <div className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#0a0a0a]/40 p-0.5">
          {(['24h', '7d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                range === r ? 'bg-[#4df9ed] text-[#0a0a0a]' : 'text-[#818181] hover:text-white'
              }`}
            >
              {r === '24h' ? '24 hours' : '7 days'}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#818181]">
            Most failed sign-ins · 24 hours
          </p>
          {data.most_failed_accounts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#2a2a2a] px-3 py-3 text-xs text-[#818181]">No failed sign-ins.</p>
          ) : (
            <ul className="divide-y divide-[#2a2a2a] rounded-xl border border-[#2a2a2a]">
              {data.most_failed_accounts.map((a) => (
                <li key={a.email} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="truncate text-white">{a.email}</span>
                  <span className="font-mono font-bold text-[#ffc83c]">{a.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#818181]">
            Locked accounts right now
          </p>
          {data.locked_accounts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#2a2a2a] px-3 py-3 text-xs text-[#818181]">No accounts are locked.</p>
          ) : (
            <ul className="divide-y divide-[#2a2a2a] rounded-xl border border-[#2a2a2a]">
              {data.locked_accounts.map((a) => (
                <li key={a.user_id} className="px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-white">{a.name}</span>
                    <Pill label={a.permanent ? 'Permanently locked' : 'Temporarily locked'} color={a.permanent ? COLOR.critical : COLOR.amber} />
                  </div>
                  <p className="mt-0.5 text-[#818181] truncate">
                    {roleLabel(a.role)} · {a.email}
                    {!a.permanent && a.locked_until && <> · until {formatDateTime(a.locked_until)}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#818181]">
        <span>Signed-in sessions now: <span className="font-mono text-white">{data.active_sessions}</span></span>
        <span>
          Open password reset requests:{' '}
          <Link href="/it_admin/administrator-management" className={data.open_reset_requests > 0 ? 'font-mono text-[#ffc83c] hover:underline' : 'font-mono text-white'}>
            {data.open_reset_requests}
          </Link>
        </span>
      </div>
    </Card>
  )
}

// ── E · Accounts ─────────────────────────────────────────────────────────────

function AccountsCard({ data, now }: { data: ItDashboardSummary['accounts']; now: number }) {
  return (
    <Card
      title="Accounts"
      subtitle={`${data.total_active} active accounts`}
      icon={<Users size={15} />}
      action={<CardLink href="/it_admin/administrator-management">Manage</CardLink>}
    >
      <div className="overflow-x-auto rounded-xl border border-[#2a2a2a]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#2a2a2a]/40 text-[10px] uppercase tracking-wider text-[#818181]">
              <th className="px-3 py-2 text-left font-semibold">Role</th>
              <th className="px-2 py-2 text-right font-semibold">Active</th>
              <th className="px-2 py-2 text-right font-semibold">Inactive</th>
              <th className="px-2 py-2 text-right font-semibold">Locked</th>
              <th className="px-3 py-2 text-right font-semibold">Archived</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {data.by_role.map((r) => (
              <tr key={r.role}>
                <td className="px-3 py-1.5 text-white whitespace-nowrap">{roleLabel(r.role)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-white">{r.active}</td>
                <td className="px-2 py-1.5 text-right font-mono" style={{ color: r.inactive ? COLOR.amber : COLOR.muted }}>{r.inactive}</td>
                <td className="px-2 py-1.5 text-right font-mono" style={{ color: r.permanently_locked ? COLOR.critical : COLOR.muted }}>{r.permanently_locked}</td>
                <td className="px-3 py-1.5 text-right font-mono text-[#818181]">{r.archived}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat label="Active, never signed in" value={data.never_signed_in} color={COLOR.amber} />
        <Stat label={`No sign-in for ${data.dormant_days} days`} value={data.dormant} color={COLOR.amber} />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#818181]">IT Administrator</p>
        {data.it_admin ? (
          <div className="rounded-xl border border-[#2a2a2a] px-3 py-2 text-xs">
            <p className="text-sm font-medium text-white">{data.it_admin.name}</p>
            <p className="text-[#818181] truncate">{data.it_admin.email}</p>
            <p className="mt-1 text-[#818181]">
              Last sign-in: <span className="text-white" title={data.it_admin.last_login_at ? formatDateTime(data.it_admin.last_login_at) : undefined}>
                {ago(data.it_admin.last_login_at, now)}
              </span>
            </p>
            <p className="mt-0.5 text-[#818181]">
              Last handover:{' '}
              {data.last_handover
                ? <span className="text-white" title={data.last_handover.description}>{formatDateTime(data.last_handover.at)}</span>
                : <span>None recorded</span>}
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-[#ff3030]/40 bg-[#ff3030]/10 px-3 py-2 text-xs text-[#ff6060]">
            No active IT Administrator. Staff password resets cannot be handled until one is set.
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#818181]">
          Company Administrators · {data.administrators.length}
        </p>
        <ul className="divide-y divide-[#2a2a2a] rounded-xl border border-[#2a2a2a]">
          {data.administrators.map((a) => (
            <li key={a.user_id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <div className="min-w-0">
                <p className="truncate text-white">{a.name}</p>
                <p className="truncate text-[#818181]">{a.email}</p>
              </div>
              <div className="shrink-0 text-right">
                {a.status !== 'active' && <Pill label={a.status === 'inactive' ? 'Inactive' : 'Locked'} color={COLOR.amber} />}
                <p className={a.last_login_at ? 'text-[#818181]' : 'text-[#ffc83c]'}
                   title={a.last_login_at ? formatDateTime(a.last_login_at) : undefined}>
                  {a.last_login_at ? ago(a.last_login_at, now) : 'Never signed in'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
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
      <div className="flex items-center gap-2 rounded-2xl border border-[#3af626]/25 bg-[#3af626]/[0.06] px-4 py-3 text-sm text-[#3af626]">
        <CheckCircle2 size={16} /> All systems normal. Nothing needs your attention.
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-[#ff6060]/30 bg-[#ff6060]/[0.06] px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#ff6060]">
        <AlertOctagon size={16} /> {items.length} item{items.length === 1 ? '' : 's'} need{items.length === 1 ? 's' : ''} attention
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-[#ff9a9a] list-disc">
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
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#0a0a0a] text-white px-3 py-3 lg:px-4">

      <div className="mx-auto flex max-w-[1600px] flex-col gap-3">

        <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-xs text-[#818181]">System health, sign-in security and accounts</p>
          </div>
          <div className="flex items-center gap-3">
            {summary && (
              <span className="text-xs text-[#818181]" title={formatDateTime(summary.generated_at)}>
                Updated {ago(summary.generated_at, now).toLowerCase()}
              </span>
            )}
            <button
              onClick={() => load()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-[#424242] px-3 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-40"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[#ff6060]/30 bg-[#ff6060]/10 px-4 py-2.5 text-sm text-[#ff6060]">
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <ProblemsCard data={summary.problems} now={now} onResolve={resolve} resolving={resolving} />
              <SchedulersCard data={summary.schedulers} now={now} />
              <ServicesCard data={summary.services} now={now} />
              <SecurityCard data={summary.security} />
              <AccountsCard data={summary.accounts} now={now} />
            </div>
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  )
}
