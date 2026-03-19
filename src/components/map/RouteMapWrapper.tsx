'use client'

import dynamic from 'next/dynamic'

const RouteMap = dynamic(
  () => import('@/components/map/RouteMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading map...</p>
        </div>
      </div>
    ),
  }
)

export default function RouteMapWrapper({ bookingId }: { bookingId: string }) {
  return <RouteMap bookingId={bookingId} />
}