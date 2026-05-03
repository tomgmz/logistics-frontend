'use client'

import { ReactNode, useEffect } from 'react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { MapPin, ClipboardList, Truck } from 'lucide-react'
import { useAuthStore } from '@/lib/store/auth.store'

interface VendorShellProps {
  children: ReactNode
}

export default function VendorLayout({ children }: VendorShellProps) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'vendor') {
      window.location.replace('/')
    }
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'vendor') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

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