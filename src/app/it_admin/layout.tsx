'use client'

import { ReactNode } from 'react'
import { Activity, LayoutDashboard } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import PortalAuthLoading from '@/components/layout/PortalAuthLoading'
import { usePortalAuthGuard } from '@/lib/hooks/usePortalAuthGuard'

const NAV_ITEMS = [
  { href: '/it_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { href: '/it_admin/system-logs', label: 'System Logs', icon: <Activity size={17} /> },
]

export default function ItAdminLayout({ children }: { children: ReactNode }) {
  const { isLoading } = usePortalAuthGuard('it_admin')

  if (isLoading) return <PortalAuthLoading />

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}
