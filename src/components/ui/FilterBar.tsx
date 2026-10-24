'use client'

import { useState, type ReactNode } from 'react'
import { Search, ListFilter, Plus, X, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * The one filter bar, after Untitled UI's filter bars
 * (untitledui.com/react/components/filter-bars), drawn in our palette:
 *
 *   [leading] [search…………] [Filters (n)] [actions]            [summary]
 *
 * `leading` holds a view switch (a role dropdown, tabs), `actions` the page's
 * own buttons (Refresh). The Filters button opens Untitled UI's advanced
 * filter panel: one row per rule, [field] [Is / Is not] [value] [×], then
 * Add filter · Clear all · Apply filter. Nothing changes until Apply. No chips
 * under the bar (the user's call): the count on the button says the list is
 * narrowed.
 *
 * It owns no data: the page keeps the rules and decides what they filter.
 */

export interface FilterOption { value: string; label: string }

export interface FilterField {
  key:     string
  label:   string
  options: FilterOption[]
  /** One value at a time (date windows and the like): no "Is not". */
  single?: boolean
}

export type FilterOp = 'is' | 'is_not'

export interface FilterRule { field: string; op: FilterOp; value: string }

/** The applied rules. Rules on one field: any "is" matches, every "is not" must hold. */
export type FilterValues = FilterRule[]

function split(rules: FilterValues, field: string) {
  const is: string[] = [], not: string[] = []
  for (const r of rules) if (r.field === field) (r.op === 'is' ? is : not).push(r.value)
  return { is, not }
}

/** True when the rules on `field` let `value` through. */
export function matchesFilter(rules: FilterValues, field: string, value: string | null | undefined): boolean {
  const { is, not } = split(rules, field)
  if (is.length && (value == null || !is.includes(value))) return false
  return value == null || !not.includes(value)
}

/**
 * The values `field` is narrowed to, for a server that only takes a list
 * ("active,deactivated"). Null when nothing narrows it. "Is not" rules are
 * taken out of `universe`, the values the list holds when unfiltered.
 */
export function allowedValues(rules: FilterValues, field: string, universe: string[]): string[] | null {
  const { is, not } = split(rules, field)
  if (!is.length && !not.length) return null
  return (is.length ? is : universe).filter((v) => !not.includes(v))
}

/** Distinct, sorted options from the rows on screen (companies, vendors…). */
export function optionsFrom(values: (string | null | undefined)[], label: (v: string) => string = (v) => v): FilterOption[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim() !== ''))]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: label(v) }))
}

const CONTROL_H = 'h-[34px] 3xl:h-[38px]'
// 16px on phones: iOS Safari zooms the page into any smaller focused field.
const CONTROL_TEXT = 'max-sm:text-[16px] text-[13px] 3xl:text-[15px]'

export default function FilterBar({
  search,
  fields = [],
  values = [],
  onChange,
  leading,
  actions,
  summary,
  className = '',
}: {
  search?: {
    value:        string
    onChange:     (value: string) => void
    placeholder?: string
  }
  fields?:   FilterField[]
  values?:   FilterValues
  onChange?: (values: FilterValues) => void
  leading?:  ReactNode
  actions?:  ReactNode
  summary?:  ReactNode
  className?: string
}) {
  // A field with nothing to pick (no companies loaded yet) is left out.
  const shown = fields.filter((f) => f.options.length > 0)

  return (
    <div className={`border-b border-[#424242] px-3 sm:px-4 3xl:px-5 py-2 3xl:py-2.5 shrink-0 ${className}`}>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 3xl:gap-4">
        {leading}

        {search && (
          <div className="relative min-w-0 flex-1 basis-[180px] sm:max-w-[360px] 3xl:max-w-[400px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 3xl:size-[18px] -translate-y-1/2 text-[#818181]" />
            <input
              type="search"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? 'Search'}
              aria-label={search.placeholder ?? 'Search'}
              className={`${CONTROL_H} ${CONTROL_TEXT} w-full rounded-[10px] border border-[#818181] bg-[#424242] pl-9 3xl:pl-10 pr-4 text-white placeholder-[#818181] outline-none transition focus:border-[#4df9ed] [&::-webkit-search-cancel-button]:hidden`}
            />
          </div>
        )}

        {shown.length > 0 && onChange && (
          <FiltersButton fields={shown} values={values} onApply={onChange} />
        )}

        {actions}

        {summary && (
          <span className="basis-full text-right sm:basis-auto sm:ml-auto text-[10px] 3xl:text-[11px] font-bold whitespace-nowrap">
            {summary}
          </span>
        )}
      </div>
    </div>
  )
}

/** A row being edited: any part may still be blank. */
interface DraftRule { id: number; field: string; op: FilterOp; value: string }

let nextId = 1
const blankRow = (): DraftRule => ({ id: nextId++, field: '', op: 'is', value: '' })

const SELECT =
  'h-9 w-full min-w-0 appearance-none rounded-[10px] border border-[#818181] bg-[#424242] pl-3 pr-8 ' +
  'max-sm:text-[16px] text-[13px] outline-none transition [color-scheme:dark] ' +
  'focus:border-[#4df9ed] disabled:cursor-not-allowed disabled:opacity-50'

