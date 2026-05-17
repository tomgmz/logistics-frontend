'use client'

import { ReactNode } from 'react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import PortalAuthLoading from '@/components/layout/PortalAuthLoading'
import { usePortalAuthGuard } from '@/lib/hooks/usePortalAuthGuard'
import { Activity } from 'lucide-react'

const ADMIN_NAV = [
  { href: '/admin/system-logs', label: 'System Logs', icon: <Activity size={20} /> },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isLoading } = usePortalAuthGuard(['it_admin', 'super_admin'])

  if (isLoading) return <PortalAuthLoading />

  return <ReusableDashboardShell navItems={ADMIN_NAV}>{children}</ReusableDashboardShell>
}
