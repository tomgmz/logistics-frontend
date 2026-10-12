'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Numbered pagination: Previous, the page numbers with ellipses for long runs
 * (1 … 4 5 6 … 12), Next, and the range being shown ("11–20 of 57").
 */

/** Page numbers to show, with `null` where an ellipsis goes. Always 1 and the last page. */
export function pageItems(page: number, totalPages: number, siblings = 1): (number | null)[] {
  if (totalPages <= 5 + siblings * 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const start = Math.max(2, page - siblings)
  const end   = Math.min(totalPages - 1, page + siblings)
  const items: (number | null)[] = [1]
  if (start > 2) items.push(null)
  for (let p = start; p <= end; p++) items.push(p)
  if (end < totalPages - 1) items.push(null)
  items.push(totalPages)
  return items
}

export default function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  disabled = false,
  className = '',
}: {
  page:         number
  totalPages:   number
  total:        number
  pageSize:     number
  onPageChange: (page: number) => void
  disabled?:    boolean
  className?:   string
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last  = Math.min(total, page * pageSize)
  const go    = (p: number) => { if (!disabled && p >= 1 && p <= totalPages && p !== page) onPageChange(p) }

  const btn = 'flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30'

  return (
    <nav className={`flex items-center justify-between gap-3 ${className}`} aria-label="Pagination">
      <p className="text-[11px] tabular-nums text-white/40">
        {total === 0 ? 'No results' : <>{first}–{last} of {total}</>}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(page - 1)}
            disabled={disabled || page <= 1}
            className={`${btn} border border-white/[0.08] text-white/60 hover:border-white/20 hover:text-white`}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>

          {pageItems(page, totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-[11px] text-white/30" aria-hidden>…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                disabled={disabled}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={`${btn} ${p === page
                  ? 'bg-[var(--color-cyan,#4df9ed)] text-[#0a0a0a]'
                  : 'text-white/60 hover:bg-white/[0.06] hover:text-white'}`}
              >
                {p}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => go(page + 1)}
            disabled={disabled || page >= totalPages}
            className={`${btn} border border-white/[0.08] text-white/60 hover:border-white/20 hover:text-white`}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </nav>
  )
}
