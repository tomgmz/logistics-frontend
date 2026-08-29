import RouteMapWrapper from '@/components/map/RouteMapWrapper'

/**
 * The client's delivery tracking map.
 *
 * This route is static, so there is no `bookingId` to read — the previous
 * version destructured one from `params` and always got `undefined`, which
 * `RouteMap` quietly tolerated by rendering the list with nothing selected. The
 * list-first behaviour is what we want here, so the dead plumbing is gone rather
 * than the segment being made dynamic: a client picks the delivery they want to
 * watch from their own bookings.
 */
export default function ClientTrackingPage() {
  return <RouteMapWrapper />
}
