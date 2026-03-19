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

interface DirectionsPanelProps {
  origin: { latitude: number; longitude: number }
  stop: OptimizedStop | null
  onClose: () => void
}

interface StopCardProps {
  stop: OptimizedStop
  isActive: boolean
  onMarkDelivered: (id: string) => void
  onMarkFailed: (id: string) => void
  onNavigate: (stop: OptimizedStop) => void
  onClick: () => void
}

// ─── Full Route Directions Renderer ──────────────────────────────────────────

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

// ─── Single Stop Directions Panel ────────────────────────────────────────────

function DirectionsPanel({ origin, stop, onClose }: DirectionsPanelProps) {
  const map = useMap()
  const panelRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null)
  const [duration, setDuration] = useState<string | null>(null)
  const [distance, setDistance] = useState<string | null>(null)

  useEffect(() => {
    if (!map || !stop) return

    const directionsService = new google.maps.DirectionsService()

    // clean up previous renderer
    if (rendererRef.current) {
      rendererRef.current.setMap(null)
      rendererRef.current = null
    }

    rendererRef.current = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      panel: panelRef.current ?? undefined,
      polylineOptions: {
        strokeColor: '#F59E0B',
        strokeWeight: 6,
        strokeOpacity: 1,
      },
    })

    rendererRef.current.setMap(map)

    directionsService.route(
      {
        origin: new google.maps.LatLng(origin.latitude, origin.longitude),
        destination: new google.maps.LatLng(stop.latitude, stop.longitude),
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          rendererRef.current?.setDirections(result)
          map.fitBounds(result.routes[0].bounds)
          const leg = result.routes[0].legs[0]
          setDuration(leg.duration?.text ?? null)
          setDistance(leg.distance?.text ?? null)
        }
      }
    )

    return () => {
      rendererRef.current?.setMap(null)
      rendererRef.current = null
    }
  }, [map, stop, origin])

  if (!stop) return null

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="bg-white border-t-2 border-amber-400 flex flex-col"
      style={{ maxHeight: '40vh' }}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-amber-600 text-base">🧭</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800 truncate">
              Stop {stop.optimized_sequence_order}: {stop.address}
            </p>
            {duration && distance && (
              <p className="text-xs text-amber-600">{duration} · {distance}</p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-2 w-7 h-7 flex items-center justify-center rounded-full hover:bg-amber-200 text-amber-700 font-bold text-lg transition-colors"
        >
          ×
        </button>
      </div>

      {/* Turn-by-turn steps rendered by Google */}
      <div
        ref={panelRef}
        className="overflow-y-auto px-3 py-2 text-sm flex-1
          [&_.adp-directions]:w-full
          [&_table]:w-full [&_table]:border-collapse
          [&_tr]:border-b [&_tr]:border-gray-100
          [&_td]:py-1.5 [&_td]:px-1 [&_td]:align-top [&_td]:text-gray-700
          [&_img]:inline [&_img]:mr-1
        "
      />
    </motion.div>
  )
}

// ─── Stop Card ────────────────────────────────────────────────────────────────

function StopCard({
  stop,
  isActive,
  onMarkDelivered,
  onMarkFailed,
  onNavigate,
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
            className="mt-3 flex flex-col gap-2"
          >
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onNavigate(stop) }}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm py-2 px-3 rounded-lg font-medium transition-colors text-center"
            >
              🧭 Navigate to this stop
            </button>
            <div className="flex gap-2">
              <button
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onMarkDelivered(stop.destination_id) }}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-lg font-medium transition-colors"
              >
                ✅ Delivered
              </button>
              <button
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onMarkFailed(stop.destination_id) }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-lg font-medium transition-colors"
              >
                ❌ Failed
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Main RouteMap Component ──────────────────────────────────────────────────

