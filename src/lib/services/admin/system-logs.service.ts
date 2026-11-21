import proxyApi from '@/lib/api/auth.api'
import { systemSourceLabel } from '@/lib/log-labels'
import { downloadXlsx, manilaCellDate, manilaDateStamp, type XlsxColumn } from '@/lib/xlsx-export'

/**
 * System logs — what the software did, or failed to do. IT Admin only.
 *
 * This file used to point at '/admin/audit-logs' and re-export the audit shape,
 * so the "system logs" tab was a second view of the business audit trail. It
 * now talks to the real /admin/system-logs endpoints.
 */

export type SystemLogLevel = 'info' | 'warn' | 'error' | 'critical'

export type SystemLogEventType =
  | 'server_error'
  | 'auth_event'
  | 'email_event'
  | 'external_api'
  | 'cron_job'
  | 'db_event'

// Spelled out in full for display: the stored codes are abbreviated (db, auth, cron, warn).
export const SYSTEM_LOG_EVENT_LABEL: Record<SystemLogEventType, string> = {
  server_error: 'Server Error',
  auth_event:   'Sign-in Event',
  email_event:  'Email',
  external_api: 'External Service',
  cron_job:     'Scheduled Job',
  db_event:     'Database',
}

export const SYSTEM_LOG_LEVEL_LABEL: Record<SystemLogLevel, string> = {
  info:     'Info',
  warn:     'Warning',
  error:    'Error',
  critical: 'Critical',
}

export interface SystemLog {
  log_id:      string
  log_level:   SystemLogLevel
  event_type:  SystemLogEventType
  source:      string
  message:     string
  metadata:    Record<string, unknown> | null
  /** @deprecated Error/critical rows are resolved through their issue. */
  resolved:    boolean
  user_id:     string | null
  timestamp:   string
  /** The issue an error/critical row is grouped into; null for info/warning. */
  issue_id?:   string | null
  issue?:      { status: SystemLogIssueStatus; event_count: number } | null
}

/**
 * Repeated error/critical rows grouped by fingerprint (Sentry-style, built
 * 2026-11-21). The issue is what gets resolved; the rows are never changed.
 * Resolved + happens again = reopens (a regression); 7 quiet days = auto-resolved.
 */
export type SystemLogIssueStatus = 'open' | 'resolved' | 'ignored'

export const ISSUE_STATUS_LABEL: Record<SystemLogIssueStatus, string> = {
  open:     'Open',
  resolved: 'Resolved',
  ignored:  'Ignored',
}

export interface SystemLogIssue {
  issue_id:            string
  log_level:           'error' | 'critical'
  event_type:          SystemLogEventType
  source:              string
  title:               string
  last_message:        string
  last_log_id:         string | null
  status:              SystemLogIssueStatus
  event_count:         number
  first_seen:          string
  last_seen:           string
  resolved_at:         string | null
  resolved_by:         string | null
  resolved_by_name:    string | null
  resolution:          'manual' | 'auto' | null
  ignored_until:       string | null
  ignored_by:          string | null
  regressed_at:        string | null
  times_regressed:     number
  count_while_ignored: number
}

export interface GetSystemLogIssuesParams {
  page?:       number
  limit?:      number
  sort?:       'asc' | 'desc'
  status?:     SystemLogIssueStatus
  log_level?:  'error' | 'critical'
  event_type?: SystemLogEventType
  search?:     string
}

export type IssueAction =
  | { action: 'resolve' }
  | { action: 'reopen' }
  /** hours: 24 or 168; null = until reopened by hand. */
  | { action: 'ignore'; hours: 24 | 168 | null }

export interface SystemLogStats {
  total:      number
  info:       number
  warn:       number
  error:      number
  critical:   number
  /** Open issues, not rows. */
  unresolved: number
}

export interface GetSystemLogsParams {
  /** Only the rows grouped into this issue. */
  issue_id?:   string
  page?:       number
  limit?:      number
  sort?:       'asc' | 'desc'
  event_type?: SystemLogEventType
  log_level?:  SystemLogLevel
  resolved?:   boolean
  search?:     string
  /** Manila days, YYYY-MM-DD, inclusive. */
  from?:       string
  to?:         string
}

