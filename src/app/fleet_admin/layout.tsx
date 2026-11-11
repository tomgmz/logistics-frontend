'use client'

import { ReactNode, useEffect } from 'react'
import { Truck, LayoutDashboard, MapPin, TriangleAlert, Files } from 'lucide-react'
import { archiveNavItem } from '@/components/archive/archiveNav'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'
import { goHomeSignedOut } from '@/lib/auth-redirect'

const NAV_ITEMS = [
  { href: '/fleet_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { href: '/fleet_admin/transit-tracking', label: 'Transit Tracking', icon: <MapPin size={20} /> },
  { href: '/fleet_admin/vehicle-management', label: 'Vehicle Management', icon: <Truck size={20} /> },
  { href: '/fleet_admin/reports', label: 'Reports', icon: <TriangleAlert size={20} /> },
  // Fleet files only (vehicle papers, odometer photos, service receipts); the server scopes it.
  { href: '/fleet_admin/document-management', label: 'Document Management', icon: <Files size={20} /> },
  // Every archived record of this portal, one tab per module (2026-11-11).
  archiveNavItem('fleet_admin'),
]

export default function FleetAdminLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'fleet_manager') goHomeSignedOut()
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'fleet_manager') {
    return <div className="min-h-dvh bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}

