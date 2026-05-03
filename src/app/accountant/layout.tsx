'use client'

import { ReactNode, useEffect } from 'react'
import { CreditCard, LayoutDashboard } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/accountant/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { href: '/accountant/billing', label: 'Billing', icon: <CreditCard size={17} /> },
]

export default function AccountantLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'accountant') window.location.replace('/')
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'accountant') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}

