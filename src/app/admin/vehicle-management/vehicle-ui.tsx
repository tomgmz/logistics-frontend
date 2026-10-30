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

// The finalized vehicle statuses (Figma 3158:613). The backend still stores
// 'recheck_due' for a vehicle back from a job; it reads as Available here, and
// what stops it being assigned is the inspection check (the Maintenance column
// and tab show "Blowbagets" until it passes), not the status.
export const STATUSES: Truck['status'][] = [
  'available',
  'in_use',
  'under_maintenance',
  'inactive',
  'archived',
]

// What the edit form may set. Archiving has its own action (it also releases the
// driver pairing and is refused mid-booking), so it is not a status pick.
export const EDITABLE_STATUSES = STATUSES.filter((s) => s !== 'archived')

export function fmtLabel(s: string) {
  if (s === 'recheck_due') return 'Available'
  return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function statusStyle(status: string): { bg: string; color: string; border: string } {
  switch (status) {
    case 'available':
    case 'recheck_due':
      return { bg: 'rgba(58,246,38,0.1)', color: '#3af626', border: 'rgba(58,246,38,0.35)' }
    case 'in_use':
      return { bg: 'rgba(77,249,237,0.12)', color: '#4df9ed', border: 'rgba(77,249,237,0.35)' }
    case 'under_maintenance':
      return { bg: 'rgba(255,122,48,0.1)', color: '#ff7a30', border: 'rgba(255,122,48,0.35)' }
    case 'inactive':
      return { bg: 'rgba(255,234,0,0.2)', color: '#ffea00', border: 'rgba(255,234,0,0.35)' }
    case 'archived':
      return { bg: 'rgba(138,56,245,0.12)', color: '#8a38f5', border: 'rgba(138,56,245,0.35)' }
    default:
      return { bg: 'rgba(156,163,175,0.12)', color: '#9ca3af', border: 'rgba(156,163,175,0.3)' }
  }
}

/** The table format's pill (`.t-badge` in globals.css); the caller's style sets its colours. */
export const TABLE_TAG = 't-badge'

/** Cargo bed as "L x W x H" in mm, or '—' when any side is missing. */
export function fmtDimensions(m: { length_mm?: number | null; width_mm?: number | null; height_mm?: number | null } | null | undefined): string {
  if (!m?.length_mm || !m.width_mm || !m.height_mm) return '—'
  return `${m.length_mm} x ${m.width_mm} x ${m.height_mm}`
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
        className={TABLE_TAG}
        style={{ color: '#818181', borderColor: '#818181', background: 'rgba(129,129,129,0.1)' }}
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
          className={TABLE_TAG}
          style={{ color: '#ffea00', borderColor: '#ffea00', background: 'rgba(255,234,0,0.12)' }}
          title="Back from a booking since its last check — inspect it again before it can be assigned"
        >
          Re-check due
        </span>
        <span className="text-[11px] text-[#818181]/70 tabular-nums">last {whenLabel}</span>
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-0.5 items-start">
      <span
        className={TABLE_TAG}
        style={
          inspection.passed
            ? { color: '#4df9ed', borderColor: '#4df9ed', background: 'rgba(77,249,237,0.19)' }
            : { color: '#f62626', borderColor: '#f62626', background: 'rgba(246,38,38,0.13)' }
        }
        title={inspection.passed
          ? 'Cleared — the Operations Manager can assign this vehicle'
          : 'Failed — blocked from assignment until it passes a re-check'}
      >
        {inspection.passed ? 'Passed' : 'Failed'}
      </span>
      <span className="text-[11px] text-[#818181]/70 tabular-nums">{whenLabel}</span>
    </span>
  )
}
