'use client'

import { RefreshCw } from 'lucide-react'

/**
 * The "something changed" strip for history screens that do not auto-refresh
 * (see useLivePending). Renders nothing until there is at least one change.
 */
export default function NewEntriesBar({
  count,
  singular = 'new entry',
  plural = 'new entries',
  onRefresh,
}: {
  count: number
  singular?: string
  plural?: string
  onRefresh: () => void
}) {
  if (count <= 0) return null

  return (
    <button
      type="button"
      onClick={onRefresh}
      className="shrink-0 w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold cursor-pointer
                 text-[var(--color-cyan,#22d3ee)] bg-[var(--color-cyan,#22d3ee)]/10 border-b border-[var(--color-cyan,#22d3ee)]/20
                 hover:bg-[var(--color-cyan,#22d3ee)]/15 transition-colors"
    >
      <RefreshCw size={13} />
      <span>
        {count > 99 ? '99+' : count} {count === 1 ? singular : plural} — Refresh
      </span>
    </button>
  )
}
