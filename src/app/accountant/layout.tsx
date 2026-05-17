'use client'

import { ReactNode } from 'react'
import { CreditCard } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import PortalAuthLoading from '@/components/layout/PortalAuthLoading'
import { usePortalAuthGuard } from '@/lib/hooks/usePortalAuthGuard'

const NAV_ITEMS = [
  { href: '/accountant/transaction-history', label: 'Transaction History', icon: <CreditCard size={17} /> },
  { href: '/accountant/expenses', label: 'Expenses', icon: <CreditCard size={17} /> },
  { href: '/accountant/document-management', label: 'Document Management', icon: <CreditCard size={17} /> },
  { href: '/accountant/booking-management', label: 'Booking Management', icon: <CreditCard size={17} /> },
  { href: '/accountant/billing-management', label: 'Billing Management', icon: <CreditCard size={17} /> },
]

export default function AccountantLayout({ children }: { children: ReactNode }) {
  const { isLoading } = usePortalAuthGuard('accountant')

  if (isLoading) return <PortalAuthLoading />

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}
