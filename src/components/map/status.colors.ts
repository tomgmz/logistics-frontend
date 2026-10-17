import { BookingStatus } from '@/app/types/maps/routemap.types'
import { bookingStatusColor } from '@/lib/palette'

export function statusColor(s: BookingStatus | 'UNKNOWN' | string): string {
  return bookingStatusColor(s)
}
