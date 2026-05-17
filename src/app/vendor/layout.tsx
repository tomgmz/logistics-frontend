'use client'

import { ReactNode } from 'react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import PortalAuthLoading from '@/components/layout/PortalAuthLoading'
import { usePortalAuthGuard } from '@/lib/hooks/usePortalAuthGuard'
import { MapPin, ClipboardList, Truck } from 'lucide-react'

export default function VendorLayout({ children }: { children: ReactNode }) {
  const { isLoading } = usePortalAuthGuard('vendor')

  if (isLoading) return <PortalAuthLoading />

  const navItems = [
    { href: '/vendor/vehicle-management', label: 'Vehicle Management', icon: <Truck size={17} /> },
    { href: '/vendor/delivery-assignment', label: 'Delivery Assignment', icon: <ClipboardList size={17} /> },
    { href: '/vendor/transit-tracking', label: 'Transit Tracking', icon: <MapPin size={17} /> },
  ]

  return (
    <ReusableDashboardShell navItems={navItems}>
      {children}
    </ReusableDashboardShell>
  )
}
