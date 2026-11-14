'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { BookingWithRelations } from '@/lib/types/booking-relations'

/**
 * Every booking status, in the order a booking moves through them (the
 * bookings_status_check list). "all" is every booking except cancelled ones:
 * a cancelled (rejected or withdrawn) booking never moves, so it is shown only
 * when Cancelled is picked.
 */
export const BOOKING_STATUS_FILTERS = [
  { value: 'all',        label: 'All' },
  { value: 'pending',    label: 'Pending' },
  { value: 'approved',   label: 'Approved' },
  { value: 'assigned',   label: 'Assigned' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered',  label: 'Delivered' },
  { value: 'completed',  label: 'Completed' },
  { value: 'failed',     label: 'Failed' },
  { value: 'cancelled',  label: 'Cancelled' },
] as const

export type StatusFilter = (typeof BOOKING_STATUS_FILTERS)[number]['value']

export function filterByStatus(bookings: BookingWithRelations[], filter: StatusFilter) {
  const norm = (s: unknown) => String(s ?? '').toLowerCase()
  if (filter === 'all') return bookings.filter((b) => norm(b.status) !== 'cancelled')
  return bookings.filter((b) => norm(b.status) === filter)
}

export function statusFilterLabel(filter: StatusFilter) {
  return BOOKING_STATUS_FILTERS.find((f) => f.value === filter)?.label ?? 'All'
}

/** The tracking list's status picker: one full-width button, a menu with a count per status. */
export default function StatusFilterDropdown({ value, onChange, bookings }: {
  value:    StatusFilter
  onChange: (value: StatusFilter) => void
  /** The bookings the counts are taken from (after the search). */
  bookings: BookingWithRelations[]
}) {
  const [open, setOpen] = useState(false)
  const narrowed = value !== 'all'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Status: ${statusFilterLabel(value)}`}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 text-[13px] font-bold transition-colors"
          style={{
            background:  narrowed || open ? 'rgba(77,249,237,0.12)' : 'transparent',
            borderColor: narrowed || open ? 'rgba(77,249,237,0.35)' : 'var(--color-surface-dark)',
            color:       narrowed || open ? 'var(--color-cyan)' : '#9f9c9c',
          }}
        >
          <span className="truncate">Status: {statusFilterLabel(value)}</span>
          <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={16}
        className="w-[var(--radix-popover-trigger-width)] min-w-[200px] max-w-[calc(100vw-32px)] gap-0 rounded-xl border border-[#424242] bg-[#1b1b1b] p-1 text-white shadow-[0_20px_40px_rgba(0,0,0,0.6)] ring-0"
      >
        <div role="menu" aria-label="Status" className="flex max-h-[min(50dvh,var(--radix-popover-content-available-height))] flex-col overflow-y-auto overscroll-contain">
          {BOOKING_STATUS_FILTERS.map((f) => {
            const on    = f.value === value
            const count = filterByStatus(bookings, f.value).length
            return (
              <button
                key={f.value}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => { onChange(f.value); setOpen(false) }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors [@media(hover:hover)]:hover:bg-[#2a2a2a] ${on ? 'text-[var(--color-cyan)]' : 'text-white'}`}
              >
                <Check className={`size-4 shrink-0 ${on ? 'opacity-100' : 'opacity-0'}`} />
                <span className="min-w-0 flex-1 truncate">{f.label}</span>
                <span
                  className="min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[18px] tabular-nums"
                  style={{
                    background: on ? 'rgba(77,249,237,0.2)' : '#2a2a2a',
                    color:      on ? 'var(--color-cyan)' : count ? '#9f9c9c' : '#555',
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
