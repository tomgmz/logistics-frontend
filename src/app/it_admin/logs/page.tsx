'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, ScrollText, Server } from 'lucide-react'
import {
  auditLogService,
  type AuditLog,
  type LogStats,
  type LogType,
} from '@/lib/services/admin/audit-logs.service'
import { formatDate, formatTime, formatDateTime } from '@/app/utils/timeFormat'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SystemLogLevel     = 'info' | 'warn' | 'error' | 'critical'
export type SystemLogEventType = 'server_error' | 'auth_event' | 'email_event' | 'external_api' | 'cron_job' | 'db_event'

export interface AppSystemLog {
  log_id:     string
  timestamp:  string
  log_level:  SystemLogLevel
  event_type: SystemLogEventType
  source:     string
  message:    string
  metadata?:  Record<string, unknown>
  resolved:   boolean
}

export interface SystemLogStats {
  total:      number
  info:       number
  warn:       number
  error:      number
  critical:   number
  unresolved: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIT_BADGE: Record<LogType, string> = {
  user_activity:    'bg-[rgba(77,249,237,0.12)] text-[#4df9ed] border border-[rgba(77,249,237,0.25)]',
  admin_activity:   'bg-[rgba(255,140,0,0.10)] text-[#ff9a3c] border border-[rgba(255,140,0,0.25)]',
  vehicle_activity: 'bg-[rgba(58,246,38,0.10)] text-[#3af626] border border-[rgba(58,246,38,0.25)]',
  booking:          'bg-[rgba(255,200,60,0.10)] text-[#ffc83c] border border-[rgba(255,200,60,0.25)]',
  payment:          'bg-[rgba(160,120,255,0.12)] text-[#b08aff] border border-[rgba(160,120,255,0.25)]',
  system_error:     'bg-[rgba(255,80,80,0.10)] text-[#ff6060] border border-[rgba(255,80,80,0.25)]',
}

const LEVEL_BADGE: Record<SystemLogLevel, string> = {
  info:     'bg-[rgba(77,249,237,0.12)] text-[#4df9ed] border border-[rgba(77,249,237,0.25)]',
  warn:     'bg-[rgba(255,200,60,0.10)] text-[#ffc83c] border border-[rgba(255,200,60,0.25)]',
  error:    'bg-[rgba(255,80,80,0.10)] text-[#ff6060] border border-[rgba(255,80,80,0.25)]',
  critical: 'bg-[rgba(255,50,50,0.18)] text-[#ff3030] border border-[rgba(255,50,50,0.40)]',
}

const EVENT_BADGE: Record<SystemLogEventType, string> = {
  server_error: 'bg-[rgba(255,80,80,0.10)] text-[#ff6060] border border-[rgba(255,80,80,0.25)]',
  auth_event:   'bg-[rgba(160,120,255,0.12)] text-[#b08aff] border border-[rgba(160,120,255,0.25)]',
  email_event:  'bg-[rgba(77,249,237,0.12)] text-[#4df9ed] border border-[rgba(77,249,237,0.25)]',
  external_api: 'bg-[rgba(58,246,38,0.10)] text-[#3af626] border border-[rgba(58,246,38,0.25)]',
  cron_job:     'bg-[rgba(255,200,60,0.10)] text-[#ffc83c] border border-[rgba(255,200,60,0.25)]',
  db_event:     'bg-[rgba(255,140,0,0.10)] text-[#ff9a3c] border border-[rgba(255,140,0,0.25)]',
}

const PAGE_SIZE = 15

type ActiveTab = 'audit' | 'system'

// ─── Audit Logs Tab ──────────────────────────────────────────────────────────

interface AuditLogsTabProps {
  stats: LogStats | null
}

function AuditLogsTab({ stats }: AuditLogsTabProps) {
  const [logs, setLogs]                       = useState<AuditLog[]>([])
  const [total, setTotal]                     = useState(0)
  const [page, setPage]                       = useState(1)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [logType, setLogType]                 = useState<LogType | ''>('')
  const [sort, setSort]                       = useState<'desc' | 'asc'>('desc')
  const [selected, setSelected]               = useState<AuditLog | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, logType, sort])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await auditLogService.getAll({
        sort,
        ...(logType         && { log_type: logType }),
        ...(debouncedSearch && { search: debouncedSearch }),
      })
      setLogs(res.data)
      setTotal(res.total)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err.response?.data?.message ?? err.message ?? 'Failed to fetch logs')
    } finally {
      setLoading(false)
    }
  }, [sort, logType, debouncedSearch])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPages    = Math.ceil(total / PAGE_SIZE)
  const safePage      = Math.min(page, Math.max(1, totalPages))
  const displayedLogs = logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const displayName = (log: AuditLog) => {
    if (!log.users) return '—'
    const { first_name, last_name } = log.users
    if (first_name || last_name) return [first_name, last_name].filter(Boolean).join(' ')
    return '—'
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-hidden">

      {/* Stats — outside the table */}
      {stats && (
        <div className="flex flex-wrap gap-3 shrink-0">
          {(
            [
              ['Total',    stats.total,            '#ffffff'],
              ['Activity', stats.user_activity,    '#4df9ed'],
              ['Admin',    stats.admin_activity,   '#ff9a3c'],
              ['Vehicles', stats.vehicle_activity, '#3af626'],
              ['Bookings', stats.booking,          '#ffc83c'],
              ['Payment',  stats.payment,          '#b08aff'],
              ['Errors',   stats.system_error,     '#ff6060'],
            ] as [string, number, string][]
          ).map(([label, val, color]) => (
            <div key={label} className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] px-4 py-2 text-center min-w-[72px]">
              <p className="text-2xl font-bold font-mono" style={{ color }}>{val}</p>
              <p className="text-[9px] uppercase tracking-widest text-[#818181] mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table container */}
      <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] overflow-hidden">

        {/* Toolbar */}
        <div className="shrink-0 border-b border-[#2a2a2a] px-4 py-3 flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="Search actions or descriptions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] bg-[#2a2a2a]/60 border border-[#424242] rounded-lg px-3 py-2 text-sm text-white placeholder-[#818181] outline-none focus:border-[#4df9ed] focus:ring-1 focus:ring-[#4df9ed]/20 transition-colors font-body"
          />
          <select
            value={logType}
            onChange={e => setLogType(e.target.value as LogType | '')}
            className="bg-[#2a2a2a]/60 border border-[#424242] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#4df9ed] cursor-pointer font-body"
          >
            <option value="">All Types</option>
            <option value="user_activity">User Activity</option>
            <option value="admin_activity">Admin Activity</option>
            <option value="vehicle_activity">Vehicle Activity</option>
            <option value="booking">Booking</option>
            <option value="payment">Payment</option>
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as 'asc' | 'desc')}
            className="bg-[#2a2a2a]/60 border border-[#424242] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#4df9ed] cursor-pointer font-body"
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-[#424242] px-3 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <span className="ml-auto text-xs text-[#818181]">{total} records</span>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="shrink-0 border-b border-[#2a2a2a] bg-[#131313] px-5 py-4 text-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[#4df9ed] font-bold">
                Log Detail — {selected.log_id.slice(0, 8).toUpperCase()}
              </span>
              <button onClick={() => setSelected(null)} className="text-[#818181] hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {([
                ['Log ID',      selected.log_id],
                ['Timestamp',   formatDateTime(selected.timestamp)],
                ['Type',        selected.log_type],
                ['Action',      selected.action],
                ['Description', selected.description ?? '—'],
                ['User',        displayName(selected)],
                ['Role',        selected.users?.role ?? '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="text-[#818181] text-[10px] uppercase tracking-[0.1em] w-24 flex-shrink-0 pt-0.5">{k}</span>
                  <span className="text-[#e0e0e0] break-all font-mono text-xs">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#1b1b1b]">
                <tr className="border-b border-[#2a2a2a]">
                  {['Timestamp', 'Type', 'Action', 'Description', 'User'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-b border-[#2a2a2a]/60">
                    <td className="px-4 py-3.5">
                      <div className="h-2.5 w-16 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      <div className="mt-1.5 h-2.5 w-20 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40 + 20}ms` }} />
                    </td>
                    <td className="px-4 py-3.5"><div className="h-4 w-20 animate-pulse rounded-full bg-[#2a2a2a]" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-28 animate-pulse rounded bg-[#2a2a2a]" /></td>
                    <td className="px-4 py-3.5"><div className="h-3 w-48 animate-pulse rounded bg-[#2a2a2a]" /></td>
                    <td className="px-4 py-3.5">
                      <div className="h-3 w-24 animate-pulse rounded bg-[#2a2a2a]" />
                      <div className="mt-1.5 h-2 w-14 animate-pulse rounded bg-[#2a2a2a]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="text-center py-16 text-[#424242] text-sm tracking-wide">No logs match your filters.</div>
          )}

          {!loading && logs.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#1b1b1b]">
                <tr className="border-b border-[#2a2a2a]">
                  {['Timestamp', 'Type', 'Action', 'Description', 'User'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedLogs.map(log => (
                  <tr
                    key={log.log_id}
                    onClick={() => setSelected(prev => prev?.log_id === log.log_id ? null : log)}
                    className={`border-b border-[#2a2a2a]/60 transition-colors cursor-pointer ${
                      selected?.log_id === log.log_id
                        ? 'bg-[rgba(77,249,237,0.06)] border-l-2 border-l-[#4df9ed]'
                        : 'hover:bg-[#2a2a2a]/40'
                    }`}
                  >
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="text-[#818181] text-[10px]">{formatDate(log.timestamp)}</div>
                      <div className="text-[#c0c0c0] text-[11px] font-mono">{formatTime(log.timestamp)}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.1em] whitespace-nowrap ${AUDIT_BADGE[log.log_type]}`}>
                        {log.log_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[10px] text-[#b0b0b0] bg-[#2a2a2a] rounded px-1.5 py-0.5">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#e0e0e0] max-w-xs truncate">{log.description ?? '—'}</td>
                    <td className="px-4 py-3.5 text-xs text-[#c0c0c0]">
                      <p className="font-medium text-white">{displayName(log)}</p>
                      {log.users?.role && (
                        <p className="text-[#818181] text-[9px] uppercase tracking-wide">{log.users.role}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="shrink-0 border-t border-[#2a2a2a] px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#818181]">Page {safePage} of {totalPages} &mdash; {total} records</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="rounded-lg p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const n = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i
                  return (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`h-7 w-7 rounded-lg text-xs font-medium transition ${
                        n === safePage ? 'bg-[#4df9ed] text-[#0a0a0a]' : 'text-[#818181] hover:bg-[#2a2a2a] hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="rounded-lg p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-30"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── System Logs Tab ─────────────────────────────────────────────────────────

interface SystemLogsTabProps {
  stats: SystemLogStats | null
}

function SystemLogsTab({ stats }: SystemLogsTabProps) {
  const [logs, setLogs]                       = useState<AppSystemLog[]>([])
  const [total, setTotal]                     = useState(0)
  const [page, setPage]                       = useState(1)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [eventType, setEventType]             = useState<SystemLogEventType | ''>('')
  const [level, setLevel]                     = useState<SystemLogLevel | ''>('')
  const [sort, setSort]                       = useState<'desc' | 'asc'>('desc')
  const [selected, setSelected]               = useState<AppSystemLog | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, eventType, level, sort])

  // TODO: replace with real systemLogsService.getAll() call
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // const res = await systemLogsService.getAll({ sort, event_type: eventType, level, search: debouncedSearch })
      // setLogs(res.data)
      // setTotal(res.total)
      await new Promise(r => setTimeout(r, 600))
      setLogs([])
      setTotal(0)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err.response?.data?.message ?? err.message ?? 'Failed to fetch system logs')
    } finally {
      setLoading(false)
    }
  }, [sort, eventType, level, debouncedSearch])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPages    = Math.ceil(total / PAGE_SIZE)
  const safePage      = Math.min(page, Math.max(1, totalPages))
  const displayedLogs = logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-hidden">

      {/* Stats — outside the table */}
      {stats && (
        <div className="flex flex-wrap gap-3 shrink-0">
          {(
            [
              ['Total',      stats.total,      '#ffffff'],
              ['Info',       stats.info,       '#4df9ed'],
              ['Warn',       stats.warn,       '#ffc83c'],
              ['Error',      stats.error,      '#ff6060'],
              ['Critical',   stats.critical,   '#ff3030'],
              ['Unresolved', stats.unresolved, '#ff9a3c'],
            ] as [string, number, string][]
          ).map(([label, val, color]) => (
            <div key={label} className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] px-4 py-2 text-center min-w-[72px]">
              <p className="text-2xl font-bold font-mono" style={{ color }}>{val}</p>
              <p className="text-[9px] uppercase tracking-widest text-[#818181] mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table container */}
      <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] overflow-hidden">

        {/* Toolbar */}
        <div className="shrink-0 border-b border-[#2a2a2a] px-4 py-3 flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="Search source or message…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] bg-[#2a2a2a]/60 border border-[#424242] rounded-lg px-3 py-2 text-sm text-white placeholder-[#818181] outline-none focus:border-[#4df9ed] focus:ring-1 focus:ring-[#4df9ed]/20 transition-colors font-body"
          />
          <select
            value={eventType}
            onChange={e => setEventType(e.target.value as SystemLogEventType | '')}
            className="bg-[#2a2a2a]/60 border border-[#424242] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#4df9ed] cursor-pointer font-body"
          >
            <option value="">All Events</option>
            <option value="server_error">Server Error</option>
            <option value="auth_event">Auth Event</option>
            <option value="email_event">Email Event</option>
            <option value="external_api">External API</option>
            <option value="cron_job">Cron Job</option>
            <option value="db_event">DB Event</option>
          </select>
          <select
            value={level}
            onChange={e => setLevel(e.target.value as SystemLogLevel | '')}
            className="bg-[#2a2a2a]/60 border border-[#424242] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#4df9ed] cursor-pointer font-body"
          >
            <option value="">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as 'asc' | 'desc')}
            className="bg-[#2a2a2a]/60 border border-[#424242] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#4df9ed] cursor-pointer font-body"
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-[#424242] px-3 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <span className="ml-auto text-xs text-[#818181]">{total} records</span>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="shrink-0 border-b border-[#2a2a2a] bg-[#131313] px-5 py-4 text-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-[0.15em] text-[#4df9ed] font-bold">
                System Log — {selected.log_id.slice(0, 8).toUpperCase()}
              </span>
              <button onClick={() => setSelected(null)} className="text-[#818181] hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {([
                ['Log ID',    selected.log_id],
                ['Timestamp', formatDateTime(selected.timestamp)],
                ['Level',     selected.log_level],
                ['Event',     selected.event_type],
                ['Source',    selected.source],
                ['Message',   selected.message],
                ['Resolved',  selected.resolved ? 'Yes' : 'No'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="text-[#818181] text-[10px] uppercase tracking-[0.1em] w-24 flex-shrink-0 pt-0.5">{k}</span>
                  <span className="text-[#e0e0e0] break-all font-mono text-xs">{v}</span>
                </div>
              ))}
            </div>
            {selected.metadata && (
              <div className="mt-3">
                <span className="text-[#818181] text-[10px] uppercase tracking-[0.1em]">Metadata</span>
                <pre className="mt-1.5 text-[10px] font-mono text-[#b0b0b0] bg-[#0a0a0a] rounded-lg p-3 overflow-x-auto border border-[#2a2a2a]">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {error && !loading && (
          <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#1b1b1b]">
                <tr className="border-b border-[#2a2a2a]">
                  {['Timestamp', 'Level', 'Event', 'Source', 'Message', 'Resolved'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-b border-[#2a2a2a]/60">
                    <td className="px-4 py-3.5">
                      <div className="h-2.5 w-16 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      <div className="mt-1.5 h-2.5 w-20 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40 + 20}ms` }} />
                    </td>
                    <td className="px-4 py-3.5"><div className="h-4 w-14 animate-pulse rounded-full bg-[#2a2a2a]" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-24 animate-pulse rounded-full bg-[#2a2a2a]" /></td>
                    <td className="px-4 py-3.5"><div className="h-3 w-20 animate-pulse rounded bg-[#2a2a2a]" /></td>
                    <td className="px-4 py-3.5"><div className="h-3 w-48 animate-pulse rounded bg-[#2a2a2a]" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-10 animate-pulse rounded-full bg-[#2a2a2a]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="text-center py-16 text-[#424242] text-sm tracking-wide">No system logs match your filters.</div>
          )}

          {!loading && logs.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#1b1b1b]">
                <tr className="border-b border-[#2a2a2a]">
                  {['Timestamp', 'Level', 'Event', 'Source', 'Message', 'Resolved'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedLogs.map(log => (
                  <tr
                    key={log.log_id}
                    onClick={() => setSelected(prev => prev?.log_id === log.log_id ? null : log)}
                    className={`border-b border-[#2a2a2a]/60 transition-colors cursor-pointer ${
                      selected?.log_id === log.log_id
                        ? 'bg-[rgba(77,249,237,0.06)] border-l-2 border-l-[#4df9ed]'
                        : 'hover:bg-[#2a2a2a]/40'
                    }`}
                  >
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="text-[#818181] text-[10px]">{formatDate(log.timestamp)}</div>
                      <div className="text-[#c0c0c0] text-[11px] font-mono">{formatTime(log.timestamp)}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.1em] ${LEVEL_BADGE[log.log_level]}`}>
                        {log.log_level}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.1em] whitespace-nowrap ${EVENT_BADGE[log.event_type]}`}>
                        {log.event_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-[10px] text-[#b0b0b0] bg-[#2a2a2a] rounded px-1.5 py-0.5">{log.source}</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#e0e0e0] max-w-xs truncate">{log.message}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.1em] ${
                        log.resolved
                          ? 'bg-[rgba(58,246,38,0.10)] text-[#3af626] border border-[rgba(58,246,38,0.25)]'
                          : 'bg-[rgba(255,80,80,0.10)] text-[#ff6060] border border-[rgba(255,80,80,0.25)]'
                      }`}>
                        {log.resolved ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="shrink-0 border-t border-[#2a2a2a] px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#818181]">Page {safePage} of {totalPages} &mdash; {total} records</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="rounded-lg p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const n = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i
                  return (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`h-7 w-7 rounded-lg text-xs font-medium transition ${
                        n === safePage ? 'bg-[#4df9ed] text-[#0a0a0a]' : 'text-[#818181] hover:bg-[#2a2a2a] hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="rounded-lg p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-30"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Logs Page ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [activeTab, setActiveTab]       = useState<ActiveTab>('audit')
  const [auditStats, setAuditStats]     = useState<LogStats | null>(null)
  const [systemStats, setSystemStats]   = useState<SystemLogStats | null>(null)

  useEffect(() => {
    auditLogService.getStats()
      .then(setAuditStats)
      .catch(() => {})
  }, [])

  // TODO: uncomment once systemLogsService exists
  // useEffect(() => {
  //   systemLogsService.getStats()
  //     .then(setSystemStats)
  //     .catch(() => {})
  // }, [])

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden bg-[#0a0a0a] text-white">
      <div className="flex flex-col flex-1 min-h-0 px-3 py-3 lg:px-4 gap-4 overflow-hidden">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shrink-0">
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Logs</h1>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-1 self-start lg:self-auto">
            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'audit'
                  ? 'bg-[#4df9ed] text-[#0a0a0a]'
                  : 'text-[#818181] hover:text-white hover:bg-[#2a2a2a]'
              }`}
            >
              <ScrollText size={14} />
              Audit Logs
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === 'system'
                  ? 'bg-[#4df9ed] text-[#0a0a0a]'
                  : 'text-[#818181] hover:text-white hover:bg-[#2a2a2a]'
              }`}
            >
              <Server size={14} />
              System Logs
            </button>
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'audit'  && <AuditLogsTab  stats={auditStats}  />}
        {activeTab === 'system' && <SystemLogsTab stats={systemStats} />}

      </div>
    </div>
  )
}