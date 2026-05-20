import proxyApi from '@/lib/api/auth.api'

export type LogType =
  | 'user_activity'
  | 'vehicle_activity'
  | 'booking'
  | 'payment'
  | 'system_error'

export interface LogUser {
  role:       string | null
  first_name: string | null
  last_name:  string | null
}

export interface SystemLog {
  log_id:      string
  user_id:     string | null
  log_type:    LogType
  action:      string
  description: string | null
  timestamp:   string
  users:       LogUser | null
}

export interface LogStats {
  total:          number
  user_activity:  number
  vehicle_activity: number
  booking:        number
  payment:        number
  system_error:   number
}

export interface GetLogsParams {
  page?:     number
  limit?:    number
  sort?:     'asc' | 'desc'
  log_type?: LogType
  search?:   string
}

export interface GetLogsResponse {
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

const B = '/admin/audit-logs'

export const systemLogService = {
  getAll: (params: GetLogsParams): Promise<GetLogsResponse> =>
    proxyApi
      .get<ApiResponse<SystemLog[]> & { total: number; page: number; limit: number }>(B, { params })
      .then((r) => ({
        data:  r.data.data,
        total: r.data.total,
        page:  r.data.page,
        limit: r.data.limit,
      })),

  getStats: (): Promise<LogStats> =>
    get<LogStats>(`${B}/stats`),

  getById: (id: string): Promise<SystemLog> =>
    get<SystemLog>(`${B}/${id}`),
}