import { RotateCcw } from 'lucide-react'

import { AMBER } from './transaction-theme'

/**
 * How many times the client corrected and resubmitted this booking after a
 * rejection. A resubmission rewrites the same booking, so this count is what
 * tells it apart from a first-time request.
 */
export function resubmissionsOf(b: object): number {
  return Number((b as { resubmission_count?: unknown }).resubmission_count ?? 0) || 0
}

/** List and header badge next to the status. ResubmissionChanges shows what changed. */
export default function ResubmittedBadge({ count, className = 'mt-1' }: {
  count:      number
  className?: string
}) {
  if (count <= 0) return null
  return (
    <span
      title={`Corrected and resubmitted by the client after a rejection${count > 1 ? ` (${count} times)` : ''}`}
      className={`flex w-fit items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap ${className}`}
      style={{ color: AMBER, borderColor: `${AMBER}55`, background: `${AMBER}14` }}
    >
      <RotateCcw size={9} />
      Resubmitted{count > 1 ? ` ×${count}` : ''}
    </span>
  )
}
