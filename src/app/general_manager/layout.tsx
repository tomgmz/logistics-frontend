'use client'

import { ReactNode, useEffect } from 'react'
import { ClipboardList, Truck, LayoutDashboard } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/general-manager/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { href: '/general_manager/vehicle-management', label: 'Vehicle Management', icon: <Truck size={17} /> },
  { href: '/general_manager/booking-management', label: 'Booking Management', icon: <ClipboardList size={17} /> },
  { href: '/general_manager/billing-management', label: 'Billing Management', icon: <ClipboardList size={17} /> },
  { href: '/general_manager/document-management', label: 'Document Management', icon: <ClipboardList size={17} /> },
]

export default function GeneralManagerLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'general_manager') window.location.replace('/')
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'general_manager') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}

