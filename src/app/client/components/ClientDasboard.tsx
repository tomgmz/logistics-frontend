'use client'

import Sidebar from './SideBar'
import Header from './Header'
import BookingWizard from './BookingWizard'
import { useSessionState } from '../hooks/UseSessionState'

export type ActivePage =
  | 'overview'
  | 'booking'
  | 'tracking'
  | 'billing'
  | 'history'
  | 'settings'

export default function ClientDashboard() {
  const [activePage, setActivePage]   = useSessionState<ActivePage>('client:activePage', 'booking')
  const [sidebarOpen, setSidebarOpen] = useSessionState<boolean>('client:sidebarOpen', true)

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg)] overflow-hidden">
      <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activePage={activePage}
          setActivePage={setActivePage}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <main className="flex-1 overflow-auto bg-[var(--color-surface)]">
          {activePage === 'booking'  && <BookingWizard />}
          {activePage === 'overview' && <Placeholder title="Overview" />}
          {activePage === 'tracking' && <Placeholder title="Tracking" />}
          {activePage === 'billing'  && <Placeholder title="Billing" />}
          {activePage === 'history'  && <Placeholder title="History" />}
          {activePage === 'settings' && <Placeholder title="Settings" />}
        </main>
      </div>
    </div>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <span className="font-body text-[var(--color-muted)] text-3xl">{title}</span>
    </div>
  )
}