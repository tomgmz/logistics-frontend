'use client'

import { ReactNode } from 'react'
import Header from '../Header'
import Sidebar from '../SideBar'

export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div suppressHydrationWarning className="flex flex-col h-screen bg-[var(--color-bg)] overflow-hidden">
      <Header />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
          {children}
        </main>
      </div>
    </div>
  )
}