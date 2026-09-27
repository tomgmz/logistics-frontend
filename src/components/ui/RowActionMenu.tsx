'use client'

import { useState, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface RowAction {
  label:     string
  icon:      ReactNode
  onSelect:  () => void
  /** 'warning' for archive-style actions, 'accent' for the one the row is waiting on. */
  tone?:     'default' | 'warning' | 'accent'
  disabled?: boolean
  /** Shown as a tooltip — say why when `disabled`. */
  title?:    string
  /** Draw a divider above this item. */
  separated?: boolean
}

const TONE: Record<NonNullable<RowAction['tone']>, string> = {
  default: 'text-[#818181] hover:bg-[#2a2a2a] hover:text-white',
  warning: 'text-yellow-400 hover:bg-yellow-500/10',
  accent:  'text-[var(--color-cyan)] hover:bg-[rgba(77,249,237,0.08)]',
}

/**
 * The 3-dot actions menu used in every management table's Actions column.
 *
 * Portalled, so it is never clipped by a scrolling table body. Each item only
 * starts its action — the destructive ones still confirm in a modal.
 */
export default function RowActionMenu({ actions, label = 'Actions' }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false)
  if (actions.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className="rounded-md p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white data-[state=open]:bg-[#2a2a2a] data-[state=open]:text-white"
        >
          <MoreVertical size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
        // Above the model catalog modal (z-60), below confirm modals (z-70).
        className="z-[65] w-52 gap-0 rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-0 py-1 text-white shadow-xl ring-0"
      >
        {actions.map((a) => (
          <div key={a.label}>
            {a.separated && <div className="my-1 border-t border-[#2a2a2a]" />}
            <button
              type="button"
              disabled={a.disabled}
              title={a.title}
              onClick={() => { setOpen(false); a.onSelect() }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${TONE[a.tone ?? 'default']}`}
            >
              {a.icon} {a.label}
            </button>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
