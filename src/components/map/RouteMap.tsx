'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { APIProvider, Map, AdvancedMarker }  from '@vis.gl/react-google-maps'
import { OptimizedStop, OptimizeRouteResponse } from '@/app/types/maps/routemap.types'
import { motion, AnimatePresence }           from 'framer-motion'
import LocalShippingIcon  from '@mui/icons-material/LocalShipping'
import SearchIcon         from '@mui/icons-material/Search'
import ArrowForwardIcon   from '@mui/icons-material/ArrowForward'
import CloseIcon          from '@mui/icons-material/Close'
import RefreshIcon        from '@mui/icons-material/Refresh'
import type { BookingWithRelations }         from '@/app/lib/store/slice/routeMap.slice'
import { StatusBadge }                       from './RouteMapComponents'
import { DetailsPanelContent }               from './DetailsPanelContent'
import { DirectionsRenderer }                from './DirectionsRenderer'
import { useAppDispatch, useAppSelector }    from '@/app/lib/store/hooks'
import {
  fetchBookings,
  fetchRouteAndDetail,
  clearSelection,
  setSelectedId,
} from '@/app/lib/store/slice/routeMap.slice'
import { statusColor } from './status.colors'

const GOOGLE_MAPS_KEY    = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID!
const LOGO_SRC           = 'https://www.figma.com/api/mcp/asset/656e388d-93f0-4b64-8a3d-a39b21a2a160'

function fmtStatus(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function Logo({ height, width, priority }: { height: number; width: number; priority?: boolean }) {
  return (
    <Image
      src={LOGO_SRC}
      alt="8338 Logistics"
      height={height}
      width={width}
      className="object-contain"
      priority={priority}
    />
  )
}

function BookingListItem({
  booking,
  selected,
  loading,
  onClick,
}: {
  booking:  BookingWithRelations
  selected: boolean
  loading:  boolean
  onClick:  () => void
}) {
  const color  = statusColor(booking.status)
  const label  = fmtStatus(booking.status)
  const origin = booking.origin?.split(',')[0] ?? '—'
  const dest   = booking.booking_destinations?.[booking.booking_destinations.length - 1]
                   ?.address?.split(',')[0] ?? '—'

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ x: 2 }}
      className="w-full text-left border-0 outline-none cursor-pointer relative overflow-hidden"
      style={{
        background:  selected ? 'rgba(66,66,66,0.3)' : 'rgba(10,10,10,0.15)',
        borderLeft:  `3px solid ${selected ? color : 'transparent'}`,
        padding:     '12px 12px 10px',
        transition:  'background 0.15s',
      }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(10,10,10,0.6)' }}>
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: color }} />
        </div>
      )}

      <div className="flex justify-end mb-1">
        <span className="ff-sc text-[11px] font-bold" style={{ color }}>{label}</span>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-white text-[10px] font-bold min-w-[24px]">
          {booking.origin?.match(/\b[A-Z]{2,4}\b/)?.[0] ?? 'ORG'}
        </span>
        <div className="flex-1 relative h-3 flex items-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full h-[2px] rounded-full bg-[#333]" />
          </div>
          <div
            className="absolute left-0 h-[2px] rounded-full transition-all duration-1000"
            style={{
              width: booking.status === 'in_transit' ? '35%'
                : booking.status === 'completed'     ? '100%' : '0%',
              background: color,
            }}
          />
          {booking.status === 'in_transit' && (
            <div
              className="absolute w-2.5 h-2.5 rounded-full border border-white"
              style={{ left: '32%', background: color, boxShadow: `0 0 6px ${color}` }}
            />
          )}
        </div>
        <span className="text-white text-[10px] font-bold min-w-[20px] text-right">QC</span>
      </div>

      <div className="flex justify-between items-end">
        <span className="ff-sc text-white text-[12px] truncate max-w-[50%]">{origin}</span>
        <div className="text-right">
          <div className="ff-sc text-white text-[12px] truncate max-w-[100px]">{dest}</div>
          <div className="text-[11px]" style={{ color: '#9f9c9c' }}>{booking.schedule_date}</div>
        </div>
      </div>
    </motion.button>
  )
}

