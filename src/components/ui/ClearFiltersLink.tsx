'use client'

/**
 * "Clear all filters" under a table's empty message, shown only while a search,
 * tab, filter or date range is narrowing the list. The client's Transaction
 * History link, shared by every table.
 */
export default function ClearFiltersLink({ onClear, show = true, className = '' }: {
  onClear: () => void
  show?: boolean
  className?: string
}) {
  if (!show) return null
  return (
    <button
      type="button"
      onClick={onClear}
      className={`ff-sc mt-2 cursor-pointer text-xs text-[#4df9ed] underline underline-offset-2 [@media(hover:hover)]:hover:opacity-80 ${className}`}
    >
      Clear all filters
    </button>
  )
}
