'use client'

import { useEffect, useState } from 'react'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import { OptimizedStop, OptimizeRouteResponse } from '@/app/types/route.types'
import { motion, AnimatePresence } from 'framer-motion'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import MenuIcon from '@mui/icons-material/Menu'
import CloseIcon from '@mui/icons-material/Close'
import MapIcon from '@mui/icons-material/Map'
import ListIcon from '@mui/icons-material/List'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { getApiUrl } from '@/app/lib/api/api-url'
import { getBookingById } from '@/app/lib/api/client/booking.api'
import { BookingDetail } from '@/app/types/maps/routemap.types'
import { StatusBadge } from './RouteMapComponents'
import { DetailsPanelContent } from './DetailsPanelContent'
import { DirectionsRenderer } from './DirectionsRenderer'

const GOOGLE_MAPS_KEY   = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID!

export default function RouteMap({ bookingId }: { bookingId: string }) {
  const [routeData,     setRouteData]     = useState<OptimizeRouteResponse | null>(null)
  const [stops,         setStops]         = useState<OptimizedStop[]>([])
  const [bookingDetail, setBookingDetail] = useState<BookingDetail | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)

  const [mobileTab,     setMobileTab]     = useState<'map' | 'bookings'>('map')
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [sidebarOpen,   setSidebarOpen]   = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      try {
        setLoading(true)
        const baseUrl = getApiUrl()

        const res  = await fetch(`${baseUrl}/route-optimization/${bookingId}`, {
          credentials: 'include',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.message ?? 'Failed to load route')

        const optimizedRoute = json.data as OptimizeRouteResponse
        const detail         = await getBookingById(bookingId) as BookingDetail

        if (!cancelled) {
          setRouteData(optimizedRoute)
          setStops(
            [...(optimizedRoute?.optimized_stops ?? [])].sort(
              (a, b) => a.optimized_sequence_order - b.optimized_sequence_order,
            ),
          )
          setBookingDetail(detail)
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAll()
    return () => { cancelled = true }
  }, [bookingId])

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0f0f0f]">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
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

  const completedStops     = stops.filter((s) => s.status === 'delivered').length
  const totalStops         = stops.length
  const progressPercentage = totalStops > 0 ? (completedStops / totalStops) * 100 : 0
  const bookingStatus      = bookingDetail?.status?.toUpperCase() ?? 'BOOKED'

  const mapContent = (
    <Map
      mapId={GOOGLE_MAPS_MAP_ID}
      defaultCenter={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
      defaultZoom={11}
      gestureHandling="greedy"
      className="w-full h-full"
    >
      {/* Origin */}
      <AdvancedMarker
        position={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
        title={routeData.origin.address}
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

      {/* Numbered stop markers */}
      {stops.map((stop) => {
        const bg =
          stop.status === 'delivered' ? '#22C55E'
          : stop.status === 'failed'  ? '#EF4444'
          : '#3B82F6'
        return (
          <AdvancedMarker
            key={stop.destination_id}
            position={{ lat: stop.latitude, lng: stop.longitude }}
            title={`#${stop.optimized_sequence_order} — ${stop.address}`}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: bg,
                border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1, fontFamily: 'inherit',
              }}>
                {stop.optimized_sequence_order}
              </div>
              <div style={{
                width: 0, height: 0, marginTop: -1,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: `7px solid ${bg}`,
              }} />
            </div>
          </AdvancedMarker>
        )
      })}

      <DirectionsRenderer origin={routeData.origin} stops={stops} />
    </Map>
  )

  const detailsPanel = (
    <DetailsPanelContent
      routeData={routeData}
      bookingDetail={bookingDetail}
      completedStops={completedStops}
      totalStops={totalStops}
      progressPercentage={progressPercentage}
    />
  )

  const progressChip = (
    <div className="bg-[#111] border border-gray-700/80 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-sm">
      <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
        <AccessTimeIcon sx={{ fontSize: 16, color: '#06b6d4' }} />
      </div>
      <div>
        <p className="text-gray-500 text-[9px] uppercase tracking-widest">Stops</p>
        <p className="text-white font-bold text-base leading-none">{completedStops}/{totalStops}</p>
      </div>
      <div className="w-px h-8 bg-gray-800 mx-1" />
      <div>
        <p className="text-gray-500 text-[9px] uppercase tracking-widest">Progress</p>
        <p className="text-white font-bold text-base leading-none">{Math.round(progressPercentage)}%</p>
      </div>
    </div>
  )

  const originToLastRow = (
    <>
      <div className="flex-1 bg-[#1a1a1a] rounded-xl p-3 border border-gray-800/80">
        <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-1">Pickup</p>
        <p className="text-white font-bold text-sm truncate">{routeData.origin.address}</p>
      </div>
      <ArrowForwardIcon sx={{ fontSize: 16, color: '#4b5563', flexShrink: 0 }} />
      {stops.length > 0 && (
        <div className="flex-1 bg-[#1a1a1a] rounded-xl p-3 border border-gray-800/80">
          <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-1">
            Stop {stops[stops.length - 1].optimized_sequence_order}
          </p>
          <p className="text-white font-bold text-sm truncate">
            {stops[stops.length - 1].address}
          </p>
        </div>
      )}
    </>
  )

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} libraries={['routes']}>

      <div className="hidden lg:flex h-screen bg-[#0f0f0f] overflow-hidden font-sans">

        <motion.aside
          initial={{ x: -320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-72 bg-[#0a0a0a] border-r border-gray-800/80 flex flex-col flex-shrink-0"
        >
          <div className="px-4 pt-5 pb-3 border-b border-gray-800/60">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <LocalShippingIcon sx={{ fontSize: 14, color: '#06b6d4' }} />
              </div>
              <span className="text-white font-semibold text-sm tracking-wide">Tracking</span>
            </div>
          </div>

          {bookingDetail && (
            <div className="px-4 py-4">
              <div className="bg-[#1a1a1a] rounded-xl p-3 border border-cyan-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <LocalShippingIcon sx={{ fontSize: 12, color: '#06b6d4' }} />
                  </div>
                  <p className="text-white text-xs font-semibold truncate">{bookingDetail.truck_type_needed}</p>
                </div>
                <StatusBadge status={bookingStatus} />
                <div className="mt-2 pt-2 border-t border-gray-800/60">
                  <p className="text-gray-500 text-[10px] truncate">{bookingDetail.origin}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <ArrowForwardIcon sx={{ fontSize: 10, color: '#4b5563' }} />
                    <p className="text-gray-400 text-[10px]">{stops.length} stop{stops.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.aside>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="w-[420px] bg-[#111111] border-r border-gray-800/80 flex flex-col overflow-y-auto flex-shrink-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800"
        >
          {detailsPanel}
        </motion.section>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex-1 relative"
        >
          {mapContent}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.7, type: 'spring', stiffness: 200 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
          >
            {progressChip}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 }}
            className="absolute top-4 right-4 bg-[#111]/90 border border-cyan-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2.5 backdrop-blur-sm shadow-xl"
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-widest">Live Tracking</p>
              <p className="text-cyan-400 text-xs font-bold">{bookingStatus}</p>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="hidden md:flex lg:hidden h-screen bg-[#0f0f0f] overflow-hidden font-sans flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-gray-800/80 flex-shrink-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <LocalShippingIcon sx={{ fontSize: 14, color: '#06b6d4' }} />
            </div>
            <span className="text-white font-semibold text-sm">{bookingDetail?.truck_type_needed ?? 'Tracking'}</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={bookingStatus} />
            <div className="flex items-center gap-1.5 bg-[#111]/90 border border-cyan-500/30 rounded-lg px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-cyan-400 text-xs font-bold">Live</span>
            </div>
          </div>
        </div>

        <div className="flex-1 relative min-h-0">
          {mapContent}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">{progressChip}</div>
        </div>

        <motion.div
          animate={{ height: sheetExpanded ? '60vh' : '140px' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="bg-[#111111] border-t border-gray-800/80 flex-shrink-0 overflow-hidden flex flex-col"
        >
          <button
            onClick={() => setSheetExpanded(!sheetExpanded)}
            className="flex items-center justify-between px-5 py-3 border-b border-gray-800/60 flex-shrink-0 w-full"
          >
            <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Shipment Details</span>
            <div className="flex items-center gap-2">
              {bookingDetail?.vehicle?.plate_number && (
                <span className="text-cyan-400 text-xs">{bookingDetail.vehicle.plate_number}</span>
              )}
              {sheetExpanded
                ? <KeyboardArrowDownIcon sx={{ fontSize: 18, color: '#6b7280' }} />
                : <KeyboardArrowUpIcon   sx={{ fontSize: 18, color: '#6b7280' }} />
              }
            </div>
          </button>
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800/60 flex-shrink-0">
            {originToLastRow}
          </div>
          {sheetExpanded && (
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800">
              {detailsPanel}
            </div>
          )}
        </motion.div>
      </div>

      <div className="flex md:hidden h-screen bg-[#0f0f0f] overflow-hidden font-sans flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-gray-800/80 flex-shrink-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <LocalShippingIcon sx={{ fontSize: 14, color: '#06b6d4' }} />
            </div>
            <div>
              <p className="text-white font-semibold text-xs leading-none">
                {bookingDetail?.vehicle?.plate_number ?? bookingDetail?.truck_type_needed ?? 'Tracking'}
              </p>
              <p className="text-gray-500 text-[10px]">{bookingDetail?.truck_type_needed ?? ''} · {bookingStatus}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-2.5 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-cyan-400 text-[10px] font-bold">LIVE</span>
            </div>
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center"
            >
              <MenuIcon sx={{ fontSize: 16, color: '#9ca3af' }} />
            </button>
          </div>
        </div>

        <div className="flex bg-[#0a0a0a] border-b border-gray-800/80 flex-shrink-0 z-10">
          {([
            { key: 'map',      label: 'Map',     icon: MapIcon  },
            { key: 'bookings', label: 'Details', icon: ListIcon },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors border-b-2 ${
                mobileTab === key ? 'text-cyan-400 border-cyan-500' : 'text-gray-500 border-transparent'
              }`}
            >
              <Icon sx={{ fontSize: 14 }} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 relative min-h-0">
          <AnimatePresence mode="wait">
            {mobileTab === 'map' && (
              <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col"
              >
                <div className="flex-1 relative">{mapContent}</div>

                <motion.div
                  animate={{ height: sheetExpanded ? '65vh' : '120px' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="bg-[#111111] border-t border-gray-800/80 flex-shrink-0 overflow-hidden flex flex-col absolute bottom-0 left-0 right-0 z-10"
                >
                  <button
                    onClick={() => setSheetExpanded(!sheetExpanded)}
                    className="flex flex-col items-center pt-2 pb-1 flex-shrink-0 w-full"
                  >
                    <div className="w-8 h-1 bg-gray-700 rounded-full mb-2" />
                    <div className="flex items-center justify-between w-full px-5 pb-1">
                      <StatusBadge status={bookingStatus} />
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs">{completedStops}/{totalStops}</span>
                        {sheetExpanded
                          ? <KeyboardArrowDownIcon sx={{ fontSize: 16, color: '#6b7280' }} />
                          : <KeyboardArrowUpIcon   sx={{ fontSize: 16, color: '#6b7280' }} />
                        }
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 px-4 pb-3 flex-shrink-0">
                    {originToLastRow}
                  </div>
                  {sheetExpanded && (
                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800">
                      {detailsPanel}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}

            {mobileTab === 'bookings' && (
              <motion.div key="bookings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="absolute inset-0 flex flex-col bg-[#0a0a0a] overflow-y-auto"
              >
                {detailsPanel}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-80 bg-[#111111] border-l border-gray-800/80 z-50 flex flex-col md:hidden overflow-y-auto"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60 flex-shrink-0">
                <span className="text-white font-semibold text-sm">Shipment Details</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center"
                >
                  <CloseIcon sx={{ fontSize: 16, color: '#9ca3af' }} />
                </button>
              </div>
              {detailsPanel}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </APIProvider>
  )
}