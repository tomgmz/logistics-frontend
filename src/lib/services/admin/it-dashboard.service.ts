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

export interface ItDashboardSummary {
  generated_at: string
  problems: {
    unresolved: { critical: number; error: number; warn: number }
    latest:     DashboardLogRow[]
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
    last_handover:   { at: string; description: string } | null
    administrators:  StaffAccount[]
  }
}

export const itDashboardService = {
  getSummary: (): Promise<ItDashboardSummary> =>
    proxyApi
      .get<{ status: string; data: ItDashboardSummary }>('/admin/it-dashboard')
      .then((r) => r.data.data),
}

export default itDashboardService
