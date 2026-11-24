'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { NativeDropdown, useDesktopPicker } from '@/components/ui/Dropdown'
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
  { value: 'cancelled',  label: 'Rejected' },
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

/**
 * The tracking list's status picker: one full-width box, a count per status.
 * Tablets and desktop: the shadcn Select with a count pill per status. Phones:
 * the phone's own picker, "Pending (3)" (user 2026-11-16, as every dropdown).
 */
export default function StatusFilterDropdown({ value, onChange, bookings }: {
  value:    StatusFilter
  onChange: (value: StatusFilter) => void
  /** The bookings the counts are taken from (after the search). */
  bookings: BookingWithRelations[]
}) {
  const desktop = useDesktopPicker()
  const [open, setOpen] = useState(false)
  const narrowed = value !== 'all'
  const counts = BOOKING_STATUS_FILTERS.map((f) => ({ ...f, count: filterByStatus(bookings, f.value).length }))

  const boxStyle = {
    background:  narrowed || open ? 'rgba(77,249,237,0.12)' : 'transparent',
    borderColor: narrowed || open ? 'rgba(77,249,237,0.35)' : 'var(--color-surface-dark)',
    color:       narrowed || open ? 'var(--color-cyan)' : '#9f9c9c',
  }
  const boxClass = 'h-9 w-full rounded-lg border px-3 text-[13px] font-bold transition-colors'

  if (!desktop) {
    return (
      <NativeDropdown
        value={value}
        aria-label="Status"
        onChange={(e) => onChange(e.target.value as StatusFilter)}
        className={boxClass}
        style={boxStyle}
      >
        {counts.map((f) => <option key={f.value} value={f.value}>{`Status: ${f.label} (${f.count})`}</option>)}
      </NativeDropdown>
    )
  }

  return (
    <Select value={value} onValueChange={(v) => onChange(v as StatusFilter)} open={open} onOpenChange={setOpen}>
      <SelectTrigger aria-label={`Status: ${statusFilterLabel(value)}`} className={boxClass} style={boxStyle}>
        <span className="truncate">Status: {statusFilterLabel(value)}</span>
      </SelectTrigger>
      <SelectContent className="ff-regular">
        {counts.map((f) => {
          const on = f.value === value
          return (
            <SelectItem key={f.value} value={f.value} textValue={f.label} className="text-[13px] [&>span:last-child]:flex [&>span:last-child]:flex-1 [&>span:last-child]:items-center [&>span:last-child]:gap-2.5">
              <span className="min-w-0 flex-1 truncate">{f.label}</span>
              <span
                className="min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[18px] tabular-nums"
                style={{
                  background: on ? 'rgba(77,249,237,0.2)' : '#2a2a2a',
                  color:      on ? 'var(--color-cyan)' : f.count ? '#9f9c9c' : '#555',
                }}
              >
                {f.count}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
