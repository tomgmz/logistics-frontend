'use client'

import { ReactNode, useEffect, useMemo } from 'react'
import { CalendarCheck, CreditCard, FileSearch, History, LayoutDashboard } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'

const DASHBOARD = { href: '/accountant/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> }
// Bookings are the GM's stage; an accountant only sees them while the IT admin
// has appointed them as the GM's approval proxy.
const BOOKING   = { href: '/accountant/booking-management', label: 'Booking Management', icon: <CalendarCheck size={17} /> }
const REST      = [
  { href: '/accountant/billing-management', label: 'Billing Management', icon: <CreditCard size={17} /> },
  { href: '/accountant/transaction-history', label: 'Transaction History', icon: <History size={17} /> },
  { href: '/accountant/document-management', label: 'Document Management', icon: <FileSearch size={17} /> },
]

export default function AccountantLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const isGmProxy = user?.is_gm_proxy === true

  const navItems = useMemo(
    () => (isGmProxy ? [DASHBOARD, BOOKING, ...REST] : [DASHBOARD, ...REST]),
    [isGmProxy],
  )

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'accountant') window.location.replace('/')
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'accountant') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={navItems}>{children}</ReusableDashboardShell>
}
