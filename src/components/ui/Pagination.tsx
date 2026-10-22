'use client'

import { useState } from 'react'

/**
 * The one pagination bar, as the Figma draws it (Vehicle Management, node 2965:1738):
 * "Showing 1-10 of 57" on the left; on the right the cyan arrows, the page numbers
 * with ellipses for long runs (1 … 4 5 6 … 12), the current page on a light chip,
 * and a "go to page" box. Every paged table uses this, so they all look the same.
 */

/**
 * Page numbers to show, with `null` where the "..." goes: three numbers on the
 * left, the last three on the right (1 2 3 ... 8 9 10). The left three slide
 * along with the current page (4 5 6 ... 8 9 10) so it is always visible.
 */
export function pageItems(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const left  = page <= 3 || page >= totalPages - 2 ? [1, 2, 3] : [page - 1, page, page + 1]
  const right = [totalPages - 2, totalPages - 1, totalPages]
  const nums  = Array.from(new Set([...left, ...right])).sort((a, b) => a - b)
  const items: (number | null)[] = []
  nums.forEach((n, i) => {
    if (i > 0 && n > nums[i - 1] + 1) items.push(null)
    items.push(n)
  })
  return items
}

export default function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  disabled = false,
  bar = true,
  jump = true,
  className = '',
}: {
  /** 1-based. */
  page:         number
  totalPages:   number
  total:        number
  pageSize:     number
  onPageChange: (page: number) => void
  disabled?:    boolean
  /** The table footer strip (dark fill, grey top rule). Off where the caller draws its own row. */
  bar?:         boolean
  /** The "go to page" box. Off in tight spots such as the notification panel. */
  jump?:        boolean
  /** Layout only; the look is fixed here. */
  className?:   string
}) {
  const [target, setTarget] = useState('')
  const pages = Math.max(1, totalPages)
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last  = Math.min(total, page * pageSize)
  const go    = (p: number) => { if (!disabled && p >= 1 && p <= pages && p !== page) onPageChange(p) }
  const jumpTo = () => {
    const n = Number.parseInt(target, 10)
    if (Number.isFinite(n)) go(Math.min(pages, Math.max(1, n)))
    setTarget('')
  }

  const arrow = 'flex size-6 items-center justify-center rounded-[5px] transition-opacity hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30'

  return (
    <nav
      aria-label="Pagination"
      // Phones: everything stacked and centred. From sm up: count left, controls right.
      className={`flex flex-col items-center gap-y-1.5 sm:flex-row sm:flex-wrap sm:justify-between gap-x-4 text-[12px] text-[#818181] ${
        bar ? 'shrink-0 min-h-12 border-t border-[#818181] bg-[#181717] pl-4 pr-3 py-2 sm:pl-[26px] sm:pr-[21px]' : ''
      } ${className}`}
    >
      <p className="whitespace-nowrap tabular-nums">
        {total === 0 ? 'No results' : <>Showing {first}-{last} of {total.toLocaleString()}</>}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-[5px]">
          <button type="button" onClick={() => go(page - 1)} disabled={disabled || page <= 1} className={arrow} aria-label="Previous page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/pagination/prev.svg" alt="" width={18} height={18} draggable={false} />
          </button>

          {pageItems(page, pages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="w-[26px] text-center" aria-hidden>...</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                disabled={disabled}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={`flex h-[18px] min-w-[14px] items-center justify-center rounded-[5px] px-[3px] tabular-nums transition-colors ${
                  p === page ? 'bg-[#d9d9d9] text-black' : 'hover:text-white'
                }`}
              >
                {p}
              </button>
            ),
          )}

          <button type="button" onClick={() => go(page + 1)} disabled={disabled || page >= pages} className={arrow} aria-label="Next page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/pagination/next.svg" alt="" width={18} height={18} draggable={false} />
          </button>
        </div>

        {jump && pages > 1 && (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => { e.preventDefault(); jumpTo() }}
          >
            <label className="whitespace-nowrap text-[#424242]">
              go to page
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                aria-label="Go to page"
                disabled={disabled}
                className="ml-1 h-4 w-[39px] rounded-[4px] border-[0.5px] border-[#818181] bg-transparent px-1 text-center text-[12px] text-white outline-none focus:border-[#4df9ed]"
              />
            </label>
            <button type="submit" disabled={disabled || !target} className="flex items-center text-[#4df9ed] disabled:opacity-50">
              go
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/pagination/go.svg" alt="" width={14} height={14} draggable={false} className="rotate-180" />
            </button>
          </form>
        )}
      </div>
    </nav>
  )
}
