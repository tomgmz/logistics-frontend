'use client'

import { ReactNode } from 'react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import PortalAuthLoading from '@/components/layout/PortalAuthLoading'
import { usePortalAuthGuard } from '@/lib/hooks/usePortalAuthGuard'
import { History, CalendarCheck, MapPin, CreditCard } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/client/booking',  label: 'Booking',  icon: <CalendarCheck size={20} /> },
  { href: '/client/tracking', label: 'Delivery Tracking', icon: <MapPin size={20} /> },
  { href: '/client/reverse-billing',  label: 'Reverse Billing',  icon: <CreditCard size={20} /> },
  { href: '/client/history',  label: 'Transaction History',  icon: <History size={20} /> },
]

export default function ClientLayout({ children }: { children: ReactNode }) {
  const { isLoading } = usePortalAuthGuard('client')

  if (isLoading) return <PortalAuthLoading />

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}
