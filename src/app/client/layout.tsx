'use client'

import { ReactNode, useEffect } from 'react'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'
import { goHomeSignedOut } from '@/lib/auth-redirect'
import HelpAssistant from '@/components/support/HelpAssistant'
import ContractEndedBanner from '@/components/client/ContractEndedBanner'
import { useContractStore } from '@/lib/contract-status'
import { History, CalendarRange, MapPin, CreditCard, LayoutDashboard } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/client/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { href: '/client/booking',  label: 'Booking',  icon: <CalendarRange size={20} /> },
  { href: '/client/tracking', label: 'Transit Tracking', icon: <MapPin size={20} /> },
  { href: '/client/history',  label: 'Transaction History',  icon: <History size={20} /> },
]

export default function ClientLayout({ children }: { children: ReactNode }) {
  const user            = useAuthStore((s) => s.user)
  const hasHydrated     = useAuthStore((s) => s.hasHydrated)
  const loadContract    = useContractStore((s) => s.load)

  // The contract status (banner, closed booking) is read on entry and whenever
  // the tab is shown again, so a renewal or the end date passing is picked up.
  useEffect(() => {
    if (!hasHydrated || user?.role !== 'client') return
    void loadContract()
    const onVisible = () => { if (document.visibilityState === 'visible') void loadContract() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [hasHydrated, user?.role, loadContract])

  useEffect(() => {
    if (!hasHydrated) return
    if (!user || user.role !== 'client') {
      goHomeSignedOut()
    }
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role !== 'client') {
    return <div className="min-h-dvh bg-[#0a0a0a]" />
  }

  return (
    <>
      <ReusableDashboardShell navItems={NAV_ITEMS}>
        <ContractEndedBanner />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </ReusableDashboardShell>
      {/* FAQ assistant + support tickets, clients only. */}
      <HelpAssistant />
    </>
  )
}