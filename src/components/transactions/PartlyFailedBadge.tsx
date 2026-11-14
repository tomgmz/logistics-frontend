import { CircleSlash } from 'lucide-react'

import { ERROR } from './transaction-theme'

/**
 * Delivered or Completed, but at least one drop-off failed (user 2026-11-14).
 * A booking where NO drop-off was delivered has the status Failed instead.
 * Reads the drop-offs on the row, so it works on every list that carries them.
 */
export function isPartlyFailed(b: Record<string, unknown>): boolean {
  const status = String(b.status ?? '').toLowerCase()
  if (status !== 'delivered' && status !== 'completed') return false
  const dests = (b.booking_destinations ?? []) as Array<{ status?: string | null }>
  return Array.isArray(dests) && dests.some((d) => d?.status === 'failed')
}

/** How many drop-offs failed, for the tooltip. */
function failedCount(b: Record<string, unknown>): { failed: number; total: number } {
  const dests = (b.booking_destinations ?? []) as Array<{ status?: string | null }>
  const list  = Array.isArray(dests) ? dests : []
  return { failed: list.filter((d) => d?.status === 'failed').length, total: list.length }
}

/**
 * "Partly failed": a substatus line under Delivered / Completed, like
 * "Problem Reported". The pill keeps its own status and colour.
 */
export default function PartlyFailedBadge({ booking, className = 'mt-1' }: {
  booking?:   Record<string, unknown> | null
  className?: string
}) {
  const n = booking ? failedCount(booking) : null
  return (
    <span
      title={n && n.total > 0 ? `${n.failed} of ${n.total} drop-offs could not be delivered` : 'Some drop-offs could not be delivered'}
      className={`flex w-fit items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide leading-none ${className}`}
      style={{ color: ERROR }}
    >
      <CircleSlash size={10} aria-hidden />
      Partly Failed
    </span>
  )
}
