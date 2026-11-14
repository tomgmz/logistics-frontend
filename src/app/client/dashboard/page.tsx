import type { Metadata } from 'next'
import ClientDashboardView from "./ClientDashboardView"

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default function ClientDashboardPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ClientDashboardView />
    </div>
  )
}
