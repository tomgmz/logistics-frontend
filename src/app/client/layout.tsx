'use client'

import { ReactNode } from 'react'
import Image from 'next/image'
import ReusableDashboardShell from '@/components/ReusableDashboardShell'
import { ASSETS } from '@/constants/client/icon'

const NAV_ITEMS = [
  { href: '/client', label: 'Overview', icon: <Image src={ASSETS.svcOverview} alt='overview' width={24} height={24} /> },
  { href: '/client/booking', label: 'Booking', icon: <Image src={ASSETS.svcBooking} alt='booking' width={24} height={24} /> },
  { href: '/client/tracking', label: 'Tracking', icon: <Image src={ASSETS.svcTracking} alt='tracking' width={24} height={24} /> },
  { href: '/client/billing', label: 'Billing', icon: <Image src={ASSETS.svcBilling} alt='billing' width={24} height={24} /> },
  { href: '/client/history', label: 'History', icon: <Image src={ASSETS.svcHistory} alt='history' width={24} height={24} /> },
]

export default function OverViewLayout({ children }: { children: ReactNode }) {
  return <ReusableDashboardShell navItems={NAV_ITEMS}>{children}</ReusableDashboardShell>
}