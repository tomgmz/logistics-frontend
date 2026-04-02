'use client'

import { motion } from 'framer-motion'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import { OptimizeRouteResponse } from '@/app/types/route.types'
import { StatusBadge, RouteStop, DetailRow } from './RouteMapComponents'
import { BookingDetail } from '@/app/types/maps/routemap.types'

interface Props {
  routeData: OptimizeRouteResponse
  bookingDetail: BookingDetail | null
  completedStops: number
  totalStops: number
  progressPercentage: number
}

export function DetailsPanelContent({
  routeData,
  bookingDetail,
  completedStops,
  totalStops,
  progressPercentage,
}: Props) {
  const cargoDetails = (() => {
    try {
      return bookingDetail?.cargo_details ? JSON.parse(bookingDetail.cargo_details) : null
    } catch {
      return null
    }
  })()

  const plateNumber   = bookingDetail?.vehicle?.plate_number ?? '—'
  const vehicleName   = bookingDetail?.truck_type_needed ?? '—'
  const bookingStatus = bookingDetail?.status?.toUpperCase() ?? 'BOOKED'

  const sortedStops = [...routeData.optimized_stops].sort(
    (a, b) => a.optimized_sequence_order - b.optimized_sequence_order,
  )

  return (
    <>
      {/* Vehicle summary */}
      <div className="p-5 border-b border-gray-800/60">
        <div className="flex items-center justify-between mb-5">
          <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
            <LocalShippingIcon sx={{ fontSize: 14, color: '#6b7280' }} />
          </div>
          <StatusBadge status={bookingStatus} />
        </div>

        <div className="text-center mb-4">
          <p className="text-gray-500 text-xs font-medium tracking-widest uppercase mb-1">Vehicle</p>
          <h2 className="text-4xl font-black text-white tracking-tight mb-4">{vehicleName}</h2>
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
          {plateNumber !== '—' && (
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <p className="text-white font-bold text-lg tracking-widest">{plateNumber}</p>
            </div>
          )}
        </div>

        {/* Progress bar */}
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

        {/* Pickup / Final stop cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#1a1a1a] rounded-xl p-3 border border-gray-800/80">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest">Pickup</span>
            </div>
            <p className="text-white font-bold text-sm mb-0.5 truncate">{routeData.origin.address}</p>
          </div>
          {sortedStops.length > 0 && (
            <div className="bg-[#1a1a1a] rounded-xl p-3 border border-gray-800/80">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-gray-500 text-[9px] font-semibold uppercase tracking-widest">Final Stop</span>
              </div>
              <p className="text-white font-bold text-sm mb-0.5 truncate">
                {sortedStops[sortedStops.length - 1].address}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Route stop list */}
      <div className="p-5 border-b border-gray-800/60">
        <div className="flex items-center justify-between mb-4">
          <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Route Details</span>
          <div className="flex items-center gap-1.5 bg-gray-800/60 rounded-full px-3 py-1 border border-gray-700/50">
            <span className="text-gray-400 text-[9px] uppercase tracking-widest">{totalStops} stops</span>
          </div>
        </div>

        <RouteStop address={routeData.origin.address} isOrigin />

        {sortedStops.map((stop, i) => (
          <RouteStop
            key={stop.destination_id}
            sequenceNumber={stop.optimized_sequence_order}
            address={stop.address}
            isLast={i === sortedStops.length - 1}
            status={stop.status}
          />
        ))}
      </div>

      {/* Shipment details */}
      <div className="p-5">
        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Shipment Details</span>
        <div className="space-y-2 mt-3">
          {bookingDetail?.required_weight_kg != null && (
            <DetailRow label="Weight" value={`${bookingDetail.required_weight_kg} KG`} />
          )}
          {bookingDetail?.required_volume_cbm != null && (
            <DetailRow label="Volume" value={`${bookingDetail.required_volume_cbm} CBM`} />
          )}
          {cargoDetails?.mode && (
            <DetailRow
              label="Cargo Mode"
              value={String(cargoDetails.mode).charAt(0).toUpperCase() + String(cargoDetails.mode).slice(1)}
            />
          )}
          {cargoDetails?.service && (
            <DetailRow label="Service" value={String(cargoDetails.service).toUpperCase()} />
          )}
          <DetailRow label="Booking ID" value={`#${routeData.booking_id.slice(0, 8).toUpperCase()}`} />
          {bookingDetail?.schedule_date && (
            <DetailRow label="Schedule Date" value={bookingDetail.schedule_date} />
          )}
        </div>
        <div className="mt-5 pt-4 border-t border-gray-800">
          <p className="text-gray-500 text-xs mb-3">Need help with your delivery?</p>
          <button className="w-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-sm font-medium py-2.5 rounded-lg transition-colors">
            Contact Support
          </button>
        </div>
      </div>
    </>
  )
}