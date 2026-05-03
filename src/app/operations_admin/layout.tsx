'use client'

import { ReactNode, useEffect } from 'react'
import { CalendarCheck, LayoutDashboard } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/operations_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { href: '/operations_admin/bookings', label: 'Bookings', icon: <CalendarCheck size={17} /> },
]

export default function OperationsAdminLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'operations_admin') window.location.replace('/')
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'operations_admin') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}

