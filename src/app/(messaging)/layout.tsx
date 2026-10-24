'use client'

import { ReactNode, useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { goHomeSignedOut } from '@/lib/auth-redirect'
import { clientMessagesHref } from '@/lib/services/support.service'
import ReusableHeader from '@/components/layout/ReusableHeader'
import { MessagingChromeContext } from '@/components/messaging/MessagingChromeContext'
import ChatCallProvider from '@/components/calls/ChatCallProvider'
import { useState } from 'react'

export default function MessagingLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user)
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user) goHomeSignedOut()
    // A client's messages are in the help assistant inside their portal.
    else if (user.role === 'client') window.location.replace(clientMessagesHref())
  }, [hasHydrated, user])

  if (!hasHydrated || !user || user.role === 'client') {
    return <div className="min-h-dvh bg-[#0a0a0a]" />
  }

  return (
    <div
      className="flex flex-col bg-[var(--color-bg)] overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {/* Below lg an open chat shows its own header (with Back), so the site bar would double up. */}
      <div className={chatOpen ? 'hidden lg:block' : undefined}>
        <ReusableHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>
      <main className="flex flex-1 min-h-0 overflow-hidden">
        <MessagingChromeContext.Provider value={setChatOpen}>
          {children}
        </MessagingChromeContext.Provider>
      </main>
      {/* This page is outside the dashboard shell, so it rings for calls itself. */}
      <ChatCallProvider />
    </div>
  )
}