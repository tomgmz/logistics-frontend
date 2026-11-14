import type { Metadata } from 'next'
import StaffDashboard from '@/components/dashboard/StaffDashboard'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default function FleetAdminDashboard() {
  return <StaffDashboard role="fleet_manager" />
}
