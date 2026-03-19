'use client'

import { useEffect, useRef, useState } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps'
import { OptimizedStop, OptimizeRouteResponse } from '@/app/types/route.types'
import { motion, AnimatePresence } from 'framer-motion'

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!

interface DirectionsRendererProps {
  origin: { latitude: number; longitude: number }
  stops: OptimizedStop[]
}

interface StopCardProps {
  stop: OptimizedStop
  isActive: boolean
  onMarkDelivered: (id: string) => void
  onMarkFailed: (id: string) => void
  onClick: () => void
}

//RENDER DIRECTIONS

function DirectionsRenderer({ origin, stops }: DirectionsRendererProps) {
  const map = useMap()
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null)

  useEffect(() => {
    if (!map || stops.length === 0) return

    const directionsService = new google.maps.DirectionsService()

    if (!rendererRef.current) {
      rendererRef.current = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#3B82F6',
          strokeWeight: 5,
          strokeOpacity: 0.8,
        },
      })
    }

    rendererRef.current.setMap(map)

    const waypoints = stops.slice(0, -1).map((stop) => ({
      location: new google.maps.LatLng(stop.latitude, stop.longitude),
      stopover: true,
    }))

    const lastStop = stops[stops.length - 1]

    directionsService.route(
      {
        origin: new google.maps.LatLng(origin.latitude, origin.longitude),
        destination: new google.maps.LatLng(lastStop.latitude, lastStop.longitude),
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          rendererRef.current?.setDirections(result)
        }
      }
    )

    return () => {
      rendererRef.current?.setMap(null)
    }
  }, [map, origin, stops])

  return null
}

//STOP CARD

function StopCard({
  stop,
  isActive,
  onMarkDelivered,
  onMarkFailed,
  onClick,
}: StopCardProps) {
  const statusColor: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-800 border-yellow-300',
    delivered: 'bg-green-100  text-green-800  border-green-300',
    failed:    'bg-red-100    text-red-800    border-red-300',
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        rounded-xl border-2 p-4 cursor-pointer transition-all
        ${isActive ? 'border-blue-500 bg-blue-50 shadow-lg' : 'border-gray-200 bg-white'}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0
            ${stop.status === 'delivered' ? 'bg-green-500' :
              stop.status === 'failed'    ? 'bg-red-500'   : 'bg-blue-500'}
          `}>
            {stop.optimized_sequence_order}
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">{stop.address}</p>
            {stop.notes && (
              <p className="text-xs text-gray-500 mt-0.5">📝 {stop.notes}</p>
            )}
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full border font-medium flex-shrink-0 ${statusColor[stop.status]}`}>
          {stop.status}
        </span>
      </div>

      <AnimatePresence>
        {isActive && stop.status === 'pending' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 flex gap-2"
          >
            <button
              onClick={(e) => { e.stopPropagation(); onMarkDelivered(stop.destination_id) }}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-lg font-medium transition-colors"
            >
              ✅ Delivered
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMarkFailed(stop.destination_id) }}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-lg font-medium transition-colors"
            >
              ❌ Failed
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

//MAIN ROUTE COMPONENT

export default function RouteMap({ bookingId }: { bookingId: string }) {
  const [routeData, setRouteData] = useState<OptimizeRouteResponse | null>(null)
  const [stops, setStops] = useState<OptimizedStop[]>([])
  const [activeStopId, setActiveStopId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadRoute() {
      try {
        setLoading(true)
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/route-optimization/optimize/${bookingId}`,
          { method: 'POST' }
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.message as string)
        setRouteData(json.data as OptimizeRouteResponse)
        setStops((json.data as OptimizeRouteResponse).optimized_stops)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Something went wrong'
        setError(message)
      } finally {
        setLoading(false)
      }
    }
    loadRoute()
  }, [bookingId])

  const handleMarkDelivered = async (destinationId: string) => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/booking/destinations/${destinationId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'delivered',
            delivered_at: new Date().toISOString(),
          }),
        }
      )
      setStops((prev) =>
        prev.map((s) =>
          s.destination_id === destinationId ? { ...s, status: 'delivered' as const } : s
        )
      )
      setActiveStopId(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      alert(`Failed to update: ${message}`)
    }
  }

  const handleMarkFailed = async (destinationId: string) => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/booking/destinations/${destinationId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'failed' }),
        }
      )
      setStops((prev) =>
        prev.map((s) =>
          s.destination_id === destinationId ? { ...s, status: 'failed' as const } : s
        )
      )
      setActiveStopId(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      alert(`Failed to update: ${message}`)
    }
  }

  const completedCount = stops.filter((s) => s.status === 'delivered').length
  const pendingCount   = stops.filter((s) => s.status === 'pending').length
  const failedCount    = stops.filter((s) => s.status === 'failed').length

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 font-medium">Optimizing your route...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center text-red-500">
        <p className="text-xl font-bold mb-2">Error</p>
        <p>{error}</p>
      </div>
    </div>
  )

  if (!routeData) return null

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <div className="flex flex-col h-screen bg-gray-50">

        {/* HEADER */}
        <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h1 className="font-bold text-gray-800 text-lg">Today&apos;s Route</h1>
            <p className="text-xs text-gray-500">{routeData.origin.address}</p>
          </div>
          <div className="flex gap-2 text-xs font-medium">
            <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">✅ {completedCount}</span>
            <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">⏳ {pendingCount}</span>
            <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full">❌ {failedCount}</span>
          </div>
        </div>

        {/* MAP */}
        <div className="flex-1 relative">
          <Map
            mapId="logistics-driver-map"
            defaultCenter={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
            defaultZoom={12}
            gestureHandling="greedy"
            disableDefaultUI={false}
            className="w-full h-full"
          >
            {/* ORIGIN MARKER */}
            <AdvancedMarker
              position={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
              title="Origin"
            >
              <div className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                🏭 Start
              </div>
            </AdvancedMarker>

            {/* STOP MARKER */}
            {stops.map((stop) => (
              <AdvancedMarker
                key={stop.destination_id}
                position={{ lat: stop.latitude, lng: stop.longitude }}
                title={stop.address}
                onClick={() => setActiveStopId(
                  activeStopId === stop.destination_id ? null : stop.destination_id
                )}
              >
                <Pin
                  background={
                    stop.status === 'delivered' ? '#22C55E' :
                    stop.status === 'failed'    ? '#EF4444' : '#3B82F6'
                  }
                  glyphColor="#fff"
                  borderColor="#fff"
                  glyph={String(stop.optimized_sequence_order)}
                />
              </AdvancedMarker>
            ))}

            {/* ROUTE LINE */}
            <DirectionsRenderer
              origin={routeData.origin}
              stops={stops.filter((s) => s.status === 'pending')}
            />
          </Map>
        </div>

        {/*STOP LIST */}
        <div className="bg-white border-t border-gray-200 max-h-64 overflow-y-auto">
          <div className="p-3 space-y-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide px-1">
              {routeData.total_stops} Stops
            </p>
            {stops.map((stop) => (
              <StopCard
                key={stop.destination_id}
                stop={stop}
                isActive={activeStopId === stop.destination_id}
                onMarkDelivered={handleMarkDelivered}
                onMarkFailed={handleMarkFailed}
                onClick={() => setActiveStopId(
                  activeStopId === stop.destination_id ? null : stop.destination_id
                )}
              />
            ))}
          </div>
        </div>

      </div>
    </APIProvider>
  )
}