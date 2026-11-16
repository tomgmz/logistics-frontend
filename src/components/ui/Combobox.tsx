'use client'

import * as React from 'react'
import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  EMPTY_VALUE, NativeDropdown, changeEvent, readOptions, useDesktopPicker, useTriggerFont,
  type DropdownProps,
} from '@/components/ui/Dropdown'

/*
 * A dropdown with a search field, for long lists (drivers, bookings,
 * commodities): the shadcn Combobox (Popover + Command). Same drop-in API as
 * <Dropdown> (<option> children, value, onChange(e)).
 *
 * Phones get the native picker, like every other dropdown (user 2026-11-16):
 * no search there, but no iOS keyboard pushing a floating list off screen.
 */

type ComboboxProps = DropdownProps & {
  /** Placeholder of the search field. */
  searchPlaceholder?: string
  /** Shown when nothing matches the search. */
  emptyText?: string
}

export default function Combobox(props: ComboboxProps) {
  const desktop = useDesktopPicker()
  if (!desktop) {
    const native: DropdownProps = { ...props }
    delete (native as ComboboxProps).searchPlaceholder
    delete (native as ComboboxProps).emptyText
    return <NativeDropdown {...native} />
  }
  return <DesktopCombobox {...props} />
}

function DesktopCombobox({
  value, onChange, children, className, style, chevron = true, contentClassName,
  id, name, disabled, title, onBlur, onFocus,
  searchPlaceholder = 'Search', emptyText = 'Nothing matches.',
  ...rest
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const options = readOptions(children)
  const emptyOption = options.find((o) => o.value === '')
  const items = options.filter((o) => o.value !== '' || !o.disabled)

  const current = value == null ? '' : String(value)
  const selected = options.find((o) => o.value === current && (o.value !== '' || !o.disabled))
  const { ref, font, capture } = useTriggerFont()

  const triggerProps = Object.fromEntries(
    Object.entries(rest).filter(([k]) => k.startsWith('aria-') || k.startsWith('data-') || k === 'tabIndex'),
  )

  const pick = (v: string) => {
    setOpen(false)
    if (v !== current) onChange?.(changeEvent(v, name))
  }

  return (
    <Popover open={open} onOpenChange={(o) => { if (o) capture(); setOpen(o) }}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          id={id}
          title={title}
          disabled={disabled}
          onBlur={onBlur as unknown as React.FocusEventHandler<HTMLButtonElement>}
          onFocus={onFocus as unknown as React.FocusEventHandler<HTMLButtonElement>}
          className={cn('flex items-center justify-between gap-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-[#4df9ed]/60 disabled:cursor-not-allowed disabled:opacity-50', className)}
          style={style}
          {...triggerProps}
        >
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'opacity-50')}>
            {selected ? selected.label : emptyOption?.label}
          </span>
          {chevron && <ChevronDown aria-hidden className={cn('size-4 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={16}
        // Escape closes the list only, not the modal or panel around it.
        onEscapeKeyDown={(e) => e.stopPropagation()}
        style={font ? { fontFamily: font } : undefined}
        className={cn(
          'z-[1500] w-[var(--radix-popover-trigger-width)] min-w-[240px] max-w-[calc(100vw-32px)] gap-0 overflow-hidden rounded-xl border border-[#424242] bg-[#1b1b1b] p-0 text-white shadow-[0_20px_40px_rgba(0,0,0,0.6)] ring-0',
          contentClassName,
        )}
      >
        <Command
          // Match on the words shown, not on internal ids.
          filter={(_value, search, keywords) =>
            (keywords ?? []).join(' ').toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0}
        >
          <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
          <CommandList className="max-h-[min(50dvh,var(--radix-popover-content-available-height),16rem)]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {items.map((o) => {
              const on = o.value === current
              return (
                <CommandItem
                  key={o.value || EMPTY_VALUE}
                  value={o.value === '' ? EMPTY_VALUE : o.value}
                  keywords={[o.text]}
                  disabled={o.disabled}
                  onSelect={() => pick(o.value)}
                  className={on ? 'text-[#4df9ed]' : undefined}
                >
                  <Check aria-hidden className={cn('size-4 shrink-0', on ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
