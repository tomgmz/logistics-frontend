'use client'

import { ReactNode } from 'react'
import { Truck } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import PortalAuthLoading from '@/components/layout/PortalAuthLoading'
import { usePortalAuthGuard } from '@/lib/hooks/usePortalAuthGuard'

const NAV_ITEMS = [
  { href: '/fleet_admin/vehicle-management', label: 'Vehicle Management', icon: <Truck size={17} /> },
  { href: '/fleet_admin/transit-tracking', label: 'Transit Tracking', icon: <Truck size={17} /> },
]

export default function FleetAdminLayout({ children }: { children: ReactNode }) {
  const { isLoading } = usePortalAuthGuard('fleet_admin')

  if (isLoading) return <PortalAuthLoading />

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}
