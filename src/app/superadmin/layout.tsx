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
import ReusableDashboardShell from '../../components/ui/ReusableDashboardShell'
import { ReactNode } from 'react'

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
    href: '/superadmin/document-review',
    label: 'Document Review',
    icon: <FileSearch size={17} />,
  },
  {
    href: '/superadmin/vehicle-management',
    label: 'Vehicle Management',
    icon: <Truck size={17} />,
  },
  {
    href: '/superadmin/booking-management',
    label: 'Booking Management',
    icon: <CalendarCheck size={17} />,
  },
  {
    href: '/superadmin/transit-tracking',
    label: 'Transit Tracking',
    icon: <MapPin size={17} />,
  },
  {
    href: '/superadmin/billing-payment',
    label: 'Billing & Payment',
    icon: <CreditCard size={17} />,
  },
]

interface SuperAdminShellProps {
  children: ReactNode
}

export default function SuperAdminShell({ children }: SuperAdminShellProps) {
  return (
    <ReusableDashboardShell navItems={superAdminNavItems}>
      {children}
    </ReusableDashboardShell>
  )
}