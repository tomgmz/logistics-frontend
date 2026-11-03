import { AlertTriangle } from 'lucide-react'

import { ERROR } from './transaction-theme'

/**
 * The client reported a problem with a delivered booking and staff have not
 * marked it resolved yet. Only a 'delivered' booking can carry one: a client
 * who confirms completion anyway has closed it, and nothing could resolve it
 * after that.
 */
export function hasOpenClientIssue(b: Record<string, unknown>): boolean {
  return String(b.status ?? '').toLowerCase() === 'delivered'
    && !!b.client_issue_reported_at
    && !b.client_issue_resolved_at
}

/**
 * What the booking's status reads while that problem is open, everywhere the
 * Delivered status shows ("Delivered — Please Confirm" would be wrong: the
 * client already answered).
 */
export const PROBLEM_STATUS_LABEL = 'Delivered — Problem Reported'
export const PROBLEM_STATUS_COLOR = ERROR

/** List and header badge for the same. The note goes in the tooltip. */
export default function ProblemReportedBadge({ note, className = 'mt-1' }: {
  note?:      string | null
  className?: string
}) {
  return (
    <span
      title={note ? `Problem reported by the client: ${note}` : 'Problem reported by the client'}
      className={`flex w-fit items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${className}`}
      style={{ color: ERROR, borderColor: `${ERROR}55`, background: `${ERROR}14` }}
    >
      <AlertTriangle size={9} />
      Problem reported
    </span>
  )
}