export interface GetSystemLogsResponse {
  data:  SystemLog[]
  total: number
  page:  number
  limit: number
}

interface ApiResponse<T> {
  status: string
  data:   T
  message?: string
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url, { params })
  return data.data
}

const B = '/admin/system-logs'
const I = '/admin/system-log-issues'

export const systemLogService = {
  getAll: (params: GetSystemLogsParams): Promise<GetSystemLogsResponse> =>
    proxyApi
      .get<ApiResponse<SystemLog[]> & { total: number; page: number; limit: number }>(B, { params })
      .then((r) => ({
        data:  r.data.data,
        total: r.data.total,
        page:  r.data.page,
        limit: r.data.limit,
      })),

  getStats: (): Promise<SystemLogStats> =>
    get<SystemLogStats>(`${B}/stats`),

  getById: (id: string): Promise<SystemLog> =>
    get<SystemLog>(`${B}/${id}`),

  getIssues: (params: GetSystemLogIssuesParams): Promise<{ data: SystemLogIssue[]; total: number; page: number; limit: number }> =>
    proxyApi
      .get<ApiResponse<SystemLogIssue[]> & { total: number; page: number; limit: number }>(I, { params })
      .then((r) => ({ data: r.data.data, total: r.data.total, page: r.data.page, limit: r.data.limit })),

  getIssue: (id: string): Promise<SystemLogIssue> =>
    get<SystemLogIssue>(`${I}/${id}`),

  /** Resolve, ignore or reopen one issue (all its occurrences at once). */
  actOnIssue: (id: string, body: IssueAction): Promise<SystemLogIssue> =>
    proxyApi.patch<ApiResponse<SystemLogIssue>>(`${I}/${id}`, body).then((r) => r.data.data),
}

export type ExportSystemLogsParams = Omit<GetSystemLogsParams, 'page' | 'limit'>

/** Same as the backend's SYSTEM_EXPORT_ROW_CAP. */
export const SYSTEM_EXPORT_ROW_CAP = 10_000

const SYSTEM_XLSX_COLUMNS: XlsxColumn<SystemLog>[] = [
  { label: 'Timestamp (PHT)', width: 20, value: (l) => manilaCellDate(l.timestamp) },
  { label: 'Level',           width: 10, value: (l) => SYSTEM_LOG_LEVEL_LABEL[l.log_level] ?? l.log_level },
  { label: 'Event Type',      width: 14, value: (l) => SYSTEM_LOG_EVENT_LABEL[l.event_type] ?? l.event_type },
  { label: 'Source',          width: 32, value: (l) => systemSourceLabel(l.source) },
  { label: 'Message',         width: 70, value: (l) => l.message },
  { label: 'Issue',           width: 10, value: (l) => (l.issue ? ISSUE_STATUS_LABEL[l.issue.status] : null) },
  { label: 'User ID',         width: 38, value: (l) => l.user_id },
  { label: 'Metadata',        width: 60, value: (l) => (l.metadata ? JSON.stringify(l.metadata) : null) },
  { label: 'Log ID',          width: 38, value: (l) => l.log_id },
]

/** Fetches every row matching the filters (up to the cap) and downloads them as an .xlsx. */
export async function exportSystemLogsXlsx(
  params: ExportSystemLogsParams,
): Promise<{ count: number; truncated: boolean }> {
  const { data: body } = await proxyApi.get<
    ApiResponse<SystemLog[]> & { meta: { truncated: boolean; count: number } }
  >(`${B}/export`, { params })

  const rows = body?.data ?? []
  if (rows.length > 0) {
    await downloadXlsx(`system_logs_${manilaDateStamp()}.xlsx`, 'System Logs', rows, SYSTEM_XLSX_COLUMNS)
  }
  return { count: rows.length, truncated: !!body?.meta?.truncated }
}

export default systemLogService
