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
 * "Problem Reported" is a SUBSTATUS of Delivered (user 2026-11-07): the status
 * pill keeps reading "Delivered" in its own colour, and this red line sits
 * directly under it wherever a booking status shows. The note goes in the
 * tooltip.
 */
export default function ProblemReportedBadge({ note, className = 'mt-1' }: {
  note?:      string | null
  className?: string
}) {
  return (
    <span
      title={note ? `Problem reported by the client: ${note}` : 'Problem reported by the client'}
      className={`flex w-fit items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide leading-none ${className}`}
      style={{ color: ERROR }}
    >
      <AlertTriangle size={10} aria-hidden />
      Problem Reported
    </span>
  )
}
