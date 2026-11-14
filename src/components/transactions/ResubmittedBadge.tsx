import { RotateCcw } from 'lucide-react'

import { AMBER, ERROR } from './transaction-theme'

/**
 * How many times the client corrected and resubmitted this booking after a
 * rejection. A resubmission rewrites the same booking, so this count is what
 * tells it apart from a first-time request.
 */
export function resubmissionsOf(b: object): number {
  return Number((b as { resubmission_count?: unknown }).resubmission_count ?? 0) || 0
}

/** List and header badge next to the status. ResubmissionChanges shows what changed. */
export default function ResubmittedBadge({ count, className = 'mt-1', tone = 'amber' }: {
  count:      number
  className?: string
  /** 'red' = the Booking Management panel header (Figma 2026-11-14). */
  tone?:      'amber' | 'red'
}) {
  if (count <= 0) return null
  const c = tone === 'red' ? ERROR : AMBER
  return (
    <span
      title={`Corrected and resubmitted by the client after a rejection${count > 1 ? ` (${count} times)` : ''}`}
      className={`flex w-fit items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap ${className}`}
      style={{ color: c, borderColor: tone === 'red' ? c : `${c}55`, background: `${c}14` }}
    >
      {tone === 'amber' && <RotateCcw size={9} />}
      Resubmitted{count > 1 ? ` ×${count}` : ''}
    </span>
  )
}
