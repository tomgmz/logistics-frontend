import proxyApi from '@/lib/api/auth.api'

export type LogType =
  // A person acted on their own credentials or session.
  | 'auth'
  // An admin created, changed, or removed somebody else's account.
  | 'user_management'
  // Permissions granted or revoked, and attempts that were refused.
  | 'access_control'
  // A document or proof photo was attached or removed.
  | 'document_activity'
  // Records left the system in bulk.
  | 'data_export'
  | 'admin_activity'
  | 'vehicle_activity'
  | 'booking'
  | 'driver_activity'
  /** @deprecated pre-split rows only — see the log split migration. */
  | 'user_activity'
  /** @deprecated technical failures now live in system_logs. */
  | 'system_error'

export interface LogUser {
  role:       string | null
  first_name: string | null
  last_name:  string | null
}

export interface AuditLog {
  log_id:      string
  user_id:     string | null
  log_type:    LogType
  action:      string
  description: string | null
  timestamp:   string
  users:       LogUser | null
}

export interface LogStats {
  total:             number
  auth:              number
  user_management:   number
  access_control:    number
  document_activity: number
  data_export:       number
  admin_activity:    number
  vehicle_activity:  number
  booking:           number
  driver_activity:   number
  user_activity:     number
  system_error:      number
}

export interface GetLogsParams {
  page?:     number
  limit?:    number
  sort?:     'asc' | 'desc'
  log_type?: LogType
  search?:   string
}

export interface GetLogsResponse {
  data:  AuditLog[]
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

const B = '/admin/audit-logs'

export const auditLogService = {
  getAll: (params: GetLogsParams): Promise<GetLogsResponse> =>
    proxyApi
      .get<ApiResponse<AuditLog[]> & { total: number; page: number; limit: number }>(B, { params })
      .then((r) => ({
        data:  r.data.data,
        total: r.data.total,
        page:  r.data.page,
        limit: r.data.limit,
      })),

  getStats: (): Promise<LogStats> =>
    get<LogStats>(`${B}/stats`),

  getById: (id: string): Promise<AuditLog> =>
    get<AuditLog>(`${B}/${id}`),
}
