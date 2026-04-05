import { BookingStatus } from '@/app/types/maps/routemap.types'

export function statusColor(s: BookingStatus | 'UNKNOWN' | string): string {
  const u = (s ?? '').replace(/\s+/g, '_').toUpperCase()

  switch (u as BookingStatus | 'UNKNOWN') {
    case 'IN_TRANSIT':  return 'var(--color-cyan)'
    case 'COMPLETED':   return 'var(--color-green)'
    case 'ARRIVED':     return 'var(--color-green)'
    case 'ASSIGNED':    return '#f69f26'
    case 'CANCELLED':   return '#f62626'
    case 'BOOKED':
    case 'PENDING':
    case 'UNKNOWN':
    default:            return '#9f9c9c'
  }
}