'use client'

import { memo, useState } from 'react'
import { Truck as TruckIcon } from 'lucide-react'
import type { Truck, TruckInspection } from '@/app/types/truck.types'

/** Display helpers shared by the Vehicle Management tabs. */

export function resolveModelImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  const u = url.trim()
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('/')) {
    const base   = process.env.NEXT_PUBLIC_API_URL ?? ''
    const origin = base.replace(/\/api\/?$/i, '')
    return origin ? `${origin}${u}` : u
  }
  return u
}

export const ModelThumb = memo(function ModelThumb({
  imageUrl,
  label,
  size = 44,
}: {
  imageUrl: string | null
  label: string
  size?: number
}) {
  const [broken, setBroken] = useState(false)
  const dim = `${size}px`
  if (!imageUrl || broken) {
    return (
      <div
        className="rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center shrink-0"
        style={{ width: dim, height: dim }}
        title={label}
      >
        <TruckIcon size={Math.round(size * 0.42)} className="text-white/25" aria-hidden />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={label}
      width={size}
      height={size}
      className="rounded-lg object-cover border border-white/10 bg-black/30 shrink-0"
      style={{ width: dim, height: dim }}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  )
})

export const STATUSES: Truck['status'][] = [
  'available',
  // Back from a job; set by the driver's return, lifted by the next passing BLOWBAGETS.
  'recheck_due',
  'in_use',
  'under_maintenance',
  'inactive',
  'archived',
]

// What the edit form may set. Archiving has its own action (it also releases the
// driver pairing and is refused mid-booking), so it is not a status pick.
export const EDITABLE_STATUSES = STATUSES.filter((s) => s !== 'archived')

export function fmtLabel(s: string) {
  if (s === 'recheck_due') return 'Re-check Due'
  return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function statusStyle(status: string): { bg: string; color: string; border: string } {
  switch (status) {
    case 'available':
      return { bg: 'rgba(58,246,38,0.12)', color: '#86efac', border: 'rgba(58,246,38,0.35)' }
    case 'in_use':
      return { bg: 'rgba(77,249,237,0.12)', color: 'var(--color-cyan)', border: 'rgba(77,249,237,0.35)' }
    case 'recheck_due':
      return { bg: 'rgba(250,204,21,0.12)', color: '#fde047', border: 'rgba(250,204,21,0.35)' }
    case 'under_maintenance':
      return { bg: 'rgba(246,159,38,0.12)', color: '#fbbf24', border: 'rgba(246,159,38,0.35)' }
    case 'inactive':
      return { bg: 'rgba(156,163,175,0.12)', color: '#d1d5db', border: 'rgba(156,163,175,0.3)' }
    case 'archived':
      return { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', border: 'rgba(107,114,128,0.35)' }
    default:
      return { bg: 'rgba(156,163,175,0.12)', color: '#9ca3af', border: 'rgba(156,163,175,0.3)' }
  }
}

export function kgToTons(kg: number | null | undefined): string {
  if (kg == null) return ''
  const tons = kg / 1000
  return parseFloat(tons.toFixed(3)).toString()
}

export function TruckStatusBadge({ status }: { status: string }) {
  const st = statusStyle(status)
  return (
    <span
      className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
      style={{ color: st.color, borderColor: st.border, background: st.bg }}
    >
      {fmtLabel(status)}
    </span>
  )
}

/**
 * Whether this vehicle is cleared for operations to assign, from its most recent
 * BLOWBAGETS inspection. A vehicle that has never been inspected reads the same
 * as one that failed: it can't be picked.
 */
export function InspectionBadge({ inspection, dueRecheck }: { inspection: TruckInspection | null; dueRecheck?: boolean }) {
  if (!inspection) {
    return (
      <span
        className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
        style={{ color: 'rgba(255,255,255,0.45)', borderColor: 'rgba(255,255,255,0.15)' }}
        title="Never inspected — cannot be assigned to a booking"
      >
        Not inspected
      </span>
    )
  }

  const when = new Date(inspection.inspected_at)
  const whenLabel = Number.isNaN(when.getTime())
    ? inspection.inspected_at
    : when.toLocaleDateString()

  // A pass that predates the vehicle's last homecoming is spent: it cleared the
  // job the truck has already done. Saying "Passed" here would leave the fleet
  // manager wondering why operations cannot pick it.
  if (inspection.passed && dueRecheck) {
    return (
      <span className="flex flex-col gap-0.5 items-start">
        <span
          className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
          style={{ color: '#fbbf24', borderColor: 'rgba(246,159,38,0.35)', background: 'rgba(246,159,38,0.12)' }}
          title="Back from a booking since its last check — inspect it again before it can be assigned"
        >
          Re-check due
        </span>
        <span className="text-[10px] text-white/30 tabular-nums">last {whenLabel}</span>
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-0.5 items-start">
      <span
        className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border"
        style={
          inspection.passed
            ? { color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.40)', background: 'rgba(77,249,237,0.12)' }
            : { color: '#fca5a5', borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.10)' }
        }
        title={inspection.passed
          ? 'Cleared — the Operations Manager can assign this vehicle'
          : 'Failed — blocked from assignment until it passes a re-check'}
      >
        {inspection.passed ? 'Passed' : 'Failed'}
      </span>
      <span className="text-[10px] text-white/30 tabular-nums">{whenLabel}</span>
    </span>
  )
}
