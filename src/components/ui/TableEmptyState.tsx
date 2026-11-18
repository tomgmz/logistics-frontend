'use client'

import type { ComponentType, ReactNode } from 'react'

/**
 * What every web table shows when it has no rows (2026-11-18, user: "make all
 * table have same ui in this state"): an empty table, or filters that match
 * nothing. Untitled UI's empty state: a round icon tile, a title, one line of
 * grey text, then "Clear all filters" (only while something is narrowing the
 * list) and an optional button such as "Add the first vehicle".
 *
 * Place it AFTER the </table>, inside the table's scroll box, so the column
 * headers stay above it (the user's choice) — never inside a <td>, where the
 * .data-table cell padding and text sizes squeeze it. `sticky left-0` keeps it
 * in view while a wide table is scrolled sideways on a phone.
 */
export default function TableEmptyState({
  icon: Icon,
  title,
  message,
  filtered = false,
  onClear,
  action,
  className = '',
}: {
  icon:      ComponentType<{ className?: string; size?: number | string }>
  /** Defaults to "No records found" while filtered, else "Nothing here yet". */
  title?:    string
  message:   ReactNode
  /** A search, filter, tab or date range is narrowing the list. */
  filtered?: boolean
  onClear?:  () => void
  /** Shown under the text, e.g. "Add the first model" (only when not filtered). */
  action?:   ReactNode
  className?: string
}) {
  return (
    <div
      role="status"
      className={`ff-darker sticky left-0 flex w-full flex-[1_0_auto] flex-col items-center justify-center px-4 py-14 text-center ${className}`}
    >
      <span aria-hidden className="mb-4 flex size-12 items-center justify-center rounded-full border border-[#424242] bg-[#1b1b1b] text-[#818181]">
        <Icon size={22} className="size-[22px]" />
      </span>
      <p className="text-base font-bold leading-tight text-white 3xl:text-lg">
        {title ?? (filtered ? 'No records found' : 'Nothing here yet')}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm font-semibold leading-snug text-[#818181] 3xl:text-base">
        {message}
      </p>
      {filtered && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 cursor-pointer text-sm font-bold text-[#4df9ed] underline underline-offset-2 [@media(hover:hover)]:hover:opacity-80"
        >
          Clear all filters
        </button>
      )}
      {!filtered && action && <div className="mt-5">{action}</div>}
    </div>
  )
}
