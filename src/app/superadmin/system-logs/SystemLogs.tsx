'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  systemLogService,
  type SystemLog,
  type LogStats,
  type LogType,
} from '@/lib/services/admin/system-logs.service'
import { formatDate, formatTime, formatDateTime } from '@/app/utils/timeFormat'

const BADGE_STYLES: Record<LogType, string> = {
  user_activity:    'bg-[rgba(77,249,237,0.12)] text-[#4df9ed] border border-[rgba(77,249,237,0.25)]',
  vehicle_activity: 'bg-[rgba(58,246,38,0.10)] text-[#3af626] border border-[rgba(58,246,38,0.25)]',
  booking:          'bg-[rgba(255,200,60,0.10)] text-[#ffc83c] border border-[rgba(255,200,60,0.25)]',
  payment:          'bg-[rgba(160,120,255,0.12)] text-[#b08aff] border border-[rgba(160,120,255,0.25)]',
  system_error:     'bg-[rgba(255,80,80,0.10)] text-[#ff6060] border border-[rgba(255,80,80,0.25)]',
}

const STAT_COLORS: Record<string, string> = {
  total:            '#ffffff',
  user_activity:    '#4df9ed',
  vehicle_activity: '#3af626',
  booking:          '#ffc83c',
  payment:          '#b08aff',
  system_error:     '#ff6060',
}

const PAGE_SIZE = 15

export default function SystemLogsPage() {
  const [logs, setLogs]                       = useState<SystemLog[]>([])
  const [stats, setStats]                     = useState<LogStats | null>(null)
  const [total, setTotal]                     = useState(0)
  const [page, setPage]                       = useState(1)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [logType, setLogType]                 = useState<LogType | ''>('')
  const [sort, setSort]                       = useState<'desc' | 'asc'>('desc')
  const [selected, setSelected]               = useState<SystemLog | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, logType, sort])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await systemLogService.getAll({
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

  const fetchStats = useCallback(async () => {
    try {
      const data = await systemLogService.getStats()
      setStats(data)
    } catch {
      // non-critical — fail silently
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { fetchStats() }, [fetchStats])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const safePage = Math.min(page, totalPages)
  const displayedLogs = logs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const displayName = (log: SystemLog) => {
    if (!log.users) return '—'
    const { first_name, last_name } = log.users
    if (first_name || last_name) return [first_name, last_name].filter(Boolean).join(' ')
    return '—'
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden bg-[#0a0a0a] text-white">
      <div className="flex flex-col flex-1 min-h-0 px-3 py-3 lg:px-4 gap-6 overflow-hidden">

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 shrink-0">
          <div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">System Logs</h1>
          </div>

          {stats && (
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['Total',    stats.total,             'total'],
                  ['Activity', stats.user_activity,     'user_activity'],
                  ['Vehicles', stats.vehicle_activity,  'vehicle_activity'],
                  ['Bookings', stats.booking,           'booking'],
                  ['Errors',   stats.system_error,      'system_error'],
                ] as [string, number, string][]
              ).map(([label, val, key]) => (
                <div key={key} className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] px-4 py-2 text-center min-w-[72px]">
                  <p className="text-2xl font-bold font-mono" style={{ color: STAT_COLORS[key] }}>{val}</p>
                  <p className="text-[9px] uppercase tracking-widest text-[#818181] mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] overflow-hidden">

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
              <option value="vehicle_activity">Vehicle Activity</option>
              <option value="booking">Booking</option>
              <option value="payment">Payment</option>
              <option value="system_error">System Error</option>
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
              onClick={() => { fetchLogs(); fetchStats() }}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-[#424242] px-3 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-40"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <span className="ml-auto text-xs text-[#818181]">
              {total} records
            </span>
          </div>

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
                  ['IP Address',  selected.ip_address ?? '—'],
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
            <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-auto min-h-0">
            {loading && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#1b1b1b]">
                  <tr className="border-b border-[#2a2a2a]">
                    {['Timestamp', 'Type', 'Action', 'Description', 'User', 'IP'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]">
                        {h}
                      </th>
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
                      <td className="px-4 py-3.5">
                        <div className="h-4 w-20 animate-pulse rounded-full bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-4 w-28 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-3 w-48 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-3 w-24 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                        <div className="mt-1.5 h-2 w-14 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40 + 20}ms` }} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-2.5 w-24 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!loading && !error && logs.length === 0 && (
              <div className="text-center py-16 text-[#424242] text-sm tracking-wide">
                No logs match your filters.
              </div>
            )}

            {!loading && logs.length > 0 && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#1b1b1b]">
                  <tr className="border-b border-[#2a2a2a]">
                    {['Timestamp', 'Type', 'Action', 'Description', 'User', 'IP'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]">
                        {h}
                      </th>
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
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-[0.1em] whitespace-nowrap ${BADGE_STYLES[log.log_type]}`}>
                          {log.log_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-[10px] text-[#b0b0b0] bg-[#2a2a2a] rounded px-1.5 py-0.5">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#e0e0e0] max-w-xs truncate">
                        {log.description ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#c0c0c0]">
                        <p className="font-medium text-white">{displayName(log)}</p>
                        {log.users?.role && (
                          <p className="text-[#818181] text-[9px] uppercase tracking-wide">{log.users.role}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[10px] text-[#818181]">
                        {log.ip_address ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && totalPages > 1 && (
            <div className="shrink-0 border-t border-[#2a2a2a] bg-[#1b1b1b] px-5 py-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#818181]">
                  Page {safePage} of {totalPages} &mdash; {total} records
                </p>
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
                          n === safePage
                            ? 'bg-[#4df9ed] text-[#0a0a0a]'
                            : 'text-[#818181] hover:bg-[#2a2a2a] hover:text-white'
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
    </div>
  )
}