'use client'

import type { FilterOption } from '@/components/ui/FilterBar'
import type { AuditLog, LogType } from '@/lib/services/admin/audit-logs.service'
import {
  SYSTEM_LOG_EVENT_LABEL,
  SYSTEM_LOG_LEVEL_LABEL,
  ISSUE_STATUS_LABEL,
  type SystemLogIssue,
  type SystemLogIssueStatus,
  type SystemLog,
  type SystemLogEventType,
  type SystemLogLevel,
} from '@/lib/services/admin/system-logs.service'
import { formatDate, formatTime, formatDateTime } from '@/app/utils/timeFormat'
import { expandCode, roleLabel } from '@/lib/roles'
import { auditActionLabel, systemSourceLabel } from '@/lib/log-labels'
import { TruncatedText } from '@/components/ui/TruncatedText'
import { Tip } from '@/components/ui/tooltip'
import type { ReactNode } from 'react'

/**
 * The two log tables in the table format (Figma 3234:594 System Logs,
 * 3234:1147 Audit Logs), shared by the IT Administrator's Logs and the
 * Company Administrator's Audit Logs so both read the same.
 */

export const AUDIT_TYPE_OPTIONS: FilterOption[] = [
  { value: 'auth',              label: 'Sign-in & Credentials' },
  { value: 'user_management',   label: 'User Management' },
  { value: 'access_control',    label: 'Access Control' },
  { value: 'document_activity', label: 'Documents' },
  { value: 'data_export',       label: 'Data Exports' },
  { value: 'admin_activity',    label: 'Administrator Activity' },
  { value: 'vehicle_activity',  label: 'Vehicle Activity' },
  { value: 'driver_activity',   label: 'Driver Activity' },
  { value: 'booking',           label: 'Booking' },
]

const AUDIT_TYPE_LABEL: Record<string, string> = {
  ...Object.fromEntries(AUDIT_TYPE_OPTIONS.map((o) => [o.value, o.label])),
  // Types older rows still carry (not offered as filters).
  vehicle_creation:     'Vehicle Activity',
  delivery_activity:    'Delivery Activity',
  maintenance_activity: 'Maintenance',
  user_activity:        'User Activity',
}

/** The Type column's words, also used by the export. */
export const auditTypeLabel = (t: string) => AUDIT_TYPE_LABEL[t] ?? expandCode(t).replace(/_/g, ' ')

// Newest first unless the Filters panel says otherwise.
export const SORT_OPTIONS: FilterOption[] = [
  { value: 'desc', label: 'Newest first' },
  { value: 'asc',  label: 'Oldest first' },
]

// Figma 3234:1147: the type pill is an outline with text in the same colour.
const AUDIT_TYPE_COLOR: Record<LogType, string> = {
  auth:              'border-[#3af626] text-[#3af626]',
  user_management:   'border-white text-white',
  access_control:    'border-[#8a38f5] text-[#8a38f5]',
  document_activity: 'border-[#e3a070] text-[#e3a070]',
  data_export:       'border-[#00ffb2] text-[#00ffb2]',
  admin_activity:    'border-[#008cff] text-[#008cff]',
  vehicle_activity:  'border-[#ffea00] text-[#ffea00]',
  driver_activity:   'border-[#ff7a30] text-[#ff7a30]',
  booking:           'border-[#4df9ed] text-[#4df9ed]',
  user_activity:     'border-[#818181] text-[#818181]',
  system_error:      'border-[#f62626] text-[#f62626]',
}

// Figma 3234:594: the level pill is filled, the event pill an outline with white text.
const LEVEL_COLOR: Record<SystemLogLevel, string> = {
  info:     'border-[#4df9ed] bg-[#4df9ed]/[0.24] text-[#4df9ed]',
  warn:     'border-[#ffea00] bg-[#ffea00]/20 text-[#ffea00]',
  error:    'border-[#f62626] bg-[#f62626]/[0.13] text-[#f62626]',
  critical: 'border-[#ff7a30] bg-[#ff7a30]/20 text-[#ff7a30]',
}
const EVENT_COLOR: Record<SystemLogEventType, string> = {
  server_error: 'border-[#f62626]',
  auth_event:   'border-[#3af626]',
  email_event:  'border-[#ff7a30]',
  external_api: 'border-[#ffea00]',
  cron_job:     'border-[#8a38f5]',
  db_event:     'border-[#4df9ed]',
}

/** The white outline pill the action and source columns use, in the regular face. */
const CODE_PILL = 't-badge ff-regular border-white text-white'

function userName(log: AuditLog) {
  if (!log.users) return '—'
  const { first_name, last_name } = log.users
  return [first_name, last_name].filter(Boolean).join(' ') || '—'
}

function rowClass(selected: boolean) {
  return `cursor-pointer transition-colors ${selected
    ? 'bg-[#4df9ed]/[0.06] shadow-[inset_2px_0_0_#4df9ed]'
    : '[@media(hover:hover)]:hover:bg-[#2a2a2a]/40'}`
}

