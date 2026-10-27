'use client'

import { ReactNode, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import ReusableHeader  from './ReusableHeader'
import ReusableSidebar from './ReusableSidebar'
import SiteFooter      from './SiteFooter'
import { useEndOfPageFooter } from './useEndOfPageFooter'
import PushProvider                  from '@/components/push/PushProvider'
import EmergencyCallProvider         from '@/components/calls/EmergencyCallProvider'
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

  // The header's title: the sidebar item the page sits under (the longest
  // matching link, so a sub-page takes its module's name).
  const title = useMemo(() => {
    const path = pathname ?? ''
    return navItems
      .filter((item) => path === item.href || path.startsWith(item.href.replace(/\/$/, '') + '/'))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label
  }, [navItems, pathname])

  // Gate the active route by module access and expose the flags to its view.
  const currentModule = moduleFromHref(pathname ?? '')
  const currentFlags  = currentModule ? moduleFlags(user, currentModule) : ALL_FLAGS
  const blocked       = currentModule !== null && !currentFlags.can_view

  const contentRef = useRef<HTMLDivElement>(null)
  const footerRef  = useRef<HTMLDivElement>(null)
  useEndOfPageFooter(contentRef, footerRef, pathname)

  return (
    <div
      suppressHydrationWarning
      className="flex bg-[var(--color-bg)] overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {/* The sidebar runs the full height, from the very top; the header sits
          beside it over the content only (the Figma), so a module's title can
          go at the very top. */}
      <ReusableSidebar navItems={visibleNavItems} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ReusableHeader sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} title={title} />

        <main className="relative min-w-0 flex-1 overflow-hidden flex flex-col bg-[var(--color-surface)]">
          <div ref={contentRef} className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {blocked ? (
              <ModuleNoAccess />
            ) : (
              <ModuleAccessProvider flags={currentFlags}>{children}</ModuleAccessProvider>
            )}
          </div>
          {/* Inside <main>, so never under the sidebar; useEndOfPageFooter docks it. */}
          <div ref={footerRef} className="shrink-0 left-0 right-0 bottom-0">
            <SiteFooter variant="compact" />
          </div>
        </main>
      </div>

      <PushProvider />
      {/* Rings this browser when a driver places an emergency call. */}
      {(user?.role === 'operations_manager' || user?.role === 'admin') && <EmergencyCallProvider />}
    </div>
  )
}