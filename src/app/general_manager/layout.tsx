'use client'

import { ReactNode, useEffect } from 'react'
import { CalendarRange, Files, Truck, LayoutDashboard } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'
import { goHomeSignedOut } from '@/lib/auth-redirect'

const NAV_ITEMS = [
  { href: '/general_manager/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { href: '/general_manager/booking-management', label: 'Booking Management', icon: <CalendarRange size={20} /> },
  { href: '/general_manager/vehicle-management', label: 'Vehicle Management', icon: <Truck size={20} /> },
  { href: '/general_manager/document-management', label: 'Document Management', icon: <Files size={20} /> },
]

export default function GeneralManagerLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'general_manager') goHomeSignedOut()
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'general_manager') {
    return <div className="min-h-dvh bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}

