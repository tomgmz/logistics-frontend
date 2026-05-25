'use client'

import { ReactNode, useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { NAV_ITEMS_BY_ROLE } from '@/lib/config/nav.config'

export default function MessagingLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user)
  const hasHydrated = useAuthStore(s => s.hasHydrated)

  console.log('MessagingLayout:', { hasHydrated, user })

  useEffect(() => {
    if (!hasHydrated) return
    if (!user) window.location.replace('/')
  }, [hasHydrated, user])

  if (!hasHydrated || !user) {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  const navItems = NAV_ITEMS_BY_ROLE[user.role] ?? []

  return (
    <ReusableDashboardShell navItems={navItems}>
      {children}
    </ReusableDashboardShell>
  )
}