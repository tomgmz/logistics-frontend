'use client'

import { ReactNode, useEffect } from 'react'
import Image from 'next/image'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { ASSETS } from '@/constants/client/icon'
import { useAuthStore } from '@/app/lib/store/auth.store'

const NAV_ITEMS = [
  { href: '/client/booking',  label: 'Booking',  icon: <Image src={ASSETS.svcBooking}  alt='booking'   width={24} height={24} /> },
  { href: '/client/tracking', label: 'Tracking', icon: <Image src={ASSETS.svcTracking} alt='tracking'  width={24} height={24} /> },
  { href: '/client/billing',  label: 'Billing',  icon: <Image src={ASSETS.svcBilling}  alt='billing'   width={24} height={24} /> },
  { href: '/client/history',  label: 'History',  icon: <Image src={ASSETS.svcHistory}  alt='history'   width={24} height={24} /> },
]

export default function ClientLayout({ children }: { children: ReactNode }) {
  const user            = useAuthStore((s) => s.user)
  const hasHydrated     = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'client') {
      window.location.replace('/')
    }
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'client') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}