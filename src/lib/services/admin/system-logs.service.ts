import proxyApi from '@/lib/api/auth.api'
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

export interface SystemLog {
  log_id:      string
  log_level:   SystemLogLevel
  event_type:  SystemLogEventType
  source:      string
  message:     string
  metadata:    Record<string, unknown> | null
  resolved:    boolean
  user_id:     string | null
  timestamp:   string
}

export interface SystemLogStats {
  total:      number
  info:       number
  warn:       number
  error:      number
  critical:   number
  unresolved: number
}

export interface GetSystemLogsParams {
  page?:       number
  limit?:      number
  sort?:       'asc' | 'desc'
  event_type?: SystemLogEventType
  log_level?:  SystemLogLevel
  resolved?:   boolean
  search?:     string
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

  /** Triage: mark an incident handled (or reopen it). */
  setResolved: (id: string, resolved: boolean): Promise<{ log_id: string; resolved: boolean }> =>
    proxyApi
      .patch<ApiResponse<{ log_id: string; resolved: boolean }>>(`${B}/${id}/resolve`, { resolved })
      .then((r) => r.data.data),
}

export type ExportSystemLogsParams = Omit<GetSystemLogsParams, 'page' | 'limit'>

/** Same as the backend's SYSTEM_EXPORT_ROW_CAP. */
export const SYSTEM_EXPORT_ROW_CAP = 10_000

const SYSTEM_XLSX_COLUMNS: XlsxColumn<SystemLog>[] = [
  { label: 'Timestamp (PHT)', width: 20, value: (l) => manilaCellDate(l.timestamp) },
  { label: 'Level',           width: 10, value: (l) => l.log_level },
  { label: 'Event Type',      width: 14, value: (l) => l.event_type },
  { label: 'Source',          width: 32, value: (l) => l.source },
  { label: 'Message',         width: 70, value: (l) => l.message },
  { label: 'Resolved',        width: 10, value: (l) => (l.resolved ? 'Yes' : 'No') },
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
