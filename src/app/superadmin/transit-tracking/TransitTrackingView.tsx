'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps'
import SearchIcon from '@mui/icons-material/Search'
import RefreshIcon from '@mui/icons-material/Refresh'
import CloseIcon from '@mui/icons-material/Close'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import { MapPin, Package, User, Building2 } from 'lucide-react'

import { DirectionsRenderer } from '@/components/map/DirectionsRenderer'
import { DetailsPanelContent } from '@/components/map/DetailsPanelContent'
import { StatusBadge } from '@/components/map/RouteMapComponents'
import { statusColor } from '@/components/map/status.colors'
import { useAppDispatch, useAppSelector } from '@/app/lib/hooks/hooks'
import { useAuthStore } from '@/app/lib/store/auth.store'
import {
  fetchBookings,
  fetchRouteAndDetail,
  clearSelection,
  setSelectedId,
  type BookingWithRelations,
} from '@/app/lib/store/slice/routeMap.slice'
import type { BookingDetail, OptimizedStop, OptimizeRouteResponse } from '@/app/types/maps/routemap.types'

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID

const FILTERS = ['All', 'Active', 'Pending', 'Completed'] as const
type FilterKey = (typeof FILTERS)[number]

function filterBookings(bookings: BookingWithRelations[], filter: FilterKey) {
  switch (filter) {
    case 'Active':
      return bookings.filter((b) => b.status === 'in_transit' || b.status === 'assigned')
    case 'Pending':
      return bookings.filter((b) => b.status === 'pending')
    case 'Completed':
      return bookings.filter((b) => b.status === 'completed' || b.status === 'cancelled')
    default:
      return bookings
  }
}

function fmtStatus(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function addressAbbr(address: string | undefined, fallback: string): string {
  if (!address) return fallback
  return address.match(/\b[A-Z]{2,4}\b/)?.[0] ?? address.split(',')[0].slice(0, 3).toUpperCase()
}

function getEncodedPolyline(routeData: OptimizeRouteResponse | null): string | null {
  if (!routeData) return null
  const ext = routeData as OptimizeRouteResponse & {
    encoded_polyline?: string
    encodedPolyline?: string
  }
  return ext.encoded_polyline ?? ext.encodedPolyline ?? null
}

function vehicleMarkerPosition(
  routeData: OptimizeRouteResponse,
  stops: OptimizedStop[],
): { lat: number; lng: number } {
  const pending = stops.find((s) => s.status === 'pending')
  if (pending) return { lat: pending.latitude, lng: pending.longitude }
  if (stops.length > 0) {
    const last = stops[stops.length - 1]
    return { lat: last.latitude, lng: last.longitude }
  }
  return { lat: routeData.origin.latitude, lng: routeData.origin.longitude }
}

function TransitBookingRow({
  booking,
  selected,
  loading,
  onClick,
}: {
  booking: BookingWithRelations
  selected: boolean
  loading: boolean
  onClick: () => void
}) {
  const color = statusColor(booking.status)
  const label = fmtStatus(booking.status)
  const origin = booking.origin?.split(',')[0] ?? '—'
  const lastDestAddress =
    booking.booking_destinations?.[booking.booking_destinations.length - 1]?.address
  const dest = lastDestAddress?.split(',')[0] ?? '—'
  const destAbbr = addressAbbr(lastDestAddress, 'DST')

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ x: 2 }}
      className="w-full text-left border-0 outline-none cursor-pointer relative overflow-hidden rounded-lg mb-1"
      style={{
        background: selected ? 'rgba(66,66,66,0.35)' : 'rgba(10,10,10,0.2)',
        borderLeft: `3px solid ${selected ? color : 'transparent'}`,
        padding: '12px 12px 10px',
        transition: 'background 0.15s',
      }}
    >
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-[1]"
          style={{ background: 'rgba(10,10,10,0.65)' }}
        >
          <div
            className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: color }}
          />
        </div>
      )}

      <div className="flex justify-end mb-1">
        <span className="ff-sc text-[11px] font-bold" style={{ color }}>
          {label}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-white text-[10px] font-bold min-w-[24px]">
          {addressAbbr(booking.origin, 'ORG')}
        </span>
        <div className="flex-1 relative h-3 flex items-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full h-[2px] rounded-full bg-[#333]" />
          </div>
          <div
            className="absolute left-0 h-[2px] rounded-full transition-all duration-1000"
            style={{
              width:
                booking.status === 'in_transit' ? '35%' : booking.status === 'completed' ? '100%' : '0%',
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
        <span className="text-white text-[10px] font-bold min-w-[20px] text-right">{destAbbr}</span>
      </div>

      <div className="flex justify-between items-end gap-2">
        <span className="ff-sc text-white text-[12px] truncate max-w-[50%]">{origin}</span>
        <div className="text-right min-w-0">
          <div className="ff-sc text-white text-[12px] truncate max-w-[120px]">{dest}</div>
          <div className="text-[11px] text-white/45">{booking.schedule_date}</div>
        </div>
      </div>
    </motion.button>
  )
}

