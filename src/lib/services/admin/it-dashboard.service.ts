import proxyApi from '@/lib/api/auth.api'
import type { SystemLogLevel, SystemLogEventType } from '@/lib/services/admin/system-logs.service'

/**
 * IT Admin dashboard — one read for system health, sign-in security and the
 * account roster. Shapes mirror the backend's it-dashboard.types.ts. Every
 * timestamp here is a full ISO string with its zone.
 */

export interface DashboardLogRow {
  log_id:     string
  log_level:  SystemLogLevel
  event_type: SystemLogEventType
  source:     string
  message:    string
  timestamp:  string
}

/** An open issue in the dashboard queue; log_id is its newest row, timestamp its last seen. */
export interface DashboardIssueRow extends DashboardLogRow {
  issue_id:    string
  event_count: number
  first_seen:  string
  regressed:   boolean
}

export type SchedulerStatus = 'ok' | 'failing' | 'late' | 'down' | 'never'
export type ServiceStatus   = 'ok' | 'degraded' | 'failing'

export interface SchedulerHealth {
  source:             string
  label:              string
  description:        string
  interval_minutes:   number
  status:             SchedulerStatus
  last_success_at:    string | null
  last_success_note:  string | null
  last_error_at:      string | null
  last_error_message: string | null
  errors_24h:         number
}

export interface ServiceHealth {
  key:                  string
  label:                string
  description:          string
  status:               ServiceStatus
  failures_1h:          number
  failures_24h:         number
  failures_7d:          number
  last_failure_at:      string | null
  last_failure_message: string | null
}

export interface SecurityWindow {
  failed_sign_ins:      number
  lockouts:             number
  rate_limit_trips:     number
  critical_auth_alerts: number
  passkey_failures:     number
  reset_requests:       number
  passkeys_enrolled:    number
  sessions_revoked:     number
}

export interface LockedAccount {
  user_id:      string
  name:         string
  email:        string
  role:         string
  permanent:    boolean
  locked_until: string | null
}

export interface RoleCounts {
  role:               string
  active:             number
  inactive:           number
  archived:           number
  permanently_locked: number
  total:              number
}

export interface StaffAccount {
  user_id:       string
  name:          string
  email:         string
  status:        string
  last_login_at: string | null
  created_at:    string | null
}

/** Plain-language health (Apple System Status / Statuspage style); see backend it-dashboard.types.ts. */
export type HealthState = 'working' | 'trouble' | 'down' | 'unknown'

export interface HealthPart {
  key:     string
  name:    string
  what:    string
  state:   HealthState
  summary: string
  last_problem_at: string | null
}

export interface TrafficWindow {
  requests: number
  /** The system failed the request (5xx). */
  failed:   number
  /** Turned away on purpose (4xx: wrong password, no permission). */
  refused:  number
  avg_ms:   number | null
  /** Took 3 seconds or more. */
  slow:     number
}

export interface TrafficSection {
  last_15m:        TrafficWindow
  last_24h:        TrafficWindow
  db_avg_ms:       number | null
  db_failures_15m: number
  hourly:          { start: string; requests: number; failed: number; avg_ms: number | null }[]
  measured_since:  string | null
}

export interface ItDashboardSummary {
  generated_at: string
  health:       HealthPart[]
  traffic:      TrafficSection
  problems: {
    /** Open issues for critical/error; warn = warnings logged in the last 24 hours. */
    unresolved: { critical: number; error: number; warn: number }
    /** Rows logged in the last 24 hours, resolved or not. */
    last_24h:   { critical: number; error: number; warn: number }
    /** Open issues, critical first, then most recently seen. */
    latest:     DashboardIssueRow[]
    open_issues?: number
  }
  schedulers: SchedulerHealth[]
  services:   ServiceHealth[]
  security: {
    last_24h:             SecurityWindow
    last_7d:              SecurityWindow
    most_failed_accounts: { email: string; count: number }[]
    locked_accounts:      LockedAccount[]
    open_reset_requests:  number
    active_sessions:      number
  }
  accounts: {
    by_role:         RoleCounts[]
    total_active:    number
    never_signed_in: number
    dormant:         number
    dormant_days:    number
    it_admin:        StaffAccount | null
    /** Company Administrator standing in for a departed IT Administrator (2026-11-06). */
    it_standin?:     StaffAccount | null
    last_handover:   { at: string; description: string } | null
    administrators:  StaffAccount[]
  }
}

export type TrendRange = '12m' | '30d' | '7d' | '24h'
export type TrendLevel = 'critical' | 'error' | 'warn'

/** One level's system_logs per hour / day / month, Manila time, oldest first. */
export interface ItDashboardTrend {
  range:          TrendRange
  level:          TrendLevel
  buckets:        { start: string; count: number }[]
  total:          number
  /** The same length of time just before the range. */
  previous_total: number
}

export const itDashboardService = {
  getSummary: (): Promise<ItDashboardSummary> =>
    proxyApi
      .get<{ status: string; data: ItDashboardSummary }>('/admin/it-dashboard')
      .then((r) => r.data.data),

  getTrend: (range: TrendRange, level: TrendLevel): Promise<ItDashboardTrend> =>
    proxyApi
      .get<{ status: string; data: ItDashboardTrend }>('/admin/it-dashboard/trend', { params: { range, level } })
      .then((r) => r.data.data),
}

// ── Logistics view (TailAdmin logistics layout, 2026-11-26) ─────────────────

export type LogisticsPeriod = 'monthly' | 'annually'
export type ActivityTab = 'all' | 'delivered' | 'in_transit' | 'pending' | 'processing'

/** One booking as the activity table and the tracking card show it. Times are ISO with a zone. */
export interface ActivityRow {
  booking_id:       string
  reference_number: string | null
  category:         string | null
  company:          string
  origin:           string | null
  destination:      string | null
  stops:            number
  status:           string
  schedule_date:    string | null
  started_at:       string | null
  picked_up_at:     string | null
  delivered_at:     string | null
  driver:           string | null
  plate:            string | null
  /** What BookingStatusTag reads for its sub-tags (Paused, Delayed, Late Start…). Absent on an older backend. */
  tag?:             Record<string, unknown>
}

export interface LogisticsOverview {
  generated_at: string
  totals: {
    bookings: number; booked_30d: number; booked_prev_30d: number
    in_transit: number; delivered: number; delivered_30d: number; delivered_prev_30d: number
  }
  vehicles:   { total: number; on_route: number }
  statistics: {
    period:  LogisticsPeriod
    /** start = first day of the month / year, YYYY-MM-DD (Manila). */
    buckets: { start: string; booked: number; delivered: number }[]
    delivered_in_range: number
  }
  tracked: ActivityRow | null
}

export interface ActivityPage {
  data:   ActivityRow[]
  meta:   { page: number; limit: number; total: number; totalPages: number }
  counts: Record<ActivityTab, number>
}

export const itLogisticsService = {
  getOverview: (period: LogisticsPeriod): Promise<LogisticsOverview> =>
    proxyApi
      .get<{ status: string; data: LogisticsOverview }>('/admin/it-dashboard/logistics', { params: { period } })
      .then((r) => r.data.data),

  getActivities: (q: { tab: ActivityTab; search?: string; date_from?: string; date_to?: string; page: number; limit: number }): Promise<ActivityPage> =>
    proxyApi
      .get<{ status: string } & ActivityPage>('/admin/it-dashboard/activities', { params: q })
      .then((r) => ({ data: r.data.data, meta: r.data.meta, counts: r.data.counts })),
}

export default itDashboardService
