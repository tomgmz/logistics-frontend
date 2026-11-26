import { Clock } from 'lucide-react'

import { PALETTE } from '@/lib/palette'
import { formatDuration } from '@/lib/duration'
import { Tip } from '@/components/ui/tooltip'

const ORANGE = PALETTE.orange

/**
 * Lateness for a list or header badge. delay.scheduler flags a booking when
 * the truck is not at the pickup point by the client's pick-up time and keeps
 * the worst minutes (delay_max_minutes) after it arrives, for on-time reporting.
 *  - now:  late for the pick-up right now (approved, assigned or in transit,
 *          not paused), minutes if known
 *  - was:  ran late at some point, worst minutes
 */
export function delayOf(b: object): { now: boolean; minutes: number | null } | null {
  const r = b as {
    status?: string; delayed_since?: string | null; paused_at?: string | null
    delay_minutes?: number | null; delay_max_minutes?: number | null
  }
  const now = ['approved', 'assigned', 'in_transit'].includes(String(r.status ?? '').toLowerCase()) && !!r.delayed_since && !r.paused_at
  if (now) return { now, minutes: typeof r.delay_minutes === 'number' ? r.delay_minutes : null }
  const max = Number(r.delay_max_minutes ?? 0) || 0
  return max > 0 ? { now: false, minutes: max } : null
}

/** "Delayed · 25 min" while it is late, "Was delayed · up to 2 hrs" after (formatDuration). */
export default function DelayedBadge({ booking, className = 'mt-1' }: {
  booking:    object
  className?: string
}) {
  const d = delayOf(booking)
  if (!d) return null
  const label = d.now
    ? `Delayed${d.minutes ? ` · ${formatDuration(d.minutes)}` : ''}`
    : `Was delayed · up to ${formatDuration(d.minutes ?? 0)}`
  return (
    <Tip label={d.now ? "Not at the pickup point by the client's pick-up time" : "Reached the pickup point after the client's pick-up time"}><span
      className={`flex w-fit items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap ${className}`}
      style={{ color: ORANGE, borderColor: `${ORANGE}55`, background: `${ORANGE}14` }}
    >
      <Clock size={9} />
      {label}
    </span></Tip>
  )
}
