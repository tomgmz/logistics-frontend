import type { Metadata } from 'next'
import BookingManagementView from '@/app/admin/booking-management/BookingManagementView'

export const metadata: Metadata = {
  title: 'Booking Management',
}

export default function GeneralManagerBookings() {
  return <BookingManagementView roleView="general_manager" />
}
