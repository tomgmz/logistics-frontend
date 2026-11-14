import type { Metadata } from 'next'
import VehicleManagementView from '@/app/admin/vehicle-management/VehicleManagementView'

export const metadata: Metadata = {
  title: 'Vehicle Management',
}

export default function GeneralManagerVehicles() {
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[var(--color-bg)]">
      <VehicleManagementView />
    </div>
  )
}
