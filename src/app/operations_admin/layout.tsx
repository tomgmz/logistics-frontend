'use client'

import { ReactNode, useEffect } from 'react'
import { CalendarRange, Files, MapPin, LayoutDashboard, TriangleAlert } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'
import { goHomeSignedOut } from '@/lib/auth-redirect'

const NAV_ITEMS = [
  { href: '/operations_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { href: '/operations_admin/booking-management', label: 'Booking Management', icon: <CalendarRange size={20} /> },
  { href: '/operations_admin/transit-tracking', label: 'Transit Tracking', icon: <MapPin size={20} /> },
  { href: '/operations_admin/reports', label: 'Reports', icon: <TriangleAlert size={20} /> },
  { href: '/operations_admin/document-management', label: 'Document Management', icon: <Files size={20} /> },
]

export default function OperationsAdminLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'operations_manager') goHomeSignedOut()
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'operations_manager') {
    return <div className="min-h-dvh bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}

