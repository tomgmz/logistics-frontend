import type { Metadata } from 'next'
import RouteMapWrapper from '@/components/map/RouteMapWrapper'

export const metadata: Metadata = {
  title: 'Transit Tracking',
}

/**
 * The client's Transit Tracking map.
 *
 * Opens on the list. `?booking=202611-00193` (the dashboard's Track link; the
 * booking number without "BK-", lib/booking-url) opens that booking straight
 * away. It is looked up through the client's own scope, so another company's
 * number opens nothing.
 */
export default async function ClientTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string | string[] }>
}) {
  const { booking } = await searchParams
  const bookingId = typeof booking === 'string' && booking.trim() ? booking.trim() : undefined
  return <RouteMapWrapper initialBookingId={bookingId} />
}
