'use client'

import {
  Users,
  FileSearch,
  ScrollText,
  Truck,
  CalendarCheck,
  MapPin,
  CreditCard,
} from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { ReactNode, useEffect } from 'react'
import { useAuthStore } from '@/app/lib/store/auth.store'

const superAdminNavItems = [
  {
    href: '/superadmin/system-logs',
    label: 'System Logs',
    icon: <ScrollText size={17} />,
  },
  {
    href: '/superadmin/user-management',
    label: 'User Management',
    icon: <Users size={17} />,
  },
  {
    href: '/superadmin/booking-management',
    label: 'Booking Management',
    icon: <CalendarCheck size={17} />,
  },
  {
    href: '/superadmin/billing-payment',
    label: 'Billing & Payment',
    icon: <CreditCard size={17} />,
  },
  {
    href: '/superadmin/expenses',
    label: 'Expenses',
    icon: <FileSearch size={17} />,
  },
  {
    href: '/superadmin/transaction-history',
    label: 'Transaction History',
    icon: <FileSearch size={17} />,
  },
  {
    href: '/superadmin/vehicle-management',
    label: 'Vehicle Management',
    icon: <Truck size={17} />,
  },
  {
    href: '/superadmin/transit-tracking',
    label: 'Transit Tracking',
    icon: <MapPin size={17} />,
  },
  {
    href: '/superadmin/document-review',
    label: 'Document Review',
    icon: <FileSearch size={17} />,
  },
]

interface SuperAdminShellProps {
  children: ReactNode
}

export default function SuperAdminShell({ children }: SuperAdminShellProps) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'super_admin') {
      window.location.replace('/')
    }
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'super_admin') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return (
    <ReusableDashboardShell navItems={superAdminNavItems}>
      {children}
    </ReusableDashboardShell>
  )
}