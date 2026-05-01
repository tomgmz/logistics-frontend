'use client'

import { ReactNode, useEffect } from 'react'
import { LayoutDashboard, Users } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/app/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/human_resources/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { href: '/human_resources/people', label: 'People', icon: <Users size={17} /> },
]

export default function HumanResourcesLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'human_resources') window.location.replace('/')
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'human_resources') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}

