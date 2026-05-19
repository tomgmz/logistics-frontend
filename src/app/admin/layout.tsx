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
  Layers,
  LayoutDashboard
} from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { ReactNode, useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'

const adminNavItems = [
  {
    href: '/admin/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={17} />,
  },
  {
    href: '/admin/user-management',
    label: 'User Management',
    icon: <Users size={17} />,
  },
  {
    href: '/admin/booking-management',
    label: 'Booking Management',
    icon: <CalendarCheck size={17} />,
  },
  {
    href: '/admin/transit-tracking',
    label: 'Transit Tracking',
    icon: <MapPin size={17} />,
  },
  {
    href: '/admin/vehicle-management',
    label: 'Vehicle Management',
    icon: <Truck size={17} />,
  },
  {
    href: '/admin/billing-management',
    label: 'Billing Management',
    icon: <CreditCard size={17} />,
  },
  {
    href: '/admin/transaction-history',
    label: 'Transaction History',
    icon: <History size={17} />,
  },
  {
    href: '/admin/document-management',
    label: 'Document Management',
    icon: <FileSearch size={17} />,
  },
  {
    href: '/admin/cargo-catalog',
    label: 'Cargo Catalog',
    icon: <Layers size={17} />,
  },
  {
    href: '/admin/audit-logs',
    label: 'Audit Logs',
    icon: <ScrollText size={17} />,
  },
  {
    href: '/admin/expenses',
    label: 'Expenses',
    icon: <BanknoteArrowDown size={17} />,
  },
]

interface AdminShellProps {
  children: ReactNode
}

export default function AdminShell({ children }: AdminShellProps) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'admin') {
      window.location.replace('/')
    }
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'admin') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return (
    <ReusableDashboardShell navItems={adminNavItems}>
      {children}
    </ReusableDashboardShell>
  )
}