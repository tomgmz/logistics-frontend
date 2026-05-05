'use client'

import Image                   from 'next/image'
import { motion }              from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  CalendarClock,
  PackagePlus,
  Truck,
  PackageCheck,
  ArrowRight,
} from 'lucide-react'
import type { OptimizeRouteResponse, BookingDetail } from '@/app/types/maps/routemap.types'
import { fetchTruckModels } from '@/lib/api/client/truck-model'

const STAGE_ICONS = [
  { Icon: CalendarClock, label: 'Scheduled'  },
  { Icon: PackagePlus,   label: 'Loading'    },
  { Icon: Truck,         label: 'In Transit' },
  { Icon: PackageCheck,  label: 'Delivered'  },
]

function fmtStatus(s: string) {
  return (s ?? '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function Skeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <motion.span
      style={{
        display: 'inline-block',
        background: 'var(--color-surface-dark, #424242)',
        borderRadius: 4,
        height: '0.75em',
        width: '6rem',
        verticalAlign: 'middle',
        ...style,
      }}
      animate={{ opacity: [0.4, 0.75, 0.4] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

function BlockSkeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <motion.div
      style={{
        background: 'var(--color-surface-dark, #424242)',
        borderRadius: 10,
        ...style,
      }}
      animate={{ opacity: [0.4, 0.75, 0.4] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

function useTruckImage(truckType: string) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!truckType) return
    let active = true
    fetchTruckModels()
      .then(models => {
        if (!active) return
        const match = models.find(m => m.name.toLowerCase() === truckType.toLowerCase())
        setImageUrl(match?.image_url ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setImageUrl(null)
        setLoading(false)
      })
    return () => { active = false }
  }, [truckType])

  return { imageUrl, loading }
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
  progressPercentage,
}: Props) {
  const isLoading = bookingDetail === null

  const status      = bookingDetail?.status        ?? ''
  const statusLbl   = fmtStatus(status)
  const scheduleDate = bookingDetail?.schedule_date ?? ''
  const callTime     = bookingDetail?.call_time     ?? ''

  const originCity = routeData.origin.address.split(',')[0] ?? routeData.origin.address
  const originFull = routeData.origin.address
  const stops      = routeData.optimized_stops ?? []
  const destStop   = stops[stops.length - 1]
  const destCity   = destStop?.address?.split(',')[0] ?? '—'
  const destFull   = destStop?.address ?? '—'

  const truckType   = bookingDetail?.truck_type_needed          ?? 'L300'
  const plateNumber = bookingDetail?.driver?.truck?.plate_number ?? '—'
  const totalCost   = bookingDetail?.total_cost != null ? `₱${bookingDetail.total_cost}` : '—'
  const estDelivery = bookingDetail?.estimated_delivery ?? scheduleDate
  const travelTime  = routeData.total_duration
    ? `${Math.floor(routeData.total_duration / 60)}HR ${routeData.total_duration % 60}MINS`
    : '—'

  const subCity = (full: string) => full.split(',').slice(1).join(',').trim() || full

  const { imageUrl: truckImageUrl, loading: truckImageLoading } = useTruckImage(truckType)

  const parsedCargo     = bookingDetail?.parsed_cargo ?? null
  const allGroups       = parsedCargo?.sections.flatMap(s => s.groups) ?? []
  const totalPieces     = allGroups.reduce((sum, g) => sum + (parseInt(g.pieces) || 0), 0)
  const totalWeight     = bookingDetail?.required_weight_kg  ?? null
  const volume          = bookingDetail?.required_volume_cbm ?? null
  const firstGroup      = allGroups[0] ?? null
  const product         = firstGroup?.product       ?? null
  const shc             = firstGroup?.shc           ?? null
  const additionalShc   = firstGroup?.additionalShc ?? null
  const hasNonTiltable  = allGroups.some(g => g.nonTiltable)
  const hasNonStackable = allGroups.some(g => g.nonStackable)
  const density         = totalWeight && volume && volume > 0
    ? (totalWeight / volume).toFixed(1)
    : null
  const hasCargo = !!(parsedCargo || totalWeight || volume)

  return (
    <div className="flex flex-col min-h-full ff-body">

      <div className="relative w-full flex-shrink-0" style={{ height: 31, borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 584 31"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="584" height="9" fill="#424242" />
          <g clipPath="url(#banner-clip)">
            <path d="M116.177 8.00001C98.1978 7.99999 292.198 8.00001 292.198 8.00001V31C292.198 31 174.749 31 152.723 31C130.697 31 134.156 8.00003 116.177 8.00001Z" fill="#424242" />
            <path d="M468.021 8.00001C486 7.99999 292 8.00001 292 8.00001V31C292 31 409.449 31 431.474 31C453.5 31 450.042 8.00003 468.021 8.00001Z" fill="#424242" />
          </g>
          <defs>
            <clipPath id="banner-clip">
              <rect width="354" height="31" fill="white" transform="translate(115)" />
            </clipPath>
          </defs>
        </svg>

        <div className="absolute inset-x-0 flex items-center justify-center gap-2" style={{ top: 9, bottom: 0 }}>
          {isLoading ? (
            <Skeleton style={{ width: '60%' }} />
          ) : (
            <>
              {scheduleDate && (
                <span className="ff-sc text-[11px] whitespace-nowrap" style={{ color: 'var(--color-cyan, #4df9ed)' }}>
                  {scheduleDate}
                </span>
              )}
              {scheduleDate && (
                <span className="rounded-full flex-shrink-0" style={{ width: 4, height: 4, background: 'var(--color-cyan, #4df9ed)' }} />
              )}
              <span className="ff-sc text-[11px] whitespace-nowrap" style={{ color: 'var(--color-cyan, #4df9ed)' }}>
                {statusLbl}{callTime ? `, ${callTime}` : ''}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pt-3 pb-1">
        {STAGE_ICONS.map(({ Icon, label }) => (
          <div
            key={label}
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface-dark)' }}
            title={label}
          >
            <Icon size={14} strokeWidth={1.75} style={{ color: 'var(--color-cyan, #4df9ed)' }} />
          </div>
        ))}
      </div>

      <p className="ff-sc text-center text-[18px] text-white mt-1">
        {isLoading ? <Skeleton style={{ width: '4rem' }} /> : truckType}
      </p>

      <div className="relative w-full px-4" style={{ height: 160 }}>
        {isLoading || truckImageLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <BlockSkeleton style={{ width: '80%', height: 110 }} />
          </div>
        ) : truckImageUrl ? (
          <motion.div className="relative w-full h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <Image src={truckImageUrl} alt={truckType} fill className="object-contain" priority />
          </motion.div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Truck size={80} strokeWidth={1} style={{ color: 'var(--color-cyan, #4df9ed)', opacity: 0.4 }} />
          </div>
        )}
      </div>

      <p className="ff-sc text-center text-[16px] text-white mt-1 mb-2">
        {isLoading ? <Skeleton style={{ width: '5rem' }} /> : plateNumber}
      </p>

      <div className="flex gap-1.5 px-3">
        <div className="flex-1 rounded-[8px] px-3 py-2" style={{ background: 'var(--color-border)' }}>
          <p className="ff-sc text-white text-[13px] mb-0.5">{originCity}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{subCity(originFull)}</p>
          <div className="mt-1.5 space-y-0.5">
            {(['Scheduled', 'Loading'] as const).map(lbl => (
              <div key={lbl} className="flex justify-between">
                <span className="text-white text-[10px]">{lbl}</span>
                <span className="text-white text-[10px]">
                  {isLoading ? <Skeleton style={{ width: '3rem', height: '0.6em' }} /> : callTime || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center w-6 flex-shrink-0">
          <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center" style={{ background: 'var(--color-surface-dark)' }}>
            <ArrowRight size={14} strokeWidth={1.75} style={{ color: 'var(--color-cyan, #4df9ed)' }} />
          </div>
        </div>

        <div className="flex-1 rounded-[8px] px-3 py-2" style={{ background: 'var(--color-border)' }}>
          <p className="ff-sc text-white text-[13px] mb-0.5">{destCity}</p>
          <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{subCity(destFull)}</p>
          <div className="mt-1.5">
            <div className="flex justify-between">
              <span className="text-white text-[10px]">Estimate Arrival</span>
              <span className="text-white text-[10px]">
                {isLoading ? <Skeleton style={{ width: '3rem', height: '0.6em' }} /> : destStop?.estimated_arrival ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t mt-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="ff-sc text-white text-[14px]">Route</span>
          <span className="text-[10px]">
            <span style={{ color: 'var(--color-muted)' }}>ON THE WAY: </span>
            <span className="text-white">
              {isLoading ? <Skeleton style={{ width: '4rem', height: '0.6em' }} /> : travelTime}
            </span>
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
            {!isLoading && (
              <>
                <motion.div
                  className="absolute left-0 h-full rounded-full"
                  style={{ background: 'var(--color-cyan)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
                <motion.div
                  className="absolute flex items-center justify-center"
                  initial={{ left: '0%' }}
                  animate={{ left: `${Math.max(0, progressPercentage - 3)}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  style={{ top: '50%', transform: 'translateY(-60%)' }}
                >
                  <Truck size={20} strokeWidth={1.75} style={{ color: 'var(--color-cyan, #4df9ed)' }} />
                </motion.div>
              </>
            )}
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

          <div className="flex-1">
            <p className="ff-sc text-[11px] text-center mb-2" style={{ color: 'var(--color-muted)' }}>Drop Off Point</p>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(n => (
                  <div key={n} className="flex items-start gap-2">
                    <div className="w-3 h-3 rounded-full border-2 mt-1 flex-shrink-0" style={{ borderColor: '#555' }} />
                    <BlockSkeleton style={{ flex: 1, height: 28, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            ) : (
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
                          style={{ borderColor: dotColor, background: isDelivered ? 'var(--color-cyan)' : 'transparent' }}
                        />
                        {!isLast && <div className="w-px flex-1 min-h-[16px] mt-1" style={{ background: 'var(--color-border)' }} />}
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
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 px-3 pb-3">
        <div className="flex-1 rounded-[8px] p-3 border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {!isLoading && status.toUpperCase() !== 'COMPLETED' && (
              <span className="text-[10px] font-bold" style={{ color: '#fd2cbe' }}>Late</span>
            )}
          </div>
          <p className="text-[10px] mb-0.5" style={{ color: 'var(--color-muted)' }}>Estimated Delivery</p>
          <p className="ff-sc text-white text-[13px]">
            {isLoading ? <Skeleton style={{ width: '5rem' }} /> : estDelivery || '—'}
          </p>
        </div>

        <div className="flex-1 rounded-[8px] p-3 border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.5">
              <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            {!isLoading && <span className="text-[10px] font-bold" style={{ color: '#c2f626' }}>Paid</span>}
          </div>
          <p className="text-[10px] mb-0.5" style={{ color: 'var(--color-muted)' }}>Total Cost</p>
          <p className="ff-sc text-white text-[13px]">
            {isLoading ? <Skeleton style={{ width: '4rem' }} /> : totalCost}
          </p>
        </div>
      </div>

      {(hasCargo || isLoading) && (
        <div className="border-t px-3 pb-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between py-2">
            <span className="ff-sc text-white text-[16px]">Cargo Details</span>
            {!isLoading && totalWeight && (
              <span className="text-[10px]">
                <span style={{ color: 'var(--color-muted)' }}>TOTAL WEIGHT: </span>
                <span className="text-white">{totalWeight} KG</span>
              </span>
            )}
            {isLoading && <Skeleton style={{ width: '6rem', height: '0.6em' }} />}
          </div>

          {isLoading ? (
            <>
              <div className="space-y-0">
                {[1, 2].map(n => (
                  <div key={n} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <BlockSkeleton style={{ width: '40%', height: 10, borderRadius: 4 }} />
                    <BlockSkeleton style={{ width: '25%', height: 10, borderRadius: 4 }} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className="rounded-[5px] p-2 border" style={{ borderColor: 'var(--color-cyan)', background: '#fff' }}>
                    <BlockSkeleton style={{ width: '60%', height: 8, borderRadius: 3, marginBottom: 6, background: '#e0e0e0' }} />
                    <BlockSkeleton style={{ width: '80%', height: 16, borderRadius: 3, background: '#d0d0d0' }} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-0">
                {[
                  { label: 'Product',                          value: product       },
                  { label: 'Special Handling Code',            value: shc           },
                  { label: 'Additional Special Handling Code', value: additionalShc },
                ].map(({ label, value }) => value ? (
                  <div key={label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="ff-sc text-white text-[12px]">{label}</span>
                    <span className="ff-sc text-white text-[12px] text-right">{value}</span>
                  </div>
                ) : null)}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
                {[
                  { label: 'Total Piece',  value: totalPieces ? String(totalPieces) : null },
                  { label: 'Gross Weight', value: totalWeight ? `${totalWeight} KG` : null },
                  { label: 'Volume',       value: volume      ? `${volume} CBM`     : null },
                  { label: 'Density',      value: density     ? `${density} KG/CBM` : null },
                ].map(({ label, value }) => value ? (
                  <div key={label} className="rounded-[5px] p-2 border" style={{ borderColor: 'var(--color-cyan)', background: '#fff' }}>
                    <p className="text-[10px] mb-1" style={{ color: '#818181' }}>{label}</p>
                    <p className="ff-sc text-black text-[14px] font-bold">{value}</p>
                  </div>
                ) : null)}
              </div>

              {(hasNonTiltable || hasNonStackable) && (
                <ul className="list-disc pl-5 space-y-0.5 mt-1">
                  {hasNonTiltable  && <li className="ff-sc text-white text-[12px]">Non-tiltable items present</li>}
                  {hasNonStackable && <li className="ff-sc text-white text-[12px]">Non-stackable items present</li>}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}