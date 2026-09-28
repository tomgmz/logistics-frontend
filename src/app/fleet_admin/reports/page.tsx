import ReportsView from '@/app/admin/reports/ReportsView'

// Vehicle-related reports only (breakdowns, accidents) — the server scopes the
// list for the fleet manager's role.
export default function FleetManagerReports() {
  return <ReportsView />
}
