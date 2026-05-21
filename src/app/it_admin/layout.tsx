'use client'

import { ReactNode, useEffect } from 'react'
import { Activity, LayoutDashboard, Users } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/it_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { href: '/it_admin/administrator-management', label: 'Admin Management', icon: <Users size={17} /> },
  { href: '/it_admin/logs', label: 'Audit Logs', icon: <Activity size={17} /> },
]

export default function ItAdminLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'it_admin') window.location.replace('/')
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'it_admin') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}

