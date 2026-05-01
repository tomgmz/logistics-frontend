'use client'

import { ReactNode, useEffect } from 'react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { Activity } from 'lucide-react'
import { useAuthStore } from '@/app/lib/store/auth.store'

const ADMIN_NAV = [
  { href: '/admin/system-logs', label: 'System Logs', icon: <Activity size={20} /> },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    const allowed = user?.role === 'it_admin' || user?.role === 'super_admin'
    if (!user || !allowed) {
      window.location.replace('/')
    }
  }, [hasHydrated, user])

  const allowed = user?.role === 'it_admin' || user?.role === 'super_admin'
  if (!hasHydrated || !user || !allowed) {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={ADMIN_NAV}>{children}</ReusableDashboardShell>
}
