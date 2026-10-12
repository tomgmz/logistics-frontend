import proxyApi from '@/lib/api/auth.api'

/**
 * Staff dashboards — each desk's queues plus the Company Administrator's
 * analytics, in one read. Mirrors the backend's staff-dashboard.service.
 */

export interface DashboardBooking {
  booking_id:       string
  reference_number: string | null
  client:           string | null
  origin:           string | null
  schedule_date:    string | null
  call_time:        string | null
  status:           string
}

export interface DashboardVehicle {
  truck_id:     string
  plate_number: string
  reason:       string
}

export interface Queue<T> {
  count: number
  items: T[]
}

export type BookingQueueKey =
  | 'gm_pending' | 'ops_pending' | 'dispatch_today' | 'dispatch_tomorrow'
  | 'in_transit' | 'open_issues' | 'awaiting_client' | 'awaiting_return'

export type VehicleQueueKey =
  | 'return_odometer_due' | 'recheck_due' | 'failed_inspection' | 'service_overdue' | 'service_due_soon'

export interface DashboardTicket {
  ticket_id:  string
  reference:  string
  subject:    string
  category:   string
  client:     string | null
  email:      string | null
  booking:    string | null
  created_at: string
}

export interface StaffDashboard {
  generated_at: string
  queues:       Record<BookingQueueKey, Queue<DashboardBooking>>
  vehicles:     Record<VehicleQueueKey, Queue<DashboardVehicle>> & {
    total:  number
    status: Record<string, number>
  }
  open_driver_reports:    number
  support_tickets:        Queue<DashboardTicket>
  flagged_vendor_drivers: number
  analytics: {
    series:      { day: string; created: number; delivered: number }[]
    status_mix:  Record<string, number>
    top_clients: { client: string; count: number }[]
    totals:      { bookings: number; completed: number; cancelled: number }
  }
}

export async function fetchStaffDashboard(): Promise<StaffDashboard> {
  const { data } = await proxyApi.get<{ data: StaffDashboard }>('/admin/dashboard')
  return data.data
}
