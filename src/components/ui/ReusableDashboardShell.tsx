'use client'

import { ReactNode, useState } from 'react'
import ReusableHeader from './ReusableHeader'
import ReusableSidebar from './ReusableSidebar'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface ReusableDashboardShellProps {
  children: ReactNode
  navItems: NavItem[]
}

// ReusableDashboardShell.tsx

export default function ReusableDashboardShell({ children, navItems }: ReusableDashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div
      suppressHydrationWarning
      className="flex flex-col bg-[var(--color-bg)] overflow-hidden"
      style={{ height: '100dvh' }}
    >
      <ReusableHeader sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ReusableSidebar
          navItems={navItems}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <main className="min-w-0 flex-1 overflow-y-auto flex flex-col bg-[var(--color-surface)]">

          {children}
        </main>
      </div>
    </div>
  )
}