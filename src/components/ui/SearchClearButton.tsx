'use client'

import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/*
 * The × that empties a search box (user 2026-11-16). Shown only while the box
 * has text, at its right end, as Google, Apple and Material search fields do.
 * The box needs room for it on the right (pr-9) and a `relative` wrapper.
 * Pressing it keeps the cursor in the box (mousedown default prevented).
 * **Rule: every search box gets a SearchClearButton.**
 */
export default function SearchClearButton({ value, onClear, className }: {
  value:      string
  onClear:    () => void
  className?: string
}) {
  if (!value) return null
  return (
    <button
      type="button"
      aria-label="Clear search"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClear}
      className={cn(
        'absolute right-1.5 top-1/2 z-[1] flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-[#818181] transition-colors',
        '[@media(hover:hover)]:hover:bg-white/10 [@media(hover:hover)]:hover:text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4df9ed]/50',
        className,
      )}
    >
      <X aria-hidden className="size-4" />
    </button>
  )
}
