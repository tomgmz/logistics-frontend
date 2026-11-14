import type { Metadata } from 'next'
import SystemMaintenanceView from './SystemMaintenanceView'

export const metadata: Metadata = {
  title: 'System Maintenance',
}

export default function SystemMaintenancePage() {
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[var(--color-bg)]">
      <SystemMaintenanceView />
    </div>
  )
}