export default function RouteMap({ bookingId }: { bookingId: string }) {
  const [routeData, setRouteData]     = useState<OptimizeRouteResponse | null>(null)
  const [stops, setStops]             = useState<OptimizedStop[]>([])
  const [activeStopId, setActiveStopId] = useState<string | null>(null)
  const [navStop, setNavStop]         = useState<OptimizedStop | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    async function loadRoute() {
      try {
        setLoading(true)

        // 1. Try existing optimized route first
        const existingRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/route-optimization/${bookingId}`
        )
        const existingJson = await existingRes.json()

        const hasOptimizedRoute =
          existingJson.data?.optimized_stops?.length > 0 &&
          existingJson.data.optimized_stops.every(
            (s: OptimizedStop) => s.latitude && s.longitude
          )

        if (hasOptimizedRoute) {
          setRouteData(existingJson.data)
          setStops(existingJson.data.optimized_stops)
          return
        }

        // 2. Not yet optimized — call optimization API
        const optimizeRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/route-optimization/optimize/${bookingId}`,
          { method: 'POST' }
        )
        const optimizeJson = await optimizeRes.json()
        if (!optimizeRes.ok) throw new Error(optimizeJson.message as string)
        setRouteData(optimizeJson.data as OptimizeRouteResponse)
        setStops((optimizeJson.data as OptimizeRouteResponse).optimized_stops)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Something went wrong'
        setError(message)
      } finally {
        setLoading(false)
      }
    }
    loadRoute()
  }, [bookingId])

  // ─── Navigate full route (external) ────────────────────────────────────────
  const handleStartNavigation = () => {
    if (!routeData) return

    const pendingStops = stops
      .filter((s) => s.status === 'pending')
      .sort((a, b) => a.optimized_sequence_order - b.optimized_sequence_order)

    if (pendingStops.length === 0) {
      alert('All stops are already delivered!')
      return
    }

    const origin = `${routeData.origin.latitude},${routeData.origin.longitude}`
    const destination = `${pendingStops[pendingStops.length - 1].latitude},${pendingStops[pendingStops.length - 1].longitude}`
    const waypoints = pendingStops
      .slice(0, -1)
      .map((s) => `${s.latitude},${s.longitude}`)
      .join('|')

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`
    window.open(url, '_blank')
  }

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
      if (navStop?.destination_id === destinationId) setNavStop(null)
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
      if (navStop?.destination_id === destinationId) setNavStop(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      alert(`Failed to update: ${message}`)
    }
  }

  const handleNavigate = (stop: OptimizedStop) => {
    setNavStop((prev) =>
      prev?.destination_id === stop.destination_id ? null : stop
    )
    setActiveStopId(null)
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

        {/* ─── Header ─────────────────────────────────────────── */}
        <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h1 className="font-bold text-gray-800 text-lg">Today&apos;s Route</h1>
            <p className="text-xs text-gray-500">{routeData.origin.address}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-2 text-xs font-medium">
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">✅ {completedCount}</span>
              <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">⏳ {pendingCount}</span>
              <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full">❌ {failedCount}</span>
            </div>
            <button
              onClick={handleStartNavigation}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1 transition-colors"
            >
              🗺️ Full Route
            </button>
          </div>
        </div>

        {/* ─── Map ─────────────────────────────────────────────── */}
        <div className="flex-1 relative min-h-0">
          <Map
            mapId="logistics-driver-map"
            defaultCenter={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
            defaultZoom={12}
            gestureHandling="greedy"
            disableDefaultUI={false}
            className="w-full h-full"
          >
            {/* origin marker */}
            <AdvancedMarker
              position={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
              title="Origin"
            >
              <div className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                🏭 Start
              </div>
            </AdvancedMarker>

            {/* stop markers */}
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
                    navStop?.destination_id === stop.destination_id ? '#F59E0B' :
                    stop.status === 'delivered' ? '#22C55E' :
                    stop.status === 'failed'    ? '#EF4444' : '#3B82F6'
                  }
                  glyphColor="#fff"
                  borderColor="#fff"
                  glyph={String(stop.optimized_sequence_order)}
                />
              </AdvancedMarker>
            ))}

            {/* full route line — hidden when navigating a single stop */}
            {!navStop && (
              <DirectionsRenderer
                origin={routeData.origin}
                stops={stops.filter((s) => s.status === 'pending')}
              />
            )}
          </Map>
        </div>

        {/* ─── Directions Panel ────────────────────────────────── */}
        <AnimatePresence>
          {navStop && (
            <DirectionsPanel
              origin={routeData.origin}
              stop={navStop}
              onClose={() => setNavStop(null)}
            />
          )}
        </AnimatePresence>

        {/* ─── Stop List ───────────────────────────────────────── */}
        {!navStop && (
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
                  onNavigate={handleNavigate}
                  onClick={() => setActiveStopId(
                    activeStopId === stop.destination_id ? null : stop.destination_id
                  )}
                />
              ))}
            </div>
          </div>
        )}

      </div>
    </APIProvider>
  )
}