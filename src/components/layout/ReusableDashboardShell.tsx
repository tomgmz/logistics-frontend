'use client'

import { ReactNode, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import ReusableHeader  from './ReusableHeader'
import ReusableSidebar from './ReusableSidebar'
import MessengerFloatingPanel        from '@/components/messaging/MessengerFloatingPanel'
import { MessengerBubbleContainer }  from '@/components/messaging/MessengerBubbleContainer'
import PushProvider                  from '@/components/push/PushProvider'
import { ModuleAccessProvider, ModuleNoAccess } from './ModuleAccess'
import { useAuthStore } from '@/lib/store/auth.store'
import { canViewModule, moduleFlags } from '@/lib/permissions'
import { ALL_FLAGS, moduleFromHref } from '@/constants/modules'

interface NavItem {
  href:  string
  label: string
  icon:  ReactNode
}

interface ReusableDashboardShellProps {
  children:  ReactNode
  navItems:  NavItem[]
}

export default function ReusableDashboardShell({ children, navItems }: ReusableDashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const pathname = usePathname()

  // Hide module pages the user hasn't been granted. Non-module items (e.g.
  // Dashboard) and non-managed roles are always shown.
  const visibleNavItems = useMemo(() => {
    return navItems.filter((item) => {
      const moduleKey = moduleFromHref(item.href)
      return moduleKey === null || canViewModule(user, moduleKey)
    })
  }, [navItems, user])

  // Gate the active route by module access and expose the flags to its view.
  const currentModule = moduleFromHref(pathname ?? '')
  const currentFlags  = currentModule ? moduleFlags(user, currentModule) : ALL_FLAGS
  const blocked       = currentModule !== null && !currentFlags.can_view

  return (
    <div
      suppressHydrationWarning
      className="flex flex-col bg-[var(--color-bg)] overflow-hidden"
      style={{ height: '100dvh' }}
    >
      <ReusableHeader sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ReusableSidebar navItems={visibleNavItems} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <main className="min-w-0 flex-1 overflow-hidden flex flex-col bg-[var(--color-surface)]">
          {blocked ? (
            <ModuleNoAccess />
          ) : (
            <ModuleAccessProvider flags={currentFlags}>{children}</ModuleAccessProvider>
          )}
        </main>
      </div>

      <MessengerFloatingPanel />
      <MessengerBubbleContainer />
      <PushProvider />
    </div>
  )
}