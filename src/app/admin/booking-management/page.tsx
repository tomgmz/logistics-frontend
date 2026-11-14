import type { Metadata } from 'next'
import BookingManagementView from './BookingManagementView'

export const metadata: Metadata = {
  title: 'Booking Management',
}

export default function BookingManagement() {
  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[var(--color-bg)]">
      <BookingManagementView />
    </div>
  )
}
 