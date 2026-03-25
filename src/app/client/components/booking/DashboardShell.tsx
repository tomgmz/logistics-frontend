'use client'

import { ReactNode } from 'react'
import { useSessionState } from '../../hooks/UseSessionState'
import Header from '../Header'
import Sidebar from '../SideBar'
export default function DashboardShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useSessionState<boolean>('client:sidebarOpen', true)

  return (
    <div suppressHydrationWarning className="flex flex-col h-screen bg-[var(--color-bg)] overflow-hidden">
      <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <main className="flex-1 overflow-hidden bg-[var(--color-surface)]">
          {children}
        </main>
      </div>
    </div>
  )
}