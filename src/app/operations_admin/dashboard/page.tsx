import type { Metadata } from 'next'
import StaffDashboard from '@/components/dashboard/StaffDashboard'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default function OperationsAdminDashboard() {
  return <StaffDashboard role="operations_manager" />
}
