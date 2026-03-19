import RouteMapWrapper from '@/components/map/RouteMapWrapper'

interface Props {
  params: Promise<{ bookingId: string }>
}

export default async function DriverRoutePage({ params }: Props) {
  const { bookingId } = await params
  return <RouteMapWrapper bookingId={bookingId} />
}