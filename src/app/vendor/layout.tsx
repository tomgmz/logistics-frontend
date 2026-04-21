'use client'

import { ReactNode } from 'react'
import ReusableDashboardShell from '@/components/ui/ReusableDashboardShell'
import { MapPin, ClipboardList, Truck } from 'lucide-react'

interface VendorShellProps {
  children: ReactNode
}

export default function VendorLayout({ children }: VendorShellProps) {
  const navItems = [
    {
      href: '/vendor/transit-tracking',
      label: 'Transit Tracking',
      icon: <MapPin size={17} />,
    },
    {
      href: '/vendor/delivery-assignment',
      label: 'Delivery Assignment',
      icon: <ClipboardList size={17} />,
    },
    {
      href: '/vendor/vehicle-management',
      label: 'Vehicle Management',
      icon: <Truck size={17} />,
    }
  ]

  return (
    <ReusableDashboardShell navItems={navItems}>
      {children}
    </ReusableDashboardShell>
  )
}