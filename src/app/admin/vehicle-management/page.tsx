import type { Metadata } from 'next'
import VehicleManagementView from './VehicleManagementView'

export const metadata: Metadata = {
  title: 'Vehicle Management',
}

export default function VehicleManagement() {
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[var(--color-bg)]">
      <VehicleManagementView />
    </div>
  )
}
 