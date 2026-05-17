'use client'

import { ReactNode } from 'react'
import { ClipboardList, Truck } from 'lucide-react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import PortalAuthLoading from '@/components/layout/PortalAuthLoading'
import { usePortalAuthGuard } from '@/lib/hooks/usePortalAuthGuard'

const NAV_ITEMS = [
  { href: '/general_manager/vehicle-management', label: 'Vehicle Management', icon: <Truck size={17} /> },
  { href: '/general_manager/booking-management', label: 'Booking Management', icon: <ClipboardList size={17} /> },
  { href: '/general_manager/billing-management', label: 'Billing Management', icon: <ClipboardList size={17} /> },
  { href: '/general_manager/document-management', label: 'Document Management', icon: <ClipboardList size={17} /> },
]

export default function GeneralManagerLayout({ children }: { children: ReactNode }) {
  const { isLoading } = usePortalAuthGuard('general_manager')

  if (isLoading) return <PortalAuthLoading />

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}
