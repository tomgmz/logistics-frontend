'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

import { phDay } from '@/lib/ph-date'

/**
 * Choosing a driver for a booking (user 2026-11-13): an alphabetical list with
 * a search field, a flag on a license that is close to expiring, and no driver
 * whose license has expired by the delivery day (the server refuses them at
 * assignment anyway: assertDriverAssignable). A driver already on the booking
 * stays listed even then, flagged, so the form never shows a blank choice for
 * the driver that is actually assigned.
 *
 * The list opens inline under the button rather than floating, so it is never
 * clipped by the pop-up it sits in and scrolls with it on a phone.
 */

export interface DriverPickerOption {
  value:    string
  name:     string
  /** License number, vendor company, … */
  detail?:  string | null
  licenseExpiry?: string | null
  /** Set when the driver can't be picked (e.g. on another booking). */
  disabledNote?: string | null
  /** Extra warning, e.g. "usual vehicle coded". */
  warning?: string | null
}

type LicenseFlag = { tone: 'red' | 'amber'; text: string }

const DAY_MS = 24 * 60 * 60 * 1000

/** The delivery day: the scheduled day, or today if that has already passed. */
function deliveryDay(scheduleDate: string | null | undefined): string {
  const today = phDay(Date.now())
  const sched = scheduleDate && /^\d{4}-\d{2}-\d{2}/.test(scheduleDate) ? scheduleDate.slice(0, 10) : today
  return sched > today ? sched : today
}

/**
 * Where a license stands for THIS delivery. `hidden` when it has expired by the
 * delivery day; a flag when it expires on that day or within a month after it
 * (the same one-month window as Driver Management and the reminders).
 */
export function licenseForDelivery(
  expiry: string | null | undefined,
  scheduleDate: string | null | undefined,
): { hidden: boolean; flag: LicenseFlag | null } {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}/.test(expiry)) return { hidden: false, flag: null }
  const exp = expiry.slice(0, 10)
  const day = deliveryDay(scheduleDate)
  if (exp < day) return { hidden: true, flag: { tone: 'red', text: 'License expired' } }
  const left = Math.round((Date.parse(`${exp}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS)
  if (left === 0) return { hidden: false, flag: { tone: 'red', text: 'License expires on the delivery day' } }
  if (left <= 31) return { hidden: false, flag: { tone: 'amber', text: `License expires in ${left} day${left === 1 ? '' : 's'}` } }
  return { hidden: false, flag: null }
}

const TONE = {
  red:   { color: '#f62626', background: 'rgba(246,38,38,0.12)', borderColor: 'rgba(246,38,38,0.35)' },
  amber: { color: '#ffea00', background: 'rgba(255,122,48,0.12)', borderColor: 'rgba(255,122,48,0.35)' },
} as const

function Flag({ flag }: { flag: LicenseFlag }) {
  return (
    <span className="inline-flex text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap" style={TONE[flag.tone]}>
      {flag.text}
    </span>
  )
}

export default function DriverPicker({
  options,
  value,
  onChange,
  scheduleDate,
  placeholder = 'Select driver',
  emptyLabel,
  disabled,
  loading,
  ariaLabel,
}: {
  options:      DriverPickerOption[]
  value:        string
  onChange:     (value: string) => void
  scheduleDate: string | null | undefined
  placeholder?: string
  /** Offered as the first choice (e.g. "No second driver"); omitted when not set. */
  emptyLabel?:  string
  disabled?:    boolean
  loading?:     boolean
  ariaLabel:    string
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    return options
      .map((o) => ({ ...o, license: licenseForDelivery(o.licenseExpiry, scheduleDate) }))
      // An expired license is hidden, except the driver already chosen.
      .filter((o) => !o.license.hidden || o.value === value)
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  }, [options, scheduleDate, value])

  const hiddenCount = useMemo(
    () => options.filter((o) => o.value !== value && licenseForDelivery(o.licenseExpiry, scheduleDate).hidden).length,
    [options, scheduleDate, value],
  )

  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter((o) => `${o.name} ${o.detail ?? ''}`.toLowerCase().includes(q))
    : rows

  const selected = rows.find((o) => o.value === value) ?? null

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className="w-full flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left text-base sm:text-sm text-white disabled:opacity-50"
      >
        <span className="flex-1 min-w-0">
          {loading ? (
            <span className="text-white/40">Loading drivers…</span>
          ) : selected ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate">{selected.name}</span>
              {selected.license.flag && <Flag flag={selected.license.flag} />}
            </span>
          ) : (
            <span className="text-white/40">{value === '' && emptyLabel ? emptyLabel : placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        // shadcn Command (the Combobox's list), kept inline under the button.
        <Command
          shouldFilter={false}
          className="mt-1.5 rounded-lg border border-white/10 bg-[#141414]"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }}
        >
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search by name or license"
            aria-label="Search drivers"
          />
          <CommandList aria-label={ariaLabel}>
            {emptyLabel && !q && (
              <Row value={EMPTY_ROW} selected={value === ''} onPick={() => pick('')}>
                <span className="text-white/60">{emptyLabel}</span>
              </Row>
            )}
            {shown.map((o) => (
              <Row key={o.value} value={o.value} selected={o.value === value} disabled={!!o.disabledNote} onPick={() => pick(o.value)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-white">{o.name}</span>
                  {(o.detail || o.disabledNote || o.warning) && (
                    <span className="block truncate text-[11px] text-white/40">
                      {[o.detail, o.warning, o.disabledNote].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {o.license.flag && <Flag flag={o.license.flag} />}
              </Row>
            ))}
            {shown.length === 0 && (
              <p className="px-3 py-3 text-xs text-white/40">
                {q ? `No driver matches "${query.trim()}".` : 'No drivers to choose from.'}
              </p>
            )}
          </CommandList>

          {hiddenCount > 0 && (
            <p className="border-t border-white/10 px-3 py-1.5 text-[10px] text-white/35 leading-snug">
              {hiddenCount} driver{hiddenCount === 1 ? '' : 's'} not shown: license expired by the delivery day.
            </p>
          )}
        </Command>
      )}
    </div>
  )
}

/** cmdk can't hold '' as an item value. */
const EMPTY_ROW = '__none__'

function Row({
  value, selected, disabled, onPick, children,
}: { value: string; selected: boolean; disabled?: boolean; onPick: () => void; children: React.ReactNode }) {
  return (
    <CommandItem
      value={value}
      disabled={disabled}
      onSelect={onPick}
      aria-selected={selected}
      className={`gap-2 rounded-md px-2 ${selected ? 'bg-[rgba(77,249,237,0.08)]' : ''}`}
    >
      <span className="w-4 shrink-0">{selected && <Check size={14} className="text-[var(--color-cyan)]" />}</span>
      {children}
    </CommandItem>
  )
}
