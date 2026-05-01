'use client'

import { ReactNode, useEffect } from 'react'
import { ClipboardList, LayoutDashboard } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/app/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/general_manager/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { href: '/general_manager/operations', label: 'Operations', icon: <ClipboardList size={17} /> },
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

