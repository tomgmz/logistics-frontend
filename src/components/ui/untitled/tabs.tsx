'use client'

import { useRef, type KeyboardEvent } from 'react'
import { ChevronDown } from '@untitledui/icons'
import { cn } from '@/lib/utils'

/**
 * Untitled UI's horizontal tab list, type "button-minimal", size "sm"
 * (components/application/tabs/tabs.tsx), without react-aria. Arrow keys move
 * between tabs as theirs do. Palette: bg-secondary_alt → #141414,
 * ring-secondary → #424242, bg-primary_alt → #262626, text-quaternary → #818181,
 * text-secondary → #e5e5e5.
 *
 * Below md it is a dropdown instead, as Untitled UI's tab demos pair the tab
 * list with a NativeSelect on phones: a native select, so iOS and Android show
 * their own picker.
 */
export function TabsMinimal<K extends string>({ items, selectedKey, onSelectionChange, label, className }: {
  items: { id: K; label: string }[]
  selectedKey: K
  onSelectionChange: (key: K) => void
  label: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + items.length) % items.length
    refs.current[next]?.focus()
    onSelectionChange(items[next].id)
  }

  return (
    <>
    <div className="relative w-full md:hidden">
      <select
        value={selectedKey}
        onChange={(e) => onSelectionChange(e.target.value as K)}
        aria-label={label}
        // 16px: iOS Safari zooms into any smaller focused field.
        className="w-full cursor-pointer appearance-none rounded-lg bg-[#1b1b1b] py-2 pl-3.5 pr-10 text-[16px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] outline-hidden ring-inset [color-scheme:dark] focus:ring-2 focus:ring-[#4df9ed]"
      >
        {items.map((t) => <option key={t.id} value={t.id} className="bg-[#1b1b1b] text-white">{t.label}</option>)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-[#818181]" />
    </div>
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex max-w-full max-md:hidden gap-0.5 overflow-x-auto rounded-lg bg-[#141414] ring-1 ring-[#424242] ring-inset', className)}
    >
      {items.map((t, i) => {
        const selected = t.id === selectedKey
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelectionChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'z-10 flex h-max shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold text-[#818181] outline-[#4df9ed] transition duration-100 ease-linear focus-visible:outline-2 focus-visible:-outline-offset-2',
              selected
                ? 'bg-[#262626] text-[#e5e5e5] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] ring-inset'
                : '[@media(hover:hover)]:hover:bg-[#262626] [@media(hover:hover)]:hover:text-[#e5e5e5]',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
    </>
  )
}
