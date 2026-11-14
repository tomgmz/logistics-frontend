import type { Metadata } from 'next'
import StaffDashboard from '@/components/dashboard/StaffDashboard'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default function GeneralManagerDashboard() {
  return <StaffDashboard role="general_manager" />
}
