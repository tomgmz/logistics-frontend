'use client'

import { ReactNode, useEffect } from 'react'
import { LayoutDashboard, Truck } from 'lucide-react'
import ReusableDashboardShell from '@/components/ui/ReusableDashboardShell'
import { useAuthStore } from '@/app/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/fleet_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { href: '/fleet_admin/vehicles', label: 'Vehicles', icon: <Truck size={17} /> },
]

export default function FleetAdminLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'fleet_admin') window.location.replace('/')
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'fleet_admin') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}