function MapMarkers({ routeData, stops }: { routeData: OptimizeRouteResponse; stops: OptimizedStop[] }) {
  return (
    <>
      <AdvancedMarker
        position={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
        title={routeData.origin.address}
      >
        <motion.div
          initial={{ scale: 0, y: -8 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
          className="text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 border"
          style={{
            background: 'var(--color-bg)',
            borderColor: 'var(--color-cyan)',
            color: 'var(--color-cyan)',
            boxShadow: ' 0 0 12px rgba(77,249,237,0.4)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-cyan)' }} />
          PICKUP
        </motion.div>
      </AdvancedMarker>

      {stops.map((stop) => {
        const bg = stop.status === 'delivered' ? '#3af626'
          : stop.status === 'failed'           ? '#f62626'
          : '#4df9ed'
        return (
          <AdvancedMarker
            key={stop.destination_id}
            position={{ lat: stop.latitude, lng: stop.longitude }}
            title={`#${stop.optimized_sequence_order} — ${stop.address}`}
          >
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center"
                style={{ background: bg, boxShadow: `0 2px 8px ${bg}66`, fontSize: 11, fontWeight: 900, color: '#000', lineHeight: 1 }}
              >
                {stop.optimized_sequence_order}
              </div>
              <div
                className="w-0 h-0 -mt-px"
                style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `7px solid ${bg}` }}
              />
            </div>
          </AdvancedMarker>
        )
      })}
    </>
  )
}

function EmptyMapState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background: 'var(--color-bg)' }}>
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
      >
        <LocalShippingIcon sx={{ fontSize: 64, color: 'var(--color-surface-dark)' }} />
      </motion.div>
      <div className="text-center">
        <p className="ff-sc text-gray-600 text-lg font-bold">Select a booking to track</p>
        <p className="text-gray-700 text-sm mt-1">Choose a delivery from the list on the left</p>
      </div>
    </div>
  )
}

