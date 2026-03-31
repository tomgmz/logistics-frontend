'use client'

import { ReactNode } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/lib/store/hooks'
import { setSidebarOpen } from '@/app/lib/store/bookingSlice'
import Header from '../Header'
import Sidebar from '../SideBar'

export default function DashboardShell({ children }: { children: ReactNode }) {
  const dispatch     = useAppDispatch()
  const sidebarOpen  = useAppSelector((s) => s.booking.sidebarOpen)

  return (
    <div suppressHydrationWarning className="flex flex-col h-screen bg-[var(--color-bg)] overflow-hidden">
      <Header
        sidebarOpen={sidebarOpen}
        setSidebarOpen={(val: boolean) => dispatch(setSidebarOpen(val))}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={(val: boolean) => dispatch(setSidebarOpen(val))}
        />

        <main className="flex-1 overflow-hidden bg-[var(--color-surface)]">
          {children}
        </main>
      </div>
    </div>
  )
}