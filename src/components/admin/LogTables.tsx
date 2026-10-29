'use client'

import type { FilterOption } from '@/components/ui/FilterBar'
import type { AuditLog, LogType } from '@/lib/services/admin/audit-logs.service'
import {
  SYSTEM_LOG_EVENT_LABEL,
  SYSTEM_LOG_LEVEL_LABEL,
  type SystemLog,
  type SystemLogEventType,
  type SystemLogLevel,
} from '@/lib/services/admin/system-logs.service'
import { formatDate, formatTime, formatDateTime } from '@/app/utils/timeFormat'
import { expandCode, roleLabel } from '@/lib/roles'

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
const AUDIT_TYPE_LABEL = Object.fromEntries(AUDIT_TYPE_OPTIONS.map((o) => [o.value, o.label])) as Record<string, string>

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
            <td><span className={CODE_PILL}>{expandCode(log.action)}</span></td>
            <td className="max-w-[420px] truncate" title={log.description ?? undefined}>{log.description ?? '—'}</td>
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
          <th className="text-right">resolved</th>
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
            <td><span className={CODE_PILL}>{log.source}</span></td>
            <td className="max-w-[420px] truncate" title={log.message}>{log.message}</td>
            <td className={`ff-sc text-right ${log.resolved ? 'text-[#3af626]' : 'text-[#f62626]'}`}>
              {log.resolved ? 'Yes' : 'No'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The clicked row's full record, under the filter row. */
export function LogDetail({ title, rows, metadata, onClose }: {
  title:     string
  rows:      [string, string][]
  metadata?: unknown
  onClose:   () => void
}) {
  return (
    <div className="shrink-0 border-b border-[#424242] bg-[#131313] px-5 py-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4df9ed]">{title}</span>
        <button onClick={onClose} aria-label="Close" className="text-lg leading-none text-[#818181] hover:text-white">✕</button>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <span className="w-24 flex-shrink-0 pt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#818181]">{k}</span>
            <span className="break-all font-mono text-xs text-[#e0e0e0]">{v}</span>
          </div>
        ))}
      </div>
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
    ['Action',      expandCode(log.action)],
    ['Description', log.description ?? '—'],
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
    ['Source',    log.source],
    ['Message',   log.message],
    ['Resolved',  log.resolved ? 'Yes' : 'No'],
  ]
}
