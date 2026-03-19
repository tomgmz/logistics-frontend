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
import SearchIcon from '@mui/icons-material/Search'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import PlaceIcon from '@mui/icons-material/Place'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID!

interface DirectionsRendererProps {
  origin: { latitude: number; longitude: number }
  stops: OptimizedStop[]
}

interface Booking {
  id: string
  vehicle: string
  date: string
  status: 'BOOKED' | 'IN TRANSIT' | 'ARRIVED' | 'CANCELED'
  origin: string
  destination: string
  time?: string
  plateNumber?: string
}

// DIRECTIONS

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
          strokeColor: '#06b6d4',
          strokeWeight: 4,
          strokeOpacity: 0.9,
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
    return () => { rendererRef.current?.setMap(null) }
  }, [map, origin, stops])

  return null
}

// STATUS BADGE

function StatusBadge({ status }: { status: Booking['status'] }) {
  const config = {
    'BOOKED':     { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40', dot: 'bg-yellow-400' },
    'IN TRANSIT': { bg: 'bg-cyan-500/20',   text: 'text-cyan-400',   border: 'border-cyan-500/40',   dot: 'bg-cyan-400' },
    'ARRIVED':    { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/40',  dot: 'bg-green-400' },
    'CANCELED':   { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/40',    dot: 'bg-red-400' },
  }
  const c = config[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
      {status}
    </span>
  )
}

// BOOKING LIST

function BookingItem({ booking, isActive, onClick }: {
  booking: Booking
  isActive: boolean
  onClick: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ x: 3 }}
      onClick={onClick}
      className={`
        relative px-4 py-3.5 cursor-pointer transition-all duration-200 group
        border-b border-gray-800/60
        ${isActive
          ? 'bg-gray-800/80 border-l-2 border-l-cyan-500'
          : 'border-l-2 border-l-transparent hover:bg-gray-800/40'
        }
      `}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-cyan-500/20' : 'bg-gray-700/60'}`}>
            <LocalShippingIcon sx={{ fontSize: 14, color: isActive ? '#06b6d4' : '#9ca3af' }} />
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">{booking.origin}</p>
            <p className="text-gray-500 text-[10px] truncate">{booking.date}</p>
          </div>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="flex items-center gap-1.5 pl-9">
        <span className="text-gray-500 text-[10px] truncate flex-1">{booking.origin}</span>
        <ArrowForwardIcon sx={{ fontSize: 10, color: '#4b5563' }} />
        <span className="text-gray-400 text-[10px] truncate flex-1 text-right">{booking.destination}</span>
        {booking.time && (
          <span className="text-cyan-400 text-[10px] font-medium ml-1 flex-shrink-0">{booking.time}</span>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex gap-1 pl-9 mt-2">
        {(['BOOKED', 'IN TRANSIT', 'ARRIVED'] as const).map((s) => {
          const statuses: Booking['status'][] = ['BOOKED', 'IN TRANSIT', 'ARRIVED', 'CANCELED']
          const currentIdx = statuses.indexOf(booking.status)
          const thisIdx = statuses.indexOf(s)
          return (
            <div
              key={s}
              className={`h-0.5 w-6 rounded-full transition-all ${
                thisIdx <= currentIdx && booking.status !== 'CANCELED'
                  ? 'bg-cyan-500'
                  : 'bg-gray-700'
              }`}
            />
          )
        })}
      </div>
    </motion.div>
  )
}

// ROUTE TIMELINE

function RouteStop({
  address,
  city,
  time,
  isOrigin,
  isLast,
  status,
  deliveryDate,
  totalCost,
}: {
  address: string
  city: string
  time?: string
  isOrigin?: boolean
  isLast?: boolean
  status?: 'pending' | 'delivered' | 'failed'
  deliveryDate?: string
  totalCost?: string
}) {
  return (
    <div className="flex gap-3">
      {/* Timeline line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
          isOrigin
            ? 'bg-gray-700 border-gray-600'
            : isLast
            ? 'bg-red-500 border-red-400'
            : status === 'delivered'
            ? 'bg-green-500 border-green-400'
            : 'bg-cyan-500/20 border-cyan-500/60'
        }`}>
          {status === 'delivered' ? (
            <CheckCircleIcon sx={{ fontSize: 14, color: '#fff' }} />
          ) : (
            <PlaceIcon sx={{ fontSize: 14, color: isLast ? '#fff' : isOrigin ? '#9ca3af' : '#06b6d4' }} />
          )}
        </div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[60px] border-l-2 border-dashed border-gray-700 my-1" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-2">
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-white font-semibold text-sm">{address}</p>
            <p className="text-gray-500 text-xs">{city}</p>
          </div>
          {time && <span className="text-gray-400 text-xs">{time}</span>}
        </div>

        {/* Status indicator for delivered stops */}
        {status === 'delivered' && (
          <div className="mt-2">
            <div className="inline-flex items-center gap-1.5 bg-green-900/30 border border-green-700/50 text-green-400 px-2.5 py-1 rounded-lg">
              <CheckCircleIcon sx={{ fontSize: 12 }} />
              <span className="text-xs font-medium">Delivered</span>
            </div>
          </div>
        )}

        {/* Delivery info (only shown for in-transit) */}
        {!isLast && deliveryDate && status !== 'delivered' && (
          <div className="mt-2 space-y-1.5">
            <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-[10px]">Estimated Delivery</span>
                <span className="text-white text-xs font-medium">{deliveryDate}</span>
              </div>
            </div>
            {totalCost && (
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 border border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-[10px]">Total Cost</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-xs font-medium">{totalCost}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/50 font-medium">
                      Paid
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// MAIN ROUTEMAP

export default function RouteMap({ bookingId }: { bookingId: string }) {
  const [routeData, setRouteData] = useState<OptimizeRouteResponse | null>(null)
  const [stops, setStops] = useState<OptimizedStop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBooking, setSelectedBooking] = useState<string>(bookingId)

  // Mock bookings 
  const bookings: Booking[] = [
    {
      id: '1',
      vehicle: 'L300',
      date: 'February 2, 2026',
      status: 'IN TRANSIT',
      origin: 'Quezon City',
      destination: 'Manila',
      time: '02:45 PM',
      plateNumber: 'CJK 0856',
    },
    {
      id: '2',
      vehicle: 'L300',
      date: 'February 2, 2026',
      status: 'ARRIVED',
      origin: 'Carluvao',
      destination: 'Maharlika',
    },
    {
      id: '3',
      vehicle: 'L300',
      date: 'February 1, 2026',
      status: 'BOOKED',
      origin: 'Makati',
      destination: 'Quezon City',
    },
  ]

  const filteredBookings = bookings.filter(
    (b) =>
      b.origin.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.plateNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    async function loadRoute() {
      try {
        setLoading(true)
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

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0f0f0f]">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="w-16 h-16 border-4 border-gray-800 rounded-full" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-gray-400 text-sm font-medium tracking-wide">Loading tracking information...</p>
      </motion.div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-[#0f0f0f]">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-3">
          <span className="text-red-400 text-xl">!</span>
        </div>
        <p className="text-white font-semibold mb-1">Unable to load tracking data</p>
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    </div>
  )

  if (!routeData) return null

  const totalDuration = '2 hr 13 min'
  const activeBooking = bookings.find((b) => b.id === selectedBooking)
  
  // Calculate delivery progress
  const completedStops = stops.filter((s) => s.status === 'delivered').length
  const totalStops = stops.length
  const progressPercentage = totalStops > 0 ? (completedStops / totalStops) * 100 : 0

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <div className="flex h-screen bg-[#0f0f0f] overflow-hidden font-sans">

        {/* SIDEBAR */}
        <motion.aside
          initial={{ x: -320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-72 bg-[#0a0a0a] border-r border-gray-800/80 flex flex-col flex-shrink-0"
        >
          {/* Header */}
          <div className="px-4 pt-5 pb-3 border-b border-gray-800/60">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <LocalShippingIcon sx={{ fontSize: 14, color: '#06b6d4' }} />
              </div>
              <span className="text-white font-semibold text-sm tracking-wide">My Bookings</span>
            </div>

            {/* Search */}
            <div className="relative">
              <SearchIcon sx={{ fontSize: 15, color: '#4b5563', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search bookings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-8 pr-3 py-2 text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Booking count */}
          <div className="px-4 py-2.5 flex items-center justify-between">
            <span className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest">Your Shipments</span>
            <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full font-bold">
              {filteredBookings.length}
            </span>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800">
            <AnimatePresence>
              {filteredBookings.map((booking, i) => (
                <motion.div
                  key={booking.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <BookingItem
                    booking={booking}
                    isActive={selectedBooking === booking.id}
                    onClick={() => setSelectedBooking(booking.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.aside>

        {/* BOOKING DETAILS */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="w-[420px] bg-[#111111] border-r border-gray-800/80 flex flex-col overflow-y-auto flex-shrink-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800"
        >
          {/* Vehicle header */}
          <div className="p-5 border-b border-gray-800/60">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                {/* Icon avatars */}
                {[0, 1].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                    <LocalShippingIcon sx={{ fontSize: 14, color: '#6b7280' }} />
                  </div>
                ))}
                {[0, 1].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                    <PlaceIcon sx={{ fontSize: 14, color: '#6b7280' }} />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status="IN TRANSIT" />
                <span className="text-cyan-400 text-xs font-medium">02:45 PM</span>
              </div>
            </div>

            {/* Vehicle visual */}
            <div className="text-center mb-4">
              <p className="text-gray-500 text-xs font-medium tracking-widest uppercase mb-1">Vehicle</p>
              <h2 className="text-4xl font-black text-white tracking-tight mb-4">L300</h2>
              <div className="relative bg-gradient-to-b from-gray-800/60 to-gray-900/60 rounded-2xl border border-gray-700/50 p-6 mb-3 overflow-hidden">
                <div
                  className="absolute inset-0 opacity-[0.04]"
                  style={{
                    backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                  }}
                />
                <LocalShippingIcon sx={{ fontSize: 100, color: '#374151' }} className="relative z-10" />
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-white font-bold text-lg tracking-widest">CJK 0856</p>
              </div>
            </div>

            {/* Delivery Progress */}
            <div className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800/80 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500 text-xs">Delivery Progress</span>
                <span className="text-white text-sm font-bold">{completedStops}/{totalStops} stops</span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-cyan-500 to-green-500"
                />
              </div>
            </div>

            {/* Origin / Destination cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#1a1a1a] rounded-xl p-3 border border-gray-800/80">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest">Pickup</span>
                </div>
                <p className="text-white font-bold text-sm mb-0.5">CABUYAO</p>
                <p className="text-gray-500 text-[10px] mb-2">Laguna City</p>
                <div className="space-y-1 pt-2 border-t border-gray-800">
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-[9px]">Scheduled</span>
                    <span className="text-gray-300 text-[10px] font-medium">12:15 PM</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1a1a] rounded-xl p-3 border border-gray-800/80">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest">Delivery</span>
                </div>
                <p className="text-white font-bold text-sm mb-0.5">MAHARLIKA</p>
                <p className="text-gray-500 text-[10px] mb-2">Quezon City</p>
                <div className="space-y-1 pt-2 border-t border-gray-800">
                  <div className="flex justify-between">
                    <span className="text-gray-600 text-[9px]">ETA</span>
                    <span className="text-green-400 text-[10px] font-medium">03:05 PM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Route section */}
          <div className="p-5 border-b border-gray-800/60">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Route Details</span>
              <div className="flex items-center gap-2 bg-gray-800/60 rounded-full px-3 py-1 border border-gray-700/50">
                <AccessTimeIcon sx={{ fontSize: 12, color: '#06b6d4' }} />
                <span className="text-cyan-400 text-xs font-semibold">1 HR 6 MINS</span>
              </div>
            </div>

            <RouteStop
              address="8338 Logistics Parking"
              city="Cabuyao, Laguna City"
              time="12:15 PM"
              isOrigin
              status="delivered"
              deliveryDate="FEBRUARY 2, 2026"
              totalCost="$180"
            />
            <RouteStop
              address="MTR Port"
              city="Maharlika, Quezon City"
              time="03:05 PM"
              isLast
              status="pending"
            />
          </div>

          {/* Cargo details */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Shipment Details</span>
              <div className="flex items-center gap-1.5 bg-gray-800/60 rounded-full px-3 py-1 border border-gray-700/50">
                <span className="text-gray-500 text-[9px] uppercase tracking-wide">Weight</span>
                <span className="text-white text-xs font-bold">186 KG</span>
              </div>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Type of Goods', value: 'General Cargo' },
                { label: 'Packages', value: '24 units' },
                { label: 'Tracking ID', value: 'TRK-2026-001' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg px-3 py-2.5 border border-gray-800/60">
                  <span className="text-gray-500 text-xs">{label}</span>
                  <span className="text-gray-200 text-xs font-medium">{value}</span>
                </div>
              ))}
            </div>

            {/* Support section */}
            <div className="mt-5 pt-4 border-t border-gray-800">
              <p className="text-gray-500 text-xs mb-3">Need help with your delivery?</p>
              <button className="w-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-sm font-medium py-2.5 rounded-lg transition-colors">
                Contact Support
              </button>
            </div>
          </div>
        </motion.section>

        {/* MAP */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex-1 relative"
        >
          <Map
            mapId={GOOGLE_MAPS_MAP_ID}
            defaultCenter={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
            defaultZoom={11}
            gestureHandling="greedy"
            disableDefaultUI={false}
            className="w-full h-full"
          >
            {/* Origin */}
            <AdvancedMarker
              position={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
              title="Pickup Location"
            >
              <motion.div
                initial={{ scale: 0, y: -10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ delay: 0.6, type: 'spring', stiffness: 300 }}
                className="bg-cyan-500 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg shadow-cyan-500/40 flex items-center gap-1.5 border border-cyan-400"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                PICKUP
              </motion.div>
            </AdvancedMarker>

            {/* Stop markers */}
            {stops.map((stop) => (
              <AdvancedMarker
                key={stop.destination_id}
                position={{ lat: stop.latitude, lng: stop.longitude }}
                title={stop.address}
              >
                <Pin
                  background={
                    stop.status === 'delivered' ? '#22C55E' :
                    stop.status === 'failed'    ? '#EF4444' : '#3B82F6'
                  }
                  glyphColor="#fff"
                  borderColor="transparent"
                  glyph={String(stop.optimized_sequence_order)}
                />
              </AdvancedMarker>
            ))}

            {/* Route line */}
            <DirectionsRenderer
              origin={routeData.origin}
              stops={stops}
            />
          </Map>

          {/* Duration & Progress overlay */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.7, type: 'spring', stiffness: 200 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
          >
            <div className="bg-[#111] border border-gray-700/80 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                <AccessTimeIcon sx={{ fontSize: 16, color: '#06b6d4' }} />
              </div>
              <div>
                <p className="text-gray-500 text-[9px] uppercase tracking-widest">ETA</p>
                <p className="text-white font-bold text-base leading-none">{totalDuration}</p>
              </div>
              <div className="w-px h-8 bg-gray-800 mx-1" />
              <div>
                <p className="text-gray-500 text-[9px] uppercase tracking-widest">Progress</p>
                <p className="text-white font-bold text-base leading-none">{completedStops}/{totalStops}</p>
              </div>
            </div>
          </motion.div>

          {/* Live tracking indicator */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 }}
            className="absolute top-4 right-4 bg-[#111]/90 border border-cyan-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2.5 backdrop-blur-sm shadow-xl"
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-widest">Live Tracking</p>
              <p className="text-cyan-400 text-xs font-bold">In Transit</p>
            </div>
          </motion.div>
        </motion.div>

      </div>
    </APIProvider>
  )
}