'use client'

import Image  from 'next/image'
import { motion } from 'framer-motion'
import type { OptimizeRouteResponse, BookingDetail } from '@/app/types/maps/routemap.types'
import { statusColor } from './status.colors'

const TRUCK_IMG    = 'https://www.figma.com/api/mcp/asset/0318dae9-97ce-4d45-9493-711e78213248'
const TRUCK_ICON   = 'https://www.figma.com/api/mcp/asset/9da23836-0bfa-4f39-8d62-bfc91725e81f'
const VEHICLE_ICON = 'https://www.figma.com/api/mcp/asset/726590e5-34b8-4118-b941-a9617ee0ce83'

const STAGE_ICONS = [
  'https://www.figma.com/api/mcp/asset/bde70cbf-5338-4591-9370-f98c897e0daa',
  'https://www.figma.com/api/mcp/asset/03e90c74-1172-4615-b67c-5f8dbc8bcea1',
  'https://www.figma.com/api/mcp/asset/907a700d-f65e-45e2-85af-c815185c594f',
  'https://www.figma.com/api/mcp/asset/3d5bed75-b6c4-4f5c-83e4-17e1f00e1abb',
]

function fmtStatus(s: string) {
  return (s ?? '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

interface Props {
  routeData:          OptimizeRouteResponse
  bookingDetail:      BookingDetail | null
  completedStops:     number
  totalStops:         number
  progressPercentage: number
}

export function DetailsPanelContent({
  routeData,
  bookingDetail,
  completedStops,
  totalStops,
  progressPercentage,
}: Props) {
  const status    = bookingDetail?.status ?? 'pending'
  const color     = statusColor(status)
  const statusLbl = fmtStatus(status)

  const scheduleDate = bookingDetail?.schedule_date ?? ''
  const callTime     = bookingDetail?.call_time ?? ''

  const originCity  = routeData.origin.address.split(',')[0] ?? routeData.origin.address
  const originFull  = routeData.origin.address
  const destStop    = routeData.optimized_stops?.[routeData.optimized_stops.length - 1]
  const destCity    = destStop?.address?.split(',')[0] ?? '—'
  const destFull    = destStop?.address ?? '—'

  const truckType   = bookingDetail?.truck_type_needed ?? 'L300'
  const plateNumber = bookingDetail?.driver?.truck?.plate_number ?? '—'
  const totalCost   = bookingDetail?.total_cost != null ? `$${bookingDetail.total_cost}` : '—'
  const estDelivery = bookingDetail?.estimated_delivery ?? scheduleDate
  const travelTime  = routeData.total_duration
    ? `${Math.floor(routeData.total_duration / 60)}HR ${routeData.total_duration % 60}MINS`
    : '—'

  const subCity = (full: string) => full.split(',').slice(1).join(',').trim() || full

  return (
    <div className="flex flex-col min-h-full ff-body">

      {/* Header */}
      <div
        className="flex items-center justify-center gap-2 px-4 py-1.5 border-b"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <span className="ff-sc text-[10px]" style={{ color }}>{scheduleDate}</span>
        {scheduleDate && <span className="text-[10px]" style={{ color: 'var(--color-border)' }}>•</span>}
        <span className="ff-sc text-[10px]" style={{ color }}>
          {statusLbl}{callTime ? `, ${callTime}` : ''}
        </span>
      </div>

      {/* Stage icons */}
      <div className="flex items-center justify-center gap-2 pt-3 pb-1">
        {STAGE_ICONS.map((src, i) => (
          <div
            key={i}
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface-dark)' }}
          >
            <Image src={src} alt="" width={15} height={15} className="object-contain" />
          </div>
        ))}
      </div>

      <p className="ff-sc text-center text-[18px] text-white mt-1">{truckType}</p>

      {/* Truck hero */}
      <div className="relative w-full" style={{ height: 160 }}>
        <Image src={TRUCK_IMG} alt={truckType} fill className="object-contain" priority />
      </div>

      <p className="ff-sc text-center text-[16px] text-white mt-1 mb-2">{plateNumber}</p>

      {/* Origin / Destination */}
      <div className="flex gap-1.5 px-3">
        <div className="flex-1 rounded-[8px] px-3 py-2" style={{ background: 'var(--color-border)' }}>
          <p className="ff-sc text-white text-[13px] mb-0.5">{originCity}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{subCity(originFull)}</p>
          <div className="mt-1.5 space-y-0.5">
            {(['Scheduled', 'Loading'] as const).map(lbl => (
              <div key={lbl} className="flex justify-between">
                <span className="text-white text-[10px]">{lbl}</span>
                <span className="text-white text-[10px]">{callTime || '—'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center w-6 flex-shrink-0">
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface-dark)' }}
          >
            <Image src={VEHICLE_ICON} alt="" width={15} height={15} className="object-contain" />
          </div>
        </div>

        <div className="flex-1 rounded-[8px] px-3 py-2" style={{ background: 'var(--color-border)' }}>
          <p className="ff-sc text-white text-[13px] mb-0.5">{destCity}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{subCity(destFull)}</p>
          <div className="mt-1.5">
            <div className="flex justify-between">
              <span className="text-white text-[10px]">Estimate Arrival</span>
              <span className="text-white text-[10px]">{destStop?.estimated_arrival ?? '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Route */}
      <div className="border-t mt-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="ff-sc text-white text-[14px]">Route</span>
          <span className="text-[10px]">
            <span style={{ color: 'var(--color-muted)' }}>ON THE WAY: </span>
            <span className="text-white">{travelTime}</span>
          </span>
        </div>

        <div className="px-3 pb-1.5">
          <div className="relative h-[8px] flex items-center">
            <div className="absolute inset-0 rounded-full" style={{ background: 'var(--color-border)' }} />
            <motion.div
              className="absolute left-0 h-full rounded-full"
              style={{ background: 'var(--color-cyan)' }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
            <motion.div
              className="absolute"
              initial={{ left: '0%' }}
              animate={{ left: `${Math.max(0, progressPercentage - 3)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            >
              <Image src={TRUCK_ICON} alt="" width={22} height={22} className="-mt-[8px]" />
            </motion.div>
          </div>
        </div>

        <div className="flex justify-between px-3 pb-2">
          {[
            { city: originCity, full: originFull },
            { city: destCity,   full: destFull   },
          ].map(({ city, full }, i) => (
            <div key={i} className={i === 1 ? 'text-right' : ''}>
              <p className="ff-sc text-white text-[11px]">{city}</p>
              <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{subCity(full)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery */}
      <div className="flex gap-1.5 px-3 pb-3">
        <div className="flex-1 rounded-[8px] p-3 border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {status.toUpperCase() !== 'COMPLETED' && (
              <span className="text-[10px] font-bold" style={{ color: '#fd2cbe' }}>Late</span>
            )}
          </div>
          <p className="text-[10px] mb-0.5" style={{ color: 'var(--color-muted)' }}>Estimated Delivery</p>
          <p className="ff-sc text-white text-[13px]">{estDelivery || '—'}</p>
        </div>

        <div className="flex-1 rounded-[8px] p-3 border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.5">
              <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            <span className="text-[10px] font-bold" style={{ color: '#c2f626' }}>Paid</span>
          </div>
          <p className="text-[10px] mb-0.5" style={{ color: 'var(--color-muted)' }}>Total Cost</p>
          <p className="ff-sc text-white text-[13px]">{totalCost}</p>
        </div>
      </div>

      {/* Stops */}
      {totalStops > 0 && (
        <div className="px-3 pb-3 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="ff-sc text-white text-[11px]">Stops</span>
            <span className="text-[10px]" style={{ color: 'var(--color-muted)' }}>
              {completedStops}/{totalStops} delivered
            </span>
          </div>
          <div className="w-full h-[5px] rounded-full" style={{ background: 'var(--color-border)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'var(--color-green)' }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}