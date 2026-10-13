'use client'

import { ReactNode, useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { goHomeSignedOut } from '@/lib/auth-redirect'
import { clientMessagesHref } from '@/lib/services/support.service'
import ReusableHeader from '@/components/layout/ReusableHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import { useState } from 'react'

export default function MessagingLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user)
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user) goHomeSignedOut()
    // A client's messages are in the help assistant inside their portal.
    else if (user.role === 'client') window.location.replace(clientMessagesHref())
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role === 'client') {
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }

  return (
    <div
      className="flex flex-col bg-[var(--color-bg)] overflow-hidden"
      style={{ height: '100dvh' }}
    >
      <ReusableHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {children}
      </main>
      <SiteFooter variant="compact" />
    </div>
  )
}