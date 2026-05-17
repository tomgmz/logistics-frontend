'use client'

import {
  Users,
  FileSearch,
  ScrollText,
  Truck,
  CalendarCheck,
  MapPin,
  CreditCard,
  BanknoteArrowDown,
  History,
} from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import PortalAuthLoading from '@/components/layout/PortalAuthLoading'
import { usePortalAuthGuard } from '@/lib/hooks/usePortalAuthGuard'
import { ReactNode } from 'react'

const superAdminNavItems = [
  { href: '/superadmin/system-logs', label: 'System Logs', icon: <ScrollText size={17} /> },
  { href: '/superadmin/user-management', label: 'User Management', icon: <Users size={17} /> },
  { href: '/superadmin/booking-management', label: 'Booking Management', icon: <CalendarCheck size={17} /> },
  { href: '/superadmin/billing-management', label: 'Billing Management', icon: <CreditCard size={17} /> },
  { href: '/superadmin/expenses', label: 'Expenses', icon: <BanknoteArrowDown size={17} /> },
  { href: '/superadmin/transaction-history', label: 'Transaction History', icon: <History size={17} /> },
  { href: '/superadmin/vehicle-management', label: 'Vehicle Management', icon: <Truck size={17} /> },
  { href: '/superadmin/transit-tracking', label: 'Transit Tracking', icon: <MapPin size={17} /> },
  { href: '/superadmin/document-review', label: 'Document Review', icon: <FileSearch size={17} /> },
]

export default function SuperAdminShell({ children }: { children: ReactNode }) {
  const { isLoading } = usePortalAuthGuard('super_admin')

  if (isLoading) return <PortalAuthLoading />

  return (
    <ReusableDashboardShell navItems={superAdminNavItems}>
      {children}
    </ReusableDashboardShell>
  )
}
