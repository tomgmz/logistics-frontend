'use client'

import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PlaceIcon from '@mui/icons-material/Place'
import { BookingStatus } from '@/app/types/maps/routemap.types'

export function StatusBadge({ status }: { status: BookingStatus | string }) {
  const upper = status.toUpperCase() as BookingStatus
  const config: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    'BOOKED':     { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40', dot: 'bg-yellow-400' },
    'IN TRANSIT': { bg: 'bg-cyan-500/20',   text: 'text-cyan-400',   border: 'border-cyan-500/40',   dot: 'bg-cyan-400'  },
    'ARRIVED':    { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/40',  dot: 'bg-green-400' },
    'CANCELED':   { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/40',    dot: 'bg-red-400'   },
  }
  const c = config[upper] ?? config['BOOKED']
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
      {upper}
    </span>
  )
}

export function RouteStop({
  sequenceNumber,
  address,
  isOrigin,
  isLast,
  status,
}: {
  sequenceNumber?: number
  address: string
  isOrigin?: boolean
  isLast?: boolean
  status?: 'pending' | 'delivered' | 'failed'
}) {
  const delivered = status === 'delivered'
  const failed    = status === 'failed'

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
          isOrigin    ? 'bg-gray-700 border-gray-600'
          : delivered ? 'bg-green-500 border-green-400'
          : failed    ? 'bg-red-500 border-red-400'
          : isLast    ? 'bg-red-500 border-red-400'
          : 'bg-cyan-500/20 border-cyan-500/60'
        }`}>
          {delivered ? (
            <CheckCircleIcon sx={{ fontSize: 14, color: '#fff' }} />
          ) : failed ? (
            <span className="text-white text-[10px] font-bold">✕</span>
          ) : isOrigin ? (
            <PlaceIcon sx={{ fontSize: 14, color: '#9ca3af' }} />
          ) : (
            <span className="text-white text-[10px] font-black leading-none">{sequenceNumber}</span>
          )}
        </div>
        {!isLast && (
          <div className="w-px flex-1 min-h-[32px] border-l-2 border-dashed border-gray-700 my-1" />
        )}
      </div>

      <div className="flex-1 pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-white font-semibold text-sm leading-snug">{address}</p>
          {status && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
              delivered ? 'bg-green-900/40 text-green-400 border border-green-800/50'
              : failed  ? 'bg-red-900/40 text-red-400 border border-red-800/50'
              : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-[#1a1a1a] rounded-lg px-3 py-2.5 border border-gray-800/60">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-200 text-xs font-medium">{value}</span>
    </div>
  )
}