'use client'

import { useState, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

export interface RowAction {
  label:     string
  icon:      ReactNode
  onSelect:  () => void
  /**
   * 'warning' (yellow) for archive-style actions, 'caution' (orange) for
   * deactivate-style ones, 'danger' (red) for revoking, 'accent' (cyan) for the
   * one the row is waiting on.
   */
  tone?:     'default' | 'warning' | 'caution' | 'danger' | 'accent'
  disabled?: boolean
  /** Shown as a tooltip — say why when `disabled`. */
  title?:    string
  /** Draw a divider above this item (tablets and desktop). */
  separated?: boolean
  /** Phones: the group header above this item ("Account", "App access"). Also starts a new group on wider screens. */
  section?:  string
  /** Phones: one short line under the label saying what the action does. */
  description?: string
}

const TONE: Record<NonNullable<RowAction['tone']>, string> = {
  default: 'text-[#818181] [@media(hover:hover)]:hover:bg-[#2a2a2a] [@media(hover:hover)]:hover:text-white',
  warning: 'text-[#ffea00] [@media(hover:hover)]:hover:bg-[#ffea00]/10',
  caution: 'text-[#ff7a30] [@media(hover:hover)]:hover:bg-[#ff7a30]/10',
  danger:  'text-[#f62626] [@media(hover:hover)]:hover:bg-[#f62626]/10',
  accent:  'text-[var(--color-cyan)] [@media(hover:hover)]:hover:bg-[rgba(77,249,237,0.08)]',
}

/** Default items in white instead of grey. Coloured tones keep their colour. */
const DEFAULT_BRIGHT = 'text-white [@media(hover:hover)]:hover:bg-[#2a2a2a]'

/**
 * The 3-dot actions menu used in every table's Actions column, after Untitled
 * UI's icon dropdowns (untitledui.com/react/components/dropdowns):
 *
 *   tablets and desktop — "Icon simple": a compact list of icon + label rows,
 *                         grouped with dividers.
 *   phones (< 640px)    — "Icon advanced": a header naming the record, section
 *                         headers, a one-line hint under each action, and
 *                         bigger touch rows.
 *
 * Portalled, so it is never clipped by a scrolling table body. Each item only
 * starts its action; anything that changes an account still confirms in a pop-up.
 */
export default function RowActionMenu({
  actions, label = 'Actions', brightText = false, heading, subheading, iconSize = 15,
}: {
  actions:     RowAction[]
  label?:      string
  /** White default items (Vehicle Management). Off elsewhere, which keep grey. */
  brightText?: boolean
  /** Phones: the record the menu acts on, e.g. the person's name. */
  heading?:    string
  /** Phones: a second line under the heading, e.g. their email. */
  subheading?: string
  /** Size of the 3-dot icon. */
  iconSize?:   number
}) {
  const [open, setOpen] = useState(false)
  const phone = useIsMobile()
  if (actions.length === 0) return null

  const toneOf = (a: RowAction) =>
    brightText && (a.tone ?? 'default') === 'default' ? DEFAULT_BRIGHT : TONE[a.tone ?? 'default']

  const pick = (a: RowAction) => { setOpen(false); a.onSelect() }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className="rounded-md p-1.5 text-[#818181] transition [@media(hover:hover)]:hover:bg-[#2a2a2a] [@media(hover:hover)]:hover:text-white data-[state=open]:bg-[#2a2a2a] data-[state=open]:text-white"
        >
          <MoreVertical size={iconSize} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        collisionPadding={16}
        onClick={(e) => e.stopPropagation()}
        // Above the model catalog modal (z-60), below confirm modals (z-70).
        className={`z-[65] gap-0 rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-0 text-white shadow-xl ring-0 ${
          phone ? 'w-[min(300px,calc(100vw-32px))]' : 'w-56'
        }`}
      >
        <div role="menu" aria-label={label}
          className="flex max-h-[min(70dvh,var(--radix-popover-content-available-height))] flex-col overflow-y-auto overscroll-contain p-1">
          {phone && heading && (
            <div className="mb-1 border-b border-[#2a2a2a] px-3 pb-2.5 pt-2">
              <p className="truncate text-sm font-semibold text-white">{heading}</p>
              {subheading && <p className="truncate text-xs text-[#818181]">{subheading}</p>}
            </div>
          )}

          {actions.map((a, i) => {
            const prev     = actions[i - 1]
            const newGroup = i > 0 && (a.separated || (a.section && a.section !== prev?.section))
            return (
              <div key={`${a.section ?? ''}-${a.label}`}>
                {newGroup && <div className="my-1 border-t border-[#2a2a2a]" />}
                {phone && a.section && a.section !== prev?.section && (
                  <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[#555]">{a.section}</p>
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={a.disabled}
                  aria-disabled={a.disabled || undefined}
                  title={a.title}
                  onClick={() => pick(a)}
                  className={`flex w-full items-center rounded-lg text-left transition disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${toneOf(a)} ${
                    phone ? 'gap-3 px-3 py-2.5' : 'gap-2.5 px-2.5 py-2 text-sm'
                  }`}
                >
                  {phone ? (
                    <>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#232323]">
                        {a.icon}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium">{a.label}</span>
                        {a.description && <span className="text-xs leading-snug text-[#818181]">{a.description}</span>}
                      </span>
                    </>
                  ) : (
                    <>{a.icon} {a.label}</>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