/** A native select (the phone's own picker on iOS and Android) in our look. */
function RuleSelect({ value, onChange, placeholder, options, disabled, label }: {
  value:        string
  onChange:     (value: string) => void
  placeholder?: string
  options:      FilterOption[]
  disabled?:    boolean
  label:        string
}) {
  return (
    <div className="relative min-w-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        className={`${SELECT} ${value ? 'text-white' : 'text-[#818181]'}`}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value} className="bg-[#1b1b1b] text-white">{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[#818181]" />
    </div>
  )
}

const OPS: FilterOption[] = [
  { value: 'is',     label: 'Is' },
  { value: 'is_not', label: 'Is not' },
]

/** The Filters button and its rule panel. Edits a draft; Apply filter hands it over. */
function FiltersButton({ fields, values, onApply }: {
  fields:  FilterField[]
  values:  FilterValues
  onApply: (values: FilterValues) => void
}) {
  const [open,  setOpen]  = useState(false)
  const [draft, setDraft] = useState<DraftRule[]>([])

  // Rules on a field no longer offered (switched tab, list reloaded) don't count.
  const applied = values.filter((r) => fields.some((f) => f.key === r.field)).length

  const openChange = (next: boolean) => {
    // Every opening starts from what is applied, plus a blank row when nothing is.
    if (next) setDraft(values.length ? values.map((r) => ({ ...r, id: nextId++ })) : [blankRow()])
    setOpen(next)
  }

  const patch = (id: number, change: Partial<DraftRule>) =>
    setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...change } : r)))

  const remove = (id: number) =>
    setDraft((d) => {
      const rest = d.filter((r) => r.id !== id)
      return rest.length ? rest : [blankRow()]
    })

  const apply = () => {
    // Half-filled rows are dropped rather than refused.
    onApply(draft.filter((r) => r.field && r.value).map(({ field, op, value }) => ({ field, op, value })))
    setOpen(false)
  }

  const clearAll = () => {
    onApply([])
    setOpen(false)
  }

  const fieldOptions = fields.map((f) => ({ value: f.key, label: f.label }))

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={applied ? `Filters, ${applied} applied` : 'Filters'}
          className={`${CONTROL_H} ${CONTROL_TEXT} flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 transition ${
            applied || open
              ? 'border-[#4df9ed] bg-[#4df9ed]/[0.12] text-[#4df9ed]'
              : 'border-[#818181] bg-[#424242] text-[#818181] hover:text-white'
          }`}
        >
          <ListFilter className="size-4" />
          Filters
          {applied > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#4df9ed] px-1 text-[11px] font-bold leading-none text-black">
              {applied}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={16}
        className="ff-regular w-[min(640px,calc(100vw-32px))] gap-0 rounded-xl border border-[#424242] bg-[#1b1b1b] p-0 text-white shadow-[0_20px_40px_rgba(0,0,0,0.6)] ring-0"
      >
        <div className="flex max-h-[min(55dvh,var(--radix-popover-content-available-height))] flex-col gap-3 overflow-y-auto overscroll-contain p-4 max-sm:gap-4">
          {draft.map((r) => {
            const field = fields.find((f) => f.key === r.field)
            return (
              // Phones: field and × on one line, condition and value under it.
              // Wider: all four on one line, as Untitled UI draws it.
              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1.3fr)_auto]">
                <RuleSelect
                  label="Filter"
                  placeholder="Select filter"
                  value={r.field}
                  options={fieldOptions}
                  // A new field means the old value and condition no longer apply.
                  onChange={(v) => patch(r.id, { field: v, value: '', op: 'is' })}
                />
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label="Remove this filter"
                  className="flex size-9 items-center justify-center rounded-lg text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white sm:order-last"
                >
                  <X className="size-4" />
                </button>
                <div className="col-span-2 grid grid-cols-[110px_minmax(0,1fr)] gap-2 sm:contents">
                  <RuleSelect
                    label="Condition"
                    value={r.op}
                    options={field?.single ? OPS.slice(0, 1) : OPS}
                    disabled={!field || field.single}
                    onChange={(v) => patch(r.id, { op: v as FilterOp })}
                  />
                  <RuleSelect
                    label="Value"
                    placeholder={field ? 'Select a value' : 'Pick a filter first'}
                    value={r.value}
                    options={field?.options ?? []}
                    disabled={!field}
                    onChange={(v) => patch(r.id, { value: v })}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[#424242] px-4 py-3">
          <button
            type="button"
            onClick={() => setDraft((d) => [...d, blankRow()])}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border border-[#818181] px-3 text-[13px] font-bold text-[#818181] transition hover:text-white"
          >
            <Plus className="size-4" /> Add filter
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={clearAll}
              className="h-9 rounded-[10px] border border-[#818181] px-3 text-[13px] font-bold text-[#818181] transition hover:text-white"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={apply}
              className="h-9 rounded-[10px] bg-[#4df9ed] px-3.5 text-[13px] font-bold text-black transition hover:bg-[#7bfbf5]"
            >
              Apply filter
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
