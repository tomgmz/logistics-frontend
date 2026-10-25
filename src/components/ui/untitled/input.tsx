'use client'

import { useEffect, useRef, useSyncExternalStore, type FC } from 'react'
import { cn } from '@/lib/utils'

const noSubscribe = () => () => {}

/**
 * Untitled UI's Input, size "sm", with a leading icon and the keyboard shortcut
 * badge (components/base/input/input.tsx), without react-aria. Ctrl K (⌘K on
 * a Mac) focuses it. Palette: bg-primary → #1b1b1b, ring-primary → #424242,
 * ring-brand → #4df9ed, fg-quaternary / text-placeholder → #818181.
 */
export function InputShortcut({ value, onChange, onEnter, placeholder = 'Search', icon: Icon, className }: {
  value: string
  onChange: (value: string) => void
  /** Enter in the box (e.g. open the first match). */
  onEnter?: () => void
  placeholder?: string
  icon?: FC<{ className?: string }>
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  // The server renders ⌘K; the client swaps in Ctrl K off a Mac after hydrating.
  const mac = useSyncExternalStore(noSubscribe, () => /Mac|iPhone|iPad/.test(navigator.userAgent), () => true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className={cn(
        'group/input relative flex w-full flex-row place-content-center place-items-center rounded-lg bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] transition-shadow duration-100 ease-linear ring-inset focus-within:ring-2 focus-within:ring-[#4df9ed]',
        className,
      )}
    >
      {Icon && <Icon className="pointer-events-none absolute left-3 size-4 stroke-[2.25px] text-[#818181]" />}
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onEnter ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } } : undefined}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'}
        // 16px on phones: iOS Safari zooms into any smaller focused field.
        className={cn(
          'm-0 w-full bg-transparent px-3 py-2 text-white ring-0 outline-hidden placeholder:text-[#818181] max-sm:text-[16px] text-sm md:pr-16 [&::-webkit-search-cancel-button]:hidden',
          Icon && 'pl-9',
        )}
      />
      {/* Shortcut: only where there is a keyboard to press it on. */}
      <div className="pointer-events-none absolute inset-y-0.5 right-0.5 z-10 hidden items-center rounded-r-[inherit] bg-linear-to-r from-transparent to-[#1b1b1b] to-40% pl-8 pr-1.5 md:flex [@media(hover:none)]:hidden">
        <span aria-hidden="true" className="pointer-events-none rounded px-1 py-px text-xs font-medium text-[#818181] ring-1 ring-[#424242] select-none ring-inset">
          {mac ? '⌘K' : 'Ctrl K'}
        </span>
      </div>
    </div>
  )
}
