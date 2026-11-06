'use client'

import { ReactNode, useEffect, useState } from 'react'
import { ArrowLeft, ListMinus, LayoutDashboard, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ReusableDashboardShell from '@/components/layout/ReusableDashboardShell'
import { useAuthStore } from '@/lib/store/auth.store'
import { goHomeSignedOut } from '@/lib/auth-redirect'
import { getMe } from '@/lib/api/auth.api'

const NAV_ITEMS = [
  { href: '/it_admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { href: '/it_admin/administrator-management', label: 'User Management', icon: <Users size={20} /> },
  { href: '/it_admin/logs', label: 'Logs', icon: <ListMinus size={20} /> },
]

// The Company Administrator standing in for a departed IT Administrator
// (2026-11-06) uses these same pages, with a way back to their own portal.
const STANDIN_NAV_ITEMS = [
  ...NAV_ITEMS,
  { href: '/admin/dashboard', label: 'Back to Company Administrator', icon: <ArrowLeft size={20} /> },
]

export default function ItAdminLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  // A Company Administrator who became the stand-in after signing in (e.g.
  // tapping the "you are now standing in" notice) has a stale profile: re-read
  // it once before deciding, instead of bouncing them back to /admin.
  const needsRecheck = hasHydrated && user?.role === 'admin' && !user.it_standin
  const [recheckDone, setRecheckDone] = useState(false)
  const rechecked = !needsRecheck || recheckDone
  useEffect(() => {
    if (!needsRecheck || recheckDone) return
    getMe().then((me) => setUser(me)).catch(() => {}).finally(() => setRecheckDone(true))
  }, [needsRecheck, recheckDone, setUser])

  const isStandin = user?.role === 'admin' && !!user.it_standin
  const allowed   = user?.role === 'it_admin' || isStandin

  useEffect(() => {
    if (!hasHydrated || !rechecked) return
    if (!user) { goHomeSignedOut(); return }
    // A Company Administrator who is not (or no longer) the stand-in goes back
    // to their own portal rather than being signed out.
    if (user.role === 'admin' && !user.it_standin) { router.replace('/admin/dashboard'); return }
    if (!allowed) goHomeSignedOut()
  }, [hasHydrated, rechecked, user, allowed, router])

  if (!hasHydrated || !user || !allowed) {
    return <div className="min-h-dvh bg-[#0a0a0a]" />
  }

  return <ReusableDashboardShell navItems={isStandin ? STANDIN_NAV_ITEMS : NAV_ITEMS}>{children}</ReusableDashboardShell>
}

