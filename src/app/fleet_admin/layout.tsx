'use client'

import { ReactNode, useEffect } from 'react'
import { Truck } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/fleet_admin/vehicle-management', label: 'Vehicle Management', icon: <Truck size={17} /> },
  { href: '/fleet_admin/transit-tracking', label: 'Transit Tracking', icon: <Truck size={17} /> },
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

