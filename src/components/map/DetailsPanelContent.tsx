'use client'

import Image  from 'next/image'
import { motion } from 'framer-motion'
import type { OptimizeRouteResponse, BookingDetail, CargoGroup } from '@/app/types/maps/routemap.types'
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
  const stops       = routeData.optimized_stops ?? []
  const destStop    = stops[stops.length - 1]
  const destCity    = destStop?.address?.split(',')[0] ?? '—'
  const destFull    = destStop?.address ?? '—'

  const truckType   = bookingDetail?.truck_type_needed ?? 'L300'
  const plateNumber = bookingDetail?.driver?.truck?.plate_number ?? '—'
  const totalCost   = bookingDetail?.total_cost != null ? `₱${bookingDetail.total_cost}` : '—'
  const estDelivery = bookingDetail?.estimated_delivery ?? scheduleDate
  const travelTime  = routeData.total_duration
    ? `${Math.floor(routeData.total_duration / 60)}HR ${routeData.total_duration % 60}MINS`
    : '—'

  const subCity = (full: string) => full.split(',').slice(1).join(',').trim() || full

  const parsedCargo     = bookingDetail?.parsed_cargo ?? null
  const allGroups       = parsedCargo?.sections.flatMap(s => s.groups) ?? []
  const totalPieces     = allGroups.reduce((sum, g) => sum + (parseInt(g.pieces) || 0), 0)
  const totalWeight     = bookingDetail?.required_weight_kg  ?? null
  const volume          = bookingDetail?.required_volume_cbm ?? null

  const firstGroup      = allGroups[0] ?? null
  const product         = firstGroup?.product        ?? null
  const shc             = firstGroup?.shc            ?? null
  const additionalShc   = firstGroup?.additionalShc  ?? null
  const hasNonTiltable  = allGroups.some(g => g.nonTiltable)
  const hasNonStackable = allGroups.some(g => g.nonStackable)

  const density = totalWeight && volume && volume > 0
    ? (totalWeight / volume).toFixed(1)
    : null

  const hasCargo = !!(parsedCargo || totalWeight || volume)

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

      {/* Origin and Destination */}
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

        <div className="flex justify-between px-3 mb-1">
          <span className="text-[10px]">
            <span style={{ color: 'var(--color-cyan)' }}>FROM</span>
            <span style={{ color: 'var(--color-muted)' }}> [1st Drop Off Point]</span>
          </span>
          <span className="text-[10px] text-right">
            <span style={{ color: 'var(--color-cyan)' }}>TO</span>
            <span style={{ color: 'var(--color-muted)' }}> [2nd Drop Off Point]</span>
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

      <div className="border-t px-3 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex gap-2">

          {/* Pick Up Point */}
          <div className="flex-1">
            <p className="ff-sc text-[11px] text-center mb-2" style={{ color: 'var(--color-muted)' }}>Pick Up Point</p>
            <div className="flex items-start gap-2">
              <div className="mt-1 flex-shrink-0">
                <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--color-cyan)', background: 'var(--color-cyan)' }} />
              </div>
              <div>
                <p className="ff-sc text-white text-[12px]">{originCity}</p>
                <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{subCity(originFull)}</p>
              </div>
            </div>
          </div>

          <div className="w-px self-stretch" style={{ background: 'var(--color-border)' }} />

          {/* Drop Off Points */}
          <div className="flex-1">
            <p className="ff-sc text-[11px] text-center mb-2" style={{ color: 'var(--color-muted)' }}>Drop Off Point</p>
            <div className="flex flex-col gap-2">
              {stops.map((stop, i) => {
                const isDelivered = stop.status === 'delivered'
                const isFailed    = stop.status === 'failed'
                const dotColor    = isDelivered ? 'var(--color-cyan)' : isFailed ? '#f62626' : '#555'
                const isLast      = i === stops.length - 1

                return (
                  <div key={stop.destination_id} className="flex items-start gap-2">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className="w-3 h-3 rounded-full border-2 mt-1"
                        style={{
                          borderColor: dotColor,
                          background:  isDelivered ? 'var(--color-cyan)' : 'transparent',
                        }}
                      />
                      {!isLast && (
                        <div className="w-px flex-1 min-h-[16px] mt-1" style={{ background: 'var(--color-border)' }} />
                      )}
                    </div>
                    <div>
                      <p className="ff-sc text-white text-[12px]">{stop.address.split(',')[0]}</p>
                      <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>
                        {stop.address.split(',').slice(1).join(',').trim()}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
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

      {/* Cargo Details */}
      {hasCargo && (
        <div className="border-t px-3 pb-4" style={{ borderColor: 'var(--color-border)' }}>

          {/* Header row */}
          <div className="flex items-center justify-between py-2">
            <span className="ff-sc text-white text-[16px]">Cargo Details</span>
            {totalWeight && (
              <span className="text-[10px]">
                <span style={{ color: 'var(--color-muted)' }}>TOTAL WEIGHT: </span>
                <span className="text-white">{totalWeight} KG</span>
              </span>
            )}
          </div>

          <div className="space-y-0">
            {[
              { label: 'Product',                          value: product      },
              { label: 'Special Handling Code',            value: shc          },
              { label: 'Additional Special Handling Code', value: additionalShc},
            ].map(({ label, value }) => value ? (
              <div
                key={label}
                className="flex items-center justify-between py-2 border-b"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span className="ff-sc text-white text-[12px]">{label}</span>
                <span className="ff-sc text-white text-[12px] text-right">{value}</span>
              </div>
            ) : null)}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
            {[
              { label: 'Total Piece',  value: totalPieces ? String(totalPieces)        : null },
              { label: 'Gross Weight', value: totalWeight ? `${totalWeight} KG`        : null },
              { label: 'Volume',       value: volume      ? `${volume} CBM`            : null },
              { label: 'Density',      value: density     ? `${density} KG/CBM`        : null },
            ].map(({ label, value }) => value ? (
              <div
                key={label}
                className="rounded-[5px] p-2 border"
                style={{ borderColor: 'var(--color-cyan)', background: '#fff' }}
              >
                <p className="text-[10px] mb-1" style={{ color: '#818181' }}>{label}</p>
                <p className="ff-sc text-black text-[14px] font-bold">{value}</p>
              </div>
            ) : null)}
          </div>

          {/* Flags */}
          {(hasNonTiltable || hasNonStackable) && (
            <ul className="list-disc pl-5 space-y-0.5 mt-1">
              {hasNonTiltable  && <li className="ff-sc text-white text-[12px]">Non-tiltable items present</li>}
              {hasNonStackable && <li className="ff-sc text-white text-[12px]">Non-stackable items present</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}