function SkeletonRows({ cols, rows }: { cols: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j}>
              <div className="h-3 w-24 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40}ms` }} />
              {j < 2 && <div className="mt-1.5 h-2.5 w-14 animate-pulse rounded bg-[#2a2a2a]" style={{ animationDelay: `${i * 40 + 20}ms` }} />}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

interface TableProps<T> {
  logs:       T[]
  loading:    boolean
  pageSize:   number
  selectedId: string | null
  onSelect:   (log: T) => void
}

export function AuditLogTable({ logs, loading, pageSize, selectedId, onSelect }: TableProps<AuditLog>) {
  return (
    <table className="data-table min-w-[1000px]">
      <thead className="sticky top-0 z-10">
        <tr>
          <th>user</th>
          <th>timestamp</th>
          <th>type</th>
          <th>action</th>
          <th>description</th>
        </tr>
      </thead>
      <tbody>
        {loading ? <SkeletonRows cols={5} rows={pageSize} /> : logs.map((log) => (
          <tr key={log.log_id} onClick={() => onSelect(log)} className={rowClass(selectedId === log.log_id)}>
            <td className="whitespace-nowrap">
              <p className="t-name">{userName(log)}</p>
              {log.users?.role && <p className="t-sub">{roleLabel(log.users.role)}</p>}
            </td>
            <td className="whitespace-nowrap">
              <p className="t-name text-white">{formatDate(log.timestamp)}</p>
              <p className="t-sub">{formatTime(log.timestamp)}</p>
            </td>
            <td>
              <span className={`t-badge ${AUDIT_TYPE_COLOR[log.log_type] ?? AUDIT_TYPE_COLOR.user_activity}`}>
                {AUDIT_TYPE_LABEL[log.log_type] ?? expandCode(log.log_type).replace(/_/g, ' ')}
              </span>
            </td>
            <td><span className={CODE_PILL}>{auditActionLabel(log.action)}</span></td>
            {/* The server sends the description already readable (lib/log-text.ts). */}
            <td className="max-w-[420px] truncate"><TruncatedText>{log.description || '—'}</TruncatedText></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SystemLogTable({ logs, loading, pageSize, selectedId, onSelect }: TableProps<SystemLog>) {
  return (
    <table className="data-table min-w-[1000px]">
      <thead className="sticky top-0 z-10">
        <tr>
          <th>timestamp</th>
          <th>level</th>
          <th>event</th>
          <th>source</th>
          <th>message</th>
          <th className="text-right">issue</th>
        </tr>
      </thead>
      <tbody>
        {loading ? <SkeletonRows cols={6} rows={pageSize} /> : logs.map((log) => (
          <tr key={log.log_id} onClick={() => onSelect(log)} className={rowClass(selectedId === log.log_id)}>
            <td className="whitespace-nowrap">
              <p className="t-name">{formatDate(log.timestamp)}</p>
              <p className="t-sub">{formatTime(log.timestamp)}</p>
            </td>
            <td>
              <span className={`t-badge ${LEVEL_COLOR[log.log_level]}`}>
                {SYSTEM_LOG_LEVEL_LABEL[log.log_level] ?? log.log_level}
              </span>
            </td>
            <td>
              <span className={`t-badge text-white ${EVENT_COLOR[log.event_type] ?? 'border-[#818181]'}`}>
                {SYSTEM_LOG_EVENT_LABEL[log.event_type] ?? log.event_type.replace(/_/g, ' ')}
              </span>
            </td>
            <td><Tip label={log.source}><span className={CODE_PILL}>{systemSourceLabel(log.source)}</span></Tip></td>
            <td className="max-w-[420px] truncate"><TruncatedText>{log.message}</TruncatedText></td>
            {/* Error/critical rows are grouped into an issue; info and warnings are records only. */}
            <td className={`ff-sc text-right whitespace-nowrap ${log.issue ? ISSUE_STATUS_TEXT[log.issue.status] : 'text-[#818181]'}`}>
              {log.issue ? ISSUE_STATUS_LABEL[log.issue.status] : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The clicked row's full record, under the filter row. */
export function LogDetail({ title, rows, metadata, actions, onClose }: {
  title:     string
  rows:      [string, string][]
  metadata?: unknown
  /** Buttons under the record (an issue's Resolve / Ignore / Reopen). */
  actions?:  ReactNode
  onClose:   () => void
}) {
  return (
    <div className="shrink-0 border-b border-[#424242] bg-[#131313] px-5 py-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4df9ed]">{title}</span>
        <button onClick={onClose} aria-label="Close" className="text-lg leading-none text-[#818181] [@media(hover:hover)]:hover:text-white">✕</button>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <span className="w-24 flex-shrink-0 pt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#818181]">{k}</span>
            <span className="break-all font-mono text-xs text-[#e0e0e0]">{v}</span>
          </div>
        ))}
      </div>
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      {metadata != null && (
        <div className="mt-3">
          <span className="text-[10px] uppercase tracking-[0.1em] text-[#818181]">Metadata</span>
          <pre className="mt-1.5 overflow-x-auto rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-3 font-mono text-[10px] text-[#b0b0b0]">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export function auditDetailRows(log: AuditLog): [string, string][] {
  return [
    ['Log ID',      log.log_id],
    ['Timestamp',   formatDateTime(log.timestamp)],
    ['Type',        AUDIT_TYPE_LABEL[log.log_type] ?? expandCode(log.log_type).replace(/_/g, ' ')],
    ['Action',      auditActionLabel(log.action)],
    ['Description', log.description || '—'],
    ['User',        userName(log)],
    ['Role',        roleLabel(log.users?.role) || '—'],
  ]
}

export function systemDetailRows(log: SystemLog): [string, string][] {
  return [
    ['Log ID',    log.log_id],
    ['Timestamp', formatDateTime(log.timestamp)],
    ['Level',     SYSTEM_LOG_LEVEL_LABEL[log.log_level] ?? log.log_level],
    ['Event',     SYSTEM_LOG_EVENT_LABEL[log.event_type] ?? log.event_type],
    ['Source',    systemSourceLabel(log.source)],
    ['Message',   log.message],
    ['Issue',     log.issue ? `${ISSUE_STATUS_LABEL[log.issue.status]} · ${log.issue.event_count.toLocaleString()} occurrence${log.issue.event_count === 1 ? '' : 's'}` : 'None (info and warnings are not grouped)'],
  ]
}

// ── Issues: repeated errors grouped (Sentry-style), resolved as one ─────────

export const ISSUE_STATUS_TEXT: Record<SystemLogIssueStatus, string> = {
  open:     'text-[#f62626]',
  resolved: 'text-[#3af626]',
  ignored:  'text-[#818181]',
}

export const ISSUE_STATUS_OPTIONS: FilterOption[] = [
  { value: 'open',     label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'ignored',  label: 'Ignored' },
]

export function IssueTable({ logs: issues, loading, pageSize, selectedId, onSelect }: TableProps<SystemLogIssue>) {
  return (
    <table className="data-table min-w-[1000px]">
      <thead className="sticky top-0 z-10">
        <tr>
          <th>last seen</th>
          <th>level</th>
          <th>event</th>
          <th>source</th>
          <th>message</th>
          <th className="text-right">occurrences</th>
          <th className="text-right">status</th>
        </tr>
      </thead>
      <tbody>
        {loading ? <SkeletonRows cols={7} rows={pageSize} /> : issues.map((i) => (
          <tr key={i.issue_id} onClick={() => onSelect(i)} className={rowClass(selectedId === i.issue_id)}>
            <td className="whitespace-nowrap">
              <p className="t-name">{formatDate(i.last_seen)}</p>
              <p className="t-sub">{formatTime(i.last_seen)}</p>
            </td>
            <td>
              <span className={`t-badge ${LEVEL_COLOR[i.log_level]}`}>
                {SYSTEM_LOG_LEVEL_LABEL[i.log_level] ?? i.log_level}
              </span>
            </td>
            <td>
              <span className={`t-badge text-white ${EVENT_COLOR[i.event_type] ?? 'border-[#818181]'}`}>
                {SYSTEM_LOG_EVENT_LABEL[i.event_type] ?? i.event_type.replace(/_/g, ' ')}
              </span>
            </td>
            <td><Tip label={i.source}><span className={CODE_PILL}>{systemSourceLabel(i.source)}</span></Tip></td>
            <td className="max-w-[420px] truncate"><TruncatedText>{i.last_message}</TruncatedText></td>
            <td className="text-right font-mono">{i.event_count.toLocaleString()}</td>
            <td className={`ff-sc text-right whitespace-nowrap ${ISSUE_STATUS_TEXT[i.status]}`}>
              {ISSUE_STATUS_LABEL[i.status]}{i.status === 'open' && i.regressed_at ? ' · Came back' : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function issueDetailRows(i: SystemLogIssue): [string, string][] {
  const status =
    i.status === 'resolved'
      ? `Resolved ${i.resolved_at ? formatDateTime(i.resolved_at) : ''}${i.resolution === 'auto' ? ' (automatically, quiet for 7 days)' : i.resolved_by_name ? ` by ${i.resolved_by_name}` : ''}`
      : i.status === 'ignored'
        ? `Ignored ${i.ignored_until ? `until ${formatDateTime(i.ignored_until)}` : 'until reopened'}`
        : i.regressed_at ? `Open (came back ${formatDateTime(i.regressed_at)})` : 'Open'
  return [
    ['Status',      status.trim()],
    ['Level',       SYSTEM_LOG_LEVEL_LABEL[i.log_level] ?? i.log_level],
    ['Event',       SYSTEM_LOG_EVENT_LABEL[i.event_type] ?? i.event_type],
    ['Source',      systemSourceLabel(i.source)],
    ['Occurrences', `${i.event_count.toLocaleString()}${i.count_while_ignored ? ` (${i.count_while_ignored.toLocaleString()} while ignored)` : ''}`],
    ['First seen',  formatDateTime(i.first_seen)],
    ['Last seen',   formatDateTime(i.last_seen)],
    ['Came back',   i.times_regressed ? `${i.times_regressed} time${i.times_regressed === 1 ? '' : 's'} after being resolved` : 'Never'],
    ['Grouped as',  i.title],
    ['Latest',      i.last_message],
  ]
}