function RouteMarkers({
  routeData,
  stops,
  vehiclePos,
}: {
  routeData: OptimizeRouteResponse
  stops: OptimizedStop[]
  vehiclePos: { lat: number; lng: number }
}) {
  return (
    <>
      <AdvancedMarker
        position={{ lat: routeData.origin.latitude, lng: routeData.origin.longitude }}
        title={routeData.origin.address}
      >
        <div
          className="text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg border flex items-center gap-1"
          style={{
            background: 'var(--color-bg)',
            borderColor: 'var(--color-cyan)',
            color: 'var(--color-cyan)',
            boxShadow: '0 0 12px rgba(77,249,237,0.35)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)]" />
          PICKUP
        </div>
      </AdvancedMarker>

      {stops.map((stop) => {
        const bg =
          stop.status === 'delivered' ? '#3af626' : stop.status === 'failed' ? '#f62626' : '#4df9ed'
        return (
          <AdvancedMarker
            key={stop.destination_id}
            position={{ lat: stop.latitude, lng: stop.longitude }}
            title={`#${stop.optimized_sequence_order} — ${stop.address}`}
          >
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center font-black text-[11px] text-black leading-none"
                style={{ background: bg, boxShadow: `0 2px 8px ${bg}66` }}
              >
                {stop.optimized_sequence_order}
              </div>
              <div
                className="w-0 h-0 -mt-px"
                style={{
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: `7px solid ${bg}`,
                }}
              />
            </div>
          </AdvancedMarker>
        )
      })}

      <AdvancedMarker position={vehiclePos} title="Assigned vehicle (estimated position)">
        <div className="flex flex-col items-center">
          <div
            className="rounded-full p-1.5 border-2 border-white shadow-lg"
            style={{
              background: '#f69f26',
              boxShadow: '0 0 14px rgba(246,159,38,0.55)',
            }}
          >
            <LocalShippingIcon sx={{ fontSize: 22, color: '#111' }} />
          </div>
          <span className="mt-1 text-[9px] font-bold uppercase tracking-wide text-white/90 drop-shadow-md">
            Vehicle
          </span>
        </div>
      </AdvancedMarker>
    </>
  )
}

function DeliveryStopsList({ detail }: { detail: BookingDetail }) {
  const rows = [...(detail.booking_destinations ?? [])].sort((a, b) => a.sequence_order - b.sequence_order)
  if (rows.length === 0) {
    return <p className="text-sm text-white/45 px-1">No delivery stops on this booking.</p>
  }
  return (
    <ul className="space-y-2">
      {rows.map((d) => (
        <li
          key={d.destination_id}
          className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5 text-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-start gap-2">
              <span className="shrink-0 mt-0.5 text-white/50">
                <MapPin size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-white/90 text-[13px] leading-snug">{d.address}</p>
                <p className="text-[11px] text-white/40 mt-0.5">Stop #{d.sequence_order}</p>
              </div>
            </div>
            <StatusBadge status={d.status} />
          </div>
          {d.delivered_at && (
            <p className="text-[11px] text-white/45 mt-1.5 pl-6">Delivered {d.delivered_at}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function VehicleSummaryCard({ detail }: { detail: BookingDetail }) {
  const plate =
    detail.vehicle?.plate_number ?? detail.driver?.truck?.plate_number ?? '—'
  const truckType = detail.vehicle?.truck_type ?? detail.driver?.truck?.truck_type ?? detail.truck_type_needed
  const driverName = detail.driver?.name ?? '—'
  const company = detail.clients?.company_name ?? '—'

  return (
    <div
      className="rounded-xl border border-white/[0.08] p-3 space-y-3"
      style={{ background: 'rgba(10,10,10,0.35)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">Vehicle</h3>
        <StatusBadge status={detail.status} />
      </div>
      <div className="grid gap-2 text-sm">
        <div className="flex items-center gap-2 text-white/90">
          <LocalShippingIcon sx={{ fontSize: 18, color: 'var(--color-cyan)' }} />
          <span className="font-mono font-semibold">{plate}</span>
          <span className="text-white/45 text-xs truncate">{truckType}</span>
        </div>
        <div className="flex items-center gap-2 text-white/80 text-[13px]">
          <User size={14} className="text-white/40 shrink-0" />
          <span className="truncate">{driverName}</span>
        </div>
        <div className="flex items-center gap-2 text-white/80 text-[13px]">
          <Building2 size={14} className="text-white/40 shrink-0" />
          <span className="truncate">{company}</span>
        </div>
        <div className="flex items-center gap-2 text-white/80 text-[13px]">
          <Package size={14} className="text-white/40 shrink-0" />
          <span>
            Schedule {detail.schedule_date}
            {detail.call_time ? ` · ${detail.call_time}` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function TransitTrackingView() {
  const dispatch = useAppDispatch()
  const user = useAuthStore((s) => s.user)

  const bookings = useAppSelector((s) => s.routeMap.bookings)
  const listLoading = useAppSelector((s) => s.routeMap.listLoading)
  const listError = useAppSelector((s) => s.routeMap.listError)
  const selectedId = useAppSelector((s) => s.routeMap.selectedId)
  const routeData = useAppSelector((s) => s.routeMap.routeData)
  const bookingDetail = useAppSelector((s) => s.routeMap.bookingDetail)
  const stops = useAppSelector((s) => s.routeMap.stops)
  const encodedPolyline = useAppSelector((s) => s.routeMap.encodedPolyline)
  const detailLoading = useAppSelector((s) => s.routeMap.detailLoading)
  const detailError = useAppSelector((s) => s.routeMap.detailError)

  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('Active')
  const [detailOpen, setDetailOpen] = useState(true)
  const [totalDuration, setTotalDuration] = useState(0)

  const loadBookings = useCallback(() => {
    dispatch(fetchBookings(user))
  }, [dispatch, user])

  useEffect(() => {
    dispatch(clearSelection())
  }, [dispatch])

  useEffect(() => {
    if (!user) return
    loadBookings()
  }, [loadBookings, user])

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return bookings
    return bookings.filter((b) => {
      return (
        b.origin?.toLowerCase().includes(q) ||
        b.status?.toLowerCase().includes(q) ||
        b.truck_type_needed?.toLowerCase().includes(q) ||
        b.booking_destinations?.some((d: { address: string }) => d.address.toLowerCase().includes(q))
      )
    })
  }, [bookings, search])

  const filteredList = useMemo(
    () => filterBookings(searchFiltered, activeFilter),
    [searchFiltered, activeFilter],
  )

  const selectBooking = useCallback(
    (bookingId: string) => {
      if (selectedId === bookingId) return
      dispatch(setSelectedId(bookingId))
      dispatch(fetchRouteAndDetail(bookingId))
      setTotalDuration(0)
      setDetailOpen(true)
    },
    [dispatch, selectedId],
  )

  const encoded = routeData ? getEncodedPolyline(routeData) : null
  const resolvedDuration = encoded ? (routeData?.total_duration ?? 0) * 60 : totalDuration

  const completedStops = stops.filter((s) => s.status === 'delivered').length
  const totalStops = stops.length
  const progressPercentage = totalStops > 0 ? (completedStops / totalStops) * 100 : 0

  const detailPanel =
    routeData && bookingDetail ? (
      <div className="flex flex-col gap-4 min-h-0">
        <VehicleSummaryCard detail={bookingDetail} />
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Deliveries</h3>
          <DeliveryStopsList detail={bookingDetail} />
        </div>
        <div className="border-t border-white/[0.08] pt-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Shipment</h3>
          <DetailsPanelContent
            routeData={{
              ...routeData,
              total_duration:
                resolvedDuration > 0 ? Math.floor(resolvedDuration / 60) : routeData.total_duration,
            }}
            bookingDetail={bookingDetail}
            completedStops={completedStops}
            totalStops={totalStops}
            progressPercentage={progressPercentage}
          />
        </div>
      </div>
    ) : detailLoading ? (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div
          className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--color-cyan)' }}
        />
        <p className="text-white/45 text-sm">Loading route and booking…</p>
      </div>
    ) : detailError ? (
      <div className="p-4 text-center">
        <p className="text-red-400 text-sm mb-3">{detailError}</p>
        <button
          type="button"
          onClick={() => selectedId && dispatch(fetchRouteAndDetail(selectedId))}
          className="text-[13px] border px-4 py-2 rounded-lg transition-colors"
          style={{ color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.3)' }}
        >
          Retry
        </button>
      </div>
    ) : (
      <p className="text-sm text-white/45 text-center py-8">Select a booking to view vehicle and deliveries.</p>
    )

  const vehiclePos = routeData ? vehicleMarkerPosition(routeData, stops) : null

  const mapInner =
    routeData && vehiclePos ? (
      <Map
        mapId={GOOGLE_MAPS_MAP_ID}
        defaultCenter={{ lat: vehiclePos.lat, lng: vehiclePos.lng }}
        defaultZoom={11}
        gestureHandling="greedy"
        className="w-full h-full min-h-[240px]"
      >
        <RouteMarkers routeData={routeData} stops={stops} vehiclePos={vehiclePos} />
        <DirectionsRenderer
          encodedPolyline={encodedPolyline}
          origin={routeData.origin}
          stops={stops}
          onDurations={(total) => {
            if (!encodedPolyline) setTotalDuration(total)
          }}
        />
      </Map>
    ) : (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a0a]">
        <LocalShippingIcon sx={{ fontSize: 48, color: '#333' }} />
        <p className="text-white/50 text-sm font-medium">Select a booking to open the map</p>
      </div>
    )

  if (!GOOGLE_MAPS_KEY || !GOOGLE_MAPS_MAP_ID) {
    return (
      <div className="p-6 text-center text-white/70 text-sm">
        Maps are not configured. Set <code className="text-[var(--color-cyan)]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{' '}
        and <code className="text-[var(--color-cyan)]">NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID</code> in{' '}
        <code className="text-white/90">.env</code>.
      </div>
    )
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} libraries={['routes']}>
      <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-body">
        <header className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-3 border-b border-white/[0.07] bg-[var(--color-bg)]">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Transit tracking</h1>
            <p className="text-xs text-white/45 mt-0.5">
              Live route map, vehicle summary, and delivery stops for each booking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {bookingDetail && <StatusBadge status={bookingDetail.status} />}
            <button
              type="button"
              onClick={loadBookings}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5 transition-colors"
            >
              <RefreshIcon sx={{ fontSize: 16 }} />
              Refresh list
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
          <aside className="w-full lg:w-[300px] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-white/[0.07] bg-[var(--color-bg)] min-h-0 max-h-[42vh] lg:max-h-none">
            <div className="p-2.5 flex-shrink-0">
              <div className="flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: '#2a2828' }}>
                <SearchIcon sx={{ fontSize: 16, color: '#9f9c9c' }} />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setActiveFilter('All')
                  }}
                  placeholder="Search bookings…"
                  className="bg-transparent border-none outline-none text-sm flex-1 text-white/70 placeholder:text-white/35"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 px-2.5 pb-2 flex-shrink-0">
              {FILTERS.map((f) => {
                const isActive = activeFilter === f
                const count = filterBookings(searchFiltered, f).length
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all border"
                    style={{
                      background: isActive ? 'rgba(77,249,237,0.12)' : 'transparent',
                      borderColor: isActive ? 'rgba(77,249,237,0.35)' : 'var(--color-surface-dark)',
                      color: isActive ? 'var(--color-cyan)' : '#555',
                    }}
                  >
                    {f}
                    {count > 0 && (
                      <span
                        className="rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-black leading-none"
                        style={{
                          background: isActive ? 'rgba(77,249,237,0.2)' : '#222',
                          color: isActive ? 'var(--color-cyan)' : '#666',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
              {listLoading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <div
                    className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: 'var(--color-cyan)' }}
                  />
                  <p className="text-white/45 text-sm">Loading bookings…</p>
                </div>
              ) : listError ? (
                <div className="p-4 text-center">
                  <p className="text-red-400 text-sm mb-2">{listError}</p>
                  <button
                    type="button"
                    onClick={loadBookings}
                    className="text-[var(--color-cyan)] text-sm inline-flex items-center gap-1"
                  >
                    <RefreshIcon sx={{ fontSize: 14 }} /> Retry
                  </button>
                </div>
              ) : filteredList.length === 0 ? (
                <p className="text-center text-white/45 text-sm py-8 px-2">
                  No bookings in this filter. Try &quot;All&quot; or adjust search.
                </p>
              ) : (
                <AnimatePresence>
                  {filteredList.map((b, i) => (
                    <motion.div
                      key={b.booking_id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                    >
                      <TransitBookingRow
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

            {selectedId && (
              <button
                type="button"
                onClick={() => {
                  dispatch(clearSelection())
                  setDetailOpen(true)
                }}
                className="shrink-0 w-full py-2.5 text-[11px] font-bold uppercase tracking-wider border-t border-white/[0.07] text-[var(--color-cyan)] hover:bg-white/[0.03]"
              >
                Clear selection
              </button>
            )}
          </aside>

          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative">
            <div className="flex-1 min-h-[280px] lg:min-h-0 relative bg-black">
              {mapInner}
            </div>

            <AnimatePresence>
              {detailOpen && (selectedId || detailLoading || detailError) && (
                <motion.aside
                  initial={{ x: 24, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 24, opacity: 0 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 220 }}
                  className="w-full lg:w-[min(440px,100%)] lg:absolute lg:top-3 lg:right-3 lg:bottom-3 z-10 flex flex-col rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden"
                  style={{ background: 'var(--color-surface)' }}
                >
                  <div className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-white/[0.07]">
                    <span className="text-xs font-bold uppercase tracking-widest text-white/45">
                      Booking details
                    </span>
                    <button
                      type="button"
                      onClick={() => setDetailOpen(false)}
                      className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 text-white/60"
                      aria-label="Close details"
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 scrollbar-thin scrollbar-thumb-white/10">
                    {detailPanel}
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>

            {!detailOpen && selectedId && (
              <button
                type="button"
                onClick={() => setDetailOpen(true)}
                className="absolute bottom-3 right-3 z-20 rounded-full border border-[var(--color-cyan)]/40 bg-black/80 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--color-cyan)] shadow-lg lg:hidden"
              >
                Details
              </button>
            )}
          </div>
        </div>
      </div>
    </APIProvider>
  )
}
