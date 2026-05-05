'use client'

import { ReactNode, useEffect } from 'react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'
import { History, CalendarCheck, MapPin, CreditCard } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/client/booking',  label: 'Booking',  icon: <CalendarCheck size={20} /> },
  { href: '/client/tracking', label: 'Tracking', icon: <MapPin size={20} /> },
  { href: '/client/billing',  label: 'Billing',  icon: <CreditCard size={20} /> },
  { href: '/client/history',  label: 'History',  icon: <History size={20} /> },
]

export default function ClientLayout({ children }: { children: ReactNode }) {
  const user            = useAuthStore((s) => s.user)
  const hasHydrated     = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'client') {
      window.location.replace('/')
    }
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'client') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}