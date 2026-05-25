'use client'

import { ReactNode, useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import ReusableHeader from '@/components/layout/ReusableHeader'
import { useState } from 'react'

export default function MessagingLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore(s => s.user)
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user) window.location.replace('/')
  }, [hasHydrated, user])

  if (!hasHydrated || !user) {
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
    </div>
  )
}