'use client'

import { ReactNode } from 'react'
import { CalendarCheck } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import PortalAuthLoading from '@/components/layout/PortalAuthLoading'
import { usePortalAuthGuard } from '@/lib/hooks/usePortalAuthGuard'

const NAV_ITEMS = [
  { href: '/operations_admin/booking-management', label: 'Booking Management', icon: <CalendarCheck size={17} /> },
  { href: '/operations_admin/document-management', label: 'Document Management', icon: <CalendarCheck size={17} /> },
  { href: '/operations_admin/transit-tracking', label: 'Transit Tracking', icon: <CalendarCheck size={17} /> },
]

export default function OperationsAdminLayout({ children }: { children: ReactNode }) {
  const { isLoading } = usePortalAuthGuard('operations_admin')

  if (isLoading) return <PortalAuthLoading />

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}
