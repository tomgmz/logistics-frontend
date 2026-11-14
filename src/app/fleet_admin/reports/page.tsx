import type { Metadata } from 'next'
import ReportsView from '@/app/admin/reports/ReportsView'

export const metadata: Metadata = {
  title: 'Reports',
}

// Vehicle-related reports only (breakdowns, accidents) — the server scopes the
// list for the fleet manager's role.
export default function FleetManagerReports() {
  return <ReportsView />
}
