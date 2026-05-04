'use client'

import { ReactNode, useEffect } from 'react'
import { CreditCard } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/accountant/transaction-hsitory', label: 'Transaction History', icon: <CreditCard size={17} /> },
  { href: '/accountant/expenses', label: 'Expenses', icon: <CreditCard size={17} /> },
  { href: '/accountant/document-review', label: 'Document Review', icon: <CreditCard size={17} /> },
  { href: '/accountant/booking-management', label: 'Booking Management', icon: <CreditCard size={17} /> },
  { href: '/accountant/billing-management', label: 'Billing Management', icon: <CreditCard size={17} /> },
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

