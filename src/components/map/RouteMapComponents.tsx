'use client'

import { motion } from 'framer-motion'
import CheckCircleIcon  from '@mui/icons-material/CheckCircle'
import PlaceIcon        from '@mui/icons-material/Place'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { bookingStatusColor } from '@/lib/palette'

export type BookingStatus =
  | 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'IN TRANSIT'
  | 'COMPLETED' | 'CANCELLED' | 'BOOKED'
  | string

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending', BOOKED: 'Booked', APPROVED: 'Approved', ASSIGNED: 'Assigned',
  IN_TRANSIT: 'In Transit', 'IN TRANSIT': 'In Transit', ARRIVED: 'Arrived',
  DELIVERED: 'Delivered', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; border: string }> =
  Object.fromEntries(Object.entries(STATUS_LABEL).map(([key, label]) => {
    const color = bookingStatusColor(key)
    return [key, { label, color, bg: `${color}1f`, border: `${color}4d` }]
  }))

export function StatusBadge({ status }: { status: string }) {
  const key = status.toUpperCase().replace(/-/g, '_')
  const cfg = STATUS_MAP[key] ?? STATUS_MAP.PENDING

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest px-2.5 py-1 rounded-full border whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
      {cfg.label.toUpperCase()}
    </span>
  )
}

export function RouteStop({
  sequenceNumber,
  address,
  isOrigin = false,
  isLast   = false,
  status,
}: {
  sequenceNumber?: number
  address:  string
  isOrigin?: boolean
  isLast?:  boolean
  status?:  'pending' | 'delivered' | 'failed'
}) {
  const delivered = status === 'delivered'
  const failed    = status === 'failed'

  const dotColor = isOrigin  ? 'var(--color-cyan)'
    : delivered              ? 'var(--color-green)'
    : failed                 ? '#f62626'
    : isLast                 ? '#f62626'
    : 'var(--color-cyan)'

  const dotBg = isOrigin  ? 'rgba(77,249,237,0.15)'
    : delivered            ? 'rgba(58,246,38,0.15)'
    : failed               ? 'rgba(246,38,38,0.15)'
    : 'rgba(77,249,237,0.1)'

  return (
    <div className="flex gap-3 group">
      <div className="flex flex-col items-center flex-shrink-0">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-8 h-8 rounded-full flex items-center justify-center border-2 flex-shrink-0"
          style={{ background: dotBg, borderColor: dotColor }}
        >
          {delivered ? (
            <CheckCircleIcon  sx={{ fontSize: 14, color: 'var(--color-green)' }} />
          ) : failed ? (
            <ErrorOutlineIcon sx={{ fontSize: 14, color: '#f62626' }} />
          ) : isOrigin ? (
            <PlaceIcon        sx={{ fontSize: 14, color: 'var(--color-cyan)'  }} />
          ) : (
            <span className="text-white text-[10px] font-black leading-none">{sequenceNumber}</span>
          )}
        </motion.div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[28px] border-l-2 border-dashed border-gray-800 my-1" />
        )}
      </div>

      <div className="flex-1 pb-2 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-white text-sm font-semibold leading-snug truncate">{address}</p>
          {status && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border"
              style={{
                color:       delivered ? 'var(--color-green)' : failed ? '#f62626' : '#9ca3af',
                background:  delivered ? 'rgba(58,246,38,0.1)' : failed ? 'rgba(246,38,38,0.1)' : 'rgba(156,163,175,0.1)',
                borderColor: delivered ? 'rgba(58,246,38,0.3)' : failed ? 'rgba(246,38,38,0.3)' : 'rgba(156,163,175,0.2)',
              }}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          )}
        </div>
        {isOrigin && (
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Origin / Pickup</p>
        )}
      </div>
    </div>
  )
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-3 py-2.5 border bg-[#161616]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-200 text-xs font-medium">{value}</span>
    </div>
  )
}