export default function RouteMap({ initialBookingId }: { initialBookingId?: string }) {
  const dispatch  = useAppDispatch()

  const bookings      = useAppSelector((s) => s.routeMap.bookings)
  const listLoading   = useAppSelector((s) => s.routeMap.listLoading)
  const listError     = useAppSelector((s) => s.routeMap.listError)
  const selectedId    = useAppSelector((s) => s.routeMap.selectedId)
  const routeData     = useAppSelector((s) => s.routeMap.routeData)
  const bookingDetail = useAppSelector((s) => s.routeMap.bookingDetail)
  const stops         = useAppSelector((s) => s.routeMap.stops)
  const detailLoading = useAppSelector((s) => s.routeMap.detailLoading)
  const detailError   = useAppSelector((s) => s.routeMap.detailError)

  const [search,          setSearch]          = useState('')
  const [mobileView,      setMobileView]      = useState<'list' | 'map'>('list')
  const [sheetOpen,       setSheetOpen]       = useState(false)
  const [detailPanelOpen, setDetailPanelOpen] = useState(true)

  const filteredList = search.trim()
    ? bookings.filter((b) => {
        const q = search.toLowerCase()
        return (
          b.origin?.toLowerCase().includes(q)  ||
          b.status?.toLowerCase().includes(q)  ||
          b.truck_type_needed?.toLowerCase().includes(q) ||
          b.booking_destinations?.some((d: { address: string }) => d.address.toLowerCase().includes(q))
        )
      })
    : bookings

  const completedStops     = stops.filter((s) => s.status === 'delivered').length
  const totalStops         = stops.length
  const progressPercentage = totalStops > 0 ? (completedStops / totalStops) * 100 : 0

  const loadBookings = useCallback(() => {
    dispatch(fetchBookings())
  }, [dispatch])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  useEffect(() => {
    if (!initialBookingId) return
    dispatch(setSelectedId(initialBookingId))
    dispatch(fetchRouteAndDetail(initialBookingId))
  }, [initialBookingId, dispatch])

  const selectBooking = useCallback(
    (bookingId: string) => {
      if (selectedId === bookingId) return
      dispatch(setSelectedId(bookingId))
      dispatch(fetchRouteAndDetail(bookingId))
      setDetailPanelOpen(true)
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setMobileView('map')
      }
    },
    [dispatch, selectedId]
  )

  const handleClearSelection = useCallback(() => {
    dispatch(clearSelection())
    setMobileView('list')
    setDetailPanelOpen(true)
  }, [dispatch])

  const detailPanel = routeData ? (
    <DetailsPanelContent
      routeData={routeData}
      bookingDetail={bookingDetail}
      completedStops={completedStops}
      totalStops={totalStops}
      progressPercentage={progressPercentage}
    />
  ) : detailLoading ? (
    <div className="flex-1 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
          style={{ borderColor: 'var(--color-cyan)' }} />
        <p className="text-gray-500 text-sm">Loading route data…</p>
      </div>
    </div>
  ) : detailError ? (
    <div className="p-6 text-center">
      <p className="text-red-400 text-sm mb-3">{detailError}</p>
      <button
        onClick={() => selectedId && dispatch(fetchRouteAndDetail(selectedId))}
        className="text-[13px] border px-4 py-2 rounded-lg transition-colors"
        style={{ color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.3)' }}
      >
        Retry
      </button>
    </div>
  ) : null

  const mapContent = routeData ? (
    <Map
      mapId={GOOGLE_MAPS_MAP_ID}
      defaultCenter={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
      defaultZoom={11}
      gestureHandling="greedy"
      className="w-full h-full"
      styles={[
        { elementType: 'geometry',           stylers: [{ color: '#212121' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
        { elementType: 'labels.text.fill',   stylers: [{ color: '#757575' }] },
        { featureType: 'road',  elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
        { featureType: 'poi',   elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
      ] as never}
    >
      <MapMarkers routeData={routeData} stops={stops} />
      <DirectionsRenderer origin={routeData.origin} stops={stops} />
    </Map>
  ) : (
    <EmptyMapState />
  )

  const bookingList = (
    <div className="flex flex-col h-full">
      <div className="p-3 flex-shrink-0">
        <div className="flex items-center gap-2 rounded-[10px] px-3 py-2.5" style={{ background: '#2a2828' }}>
          <SearchIcon sx={{ fontSize: 16, color: '#9f9c9c' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="bg-transparent border-none outline-none text-sm flex-1"
            style={{ color: '#9f9c9c' }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800">
        {listLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--color-cyan)' }} />
            <p className="text-gray-600 text-sm">Loading bookings…</p>
          </div>
        ) : listError ? (
          <div className="p-4 text-center">
            <p className="text-red-400 text-sm mb-3">{listError}</p>
            <button onClick={loadBookings}
              className="text-[13px] flex items-center gap-1 mx-auto hover:opacity-80"
              style={{ color: 'var(--color-cyan)' }}>
              <RefreshIcon sx={{ fontSize: 14 }} /> Retry
            </button>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-600 text-sm">No bookings found</p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredList.map((b, i) => (
              <motion.div
                key={b.booking_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <BookingListItem
                  booking={b}
                  selected={selectedId === b.booking_id}
                  loading={detailLoading && selectedId === b.booking_id}
                  onClick={() => selectBooking(b.booking_id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {selectedId && !detailPanelOpen && (
        <button
          onClick={() => setDetailPanelOpen(true)}
          className="w-full py-2.5 text-xs font-bold uppercase tracking-widest border-t flex items-center justify-center gap-1.5 hover:opacity-70 transition-opacity flex-shrink-0"
          style={{
            color: 'var(--color-cyan)',
            borderColor: 'var(--color-surface-dark)',
            background: 'transparent',
          }}
        >
          <ArrowForwardIcon sx={{ fontSize: 12 }} />
          View Details
        </button>
      )}
    </div>
  )

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} libraries={['routes']}>

      <div
        className="hidden lg:flex h-screen overflow-hidden flex-col ff-body"
        style={{ background: 'var(--color-bg)' }}
      >
        <div
          className="h-16 flex items-center justify-between px-6 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--color-surface-dark)', background: 'var(--color-bg)' }}
        >
          <Logo height={36} width={144} priority />
          <div className="flex items-center gap-2">
            <div className="pill-cyan">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-cyan)' }} />
              Live Tracking
            </div>
            <button
              onClick={loadBookings}
              className="w-8 h-8 rounded-full flex items-center justify-center border hover:opacity-70 transition-opacity"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <RefreshIcon sx={{ fontSize: 14, color: '#9ca3af' }} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div
            className="w-[265px] flex-shrink-0 overflow-hidden flex flex-col border-r"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-surface-dark)' }}
          >
            {bookingList}
          </div>

          <div className="flex-1 relative overflow-hidden">
            {mapContent}

            {routeData && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-2xl border"
                style={{ background: '#111', borderColor: '#333' }}
              >
                <div className="text-center">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest">Completed</p>
                  <p className="text-white font-bold text-sm leading-none">{completedStops}/{totalStops}</p>
                </div>
                <div className="w-px h-8 bg-gray-800" />
                <div className="text-center">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest">Progress</p>
                  <p className="text-white font-bold text-sm leading-none">{Math.round(progressPercentage)}%</p>
                </div>
              </motion.div>
            )}

            <AnimatePresence>
              {(routeData || detailLoading || detailError) && detailPanelOpen && (
                <motion.div
                  initial={{ x: -40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -40, opacity: 0 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 200 }}
                  className="absolute top-4 bottom-4 left-4 w-[500px] z-10 rounded-[24px] overflow-hidden flex flex-col"
                  style={{ background: 'var(--color-surface)' }}
                >
                  <div className="flex-shrink-0 flex justify-end px-3 pt-3">
                    <button
                      onClick={() => setDetailPanelOpen(false)}
                      className="w-8 h-8 rounded-full border flex items-center justify-center hover:opacity-70 transition-opacity"
                      style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                    >
                      <CloseIcon sx={{ fontSize: 14, color: '#9ca3af' }} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
                    {detailPanel}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div
        className="hidden md:flex lg:hidden h-screen overflow-hidden flex-col ff-body"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--color-surface-dark)' }}>
          <Logo height={28} width={112} />
          {routeData && bookingDetail && <StatusBadge status={bookingDetail.status ?? 'pending'} />}
        </div>

        <div className="flex-1 relative min-h-0">{mapContent}</div>

        <motion.div
          animate={{ height: sheetOpen ? '60vh' : '120px' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="flex-shrink-0 overflow-hidden flex flex-col border-t"
          style={{ background: '#111', borderColor: 'var(--color-surface-dark)' }}
        >
          <button
            onClick={() => setSheetOpen(!sheetOpen)}
            className="flex flex-col items-center pt-2 pb-1 flex-shrink-0 w-full"
          >
            <div className="w-10 h-1 rounded-full mb-2" style={{ background: 'var(--color-border)' }} />
            <div className="flex items-center justify-between w-full px-4 pb-1">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                {selectedId ? 'Shipment Details' : 'Select a Booking'}
              </span>
              <span className="text-gray-600 text-xs">{sheetOpen ? '▼' : '▲'}</span>
            </div>
          </button>
          {!sheetOpen && !selectedId && <div className="flex-1 overflow-hidden">{bookingList}</div>}
          {sheetOpen  && <div className="flex-1 overflow-y-auto">{selectedId ? detailPanel : bookingList}</div>}
        </motion.div>
      </div>

      <div
        className="flex md:hidden h-screen overflow-hidden flex-col ff-body"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="h-12 flex items-center justify-between px-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--color-surface-dark)' }}>
          <Logo height={24} width={96} />
          {routeData && (
            <button
              onClick={handleClearSelection}
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--color-cyan)' }}
            >
              <ArrowForwardIcon sx={{ fontSize: 12, transform: 'rotate(180deg)' }} />
              Back
            </button>
          )}
        </div>

        <div className="flex flex-shrink-0 border-b"
          style={{ background: 'var(--color-bg)', borderColor: 'var(--color-surface-dark)' }}>
          {(['list', 'map'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setMobileView(key)}
              className="flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 ff-sc"
              style={{
                color:        mobileView === key ? 'var(--color-cyan)' : '#555',
                borderColor:  mobileView === key ? 'var(--color-cyan)' : 'transparent',
              }}
            >
              {key === 'list' ? 'Bookings' : 'Map'}
            </button>
          ))}
        </div>

        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {mobileView === 'list' ? (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="absolute inset-0 overflow-y-auto"
                style={{ background: 'var(--color-bg)' }}
              >
                {bookingList}
              </motion.div>
            ) : (
              <motion.div
                key="map"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col"
              >
                <div className="relative flex-1">{mapContent}</div>
                {selectedId && (
                  <motion.div
                    animate={{ height: sheetOpen ? '65vh' : '100px' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="absolute bottom-0 left-0 right-0 overflow-hidden border-t flex flex-col z-10"
                    style={{ background: '#111', borderColor: 'var(--color-surface-dark)' }}
                  >
                    <button
                      onClick={() => setSheetOpen(!sheetOpen)}
                      className="flex flex-col items-center pt-2 pb-1 flex-shrink-0 w-full"
                    >
                      <div className="w-10 h-1 rounded-full mb-1" style={{ background: 'var(--color-border)' }} />
                      <div className="flex items-center justify-between w-full px-4">
                        {bookingDetail && <StatusBadge status={bookingDetail.status ?? 'pending'} />}
                        <span className="text-gray-600 text-xs ml-auto">{sheetOpen ? '▼' : '▲'}</span>
                      </div>
                    </button>
                    {sheetOpen && <div className="flex-1 overflow-y-auto">{detailPanel}</div>}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </APIProvider>
  )
}