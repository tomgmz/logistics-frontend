'use client'

import {
  Users,
  Files,
  ListMinus,
  Truck,
  CalendarRange,
  MapPin,
  CreditCard,
  History,
  MonitorCog,
  LayoutDashboard,
  TriangleAlert,
  Ticket,
} from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { ReactNode, useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { goHomeSignedOut } from '@/lib/auth-redirect'

const adminNavItems = [
  {
    href: '/admin/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={20} />,
  },
  {
    href: '/admin/user-management',
    label: 'User Management',
    icon: <Users size={20} />,
  },
  {
    href: '/admin/booking-management',
    label: 'Booking Management',
    icon: <CalendarRange size={20} />,
  },
  {
    href: '/admin/transit-tracking',
    label: 'Transit Tracking',
    icon: <MapPin size={20} />,
  },
  {
    href: '/admin/vehicle-management',
    label: 'Vehicle Management',
    icon: <Truck size={20} />,
  },
  {
    href: '/admin/reports',
    label: 'Reports',
    icon: <TriangleAlert size={20} />,
  },
  {
    href: '/admin/transaction-history',
    label: 'Transaction History',
    icon: <History size={20} />,
  },
  {
    href: '/admin/document-management',
    label: 'Document Management',
    icon: <Files size={20} />,
  },
  {
    href: '/admin/system-maintenance',
    label: 'System Maintenance',
    icon: <MonitorCog size={20} />,
  },
  {
    href: '/admin/audit-logs',
    label: 'Audit Logs',
    icon: <ListMinus size={20} />,
  },
  {
    href: '/admin/support-tickets',
    label: 'Tickets',
    icon: <Ticket size={20} />,
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
      goHomeSignedOut()
    }
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'admin') {
    return <div className="min-h-dvh bg-[#0a0a0a]" />
  }

  return (
    <ReusableDashboardShell navItems={adminNavItems}>
      {children}
    </ReusableDashboardShell>
  )
}