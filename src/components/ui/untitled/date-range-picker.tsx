'use client'

import { useContext, useMemo, useState, useSyncExternalStore } from 'react'
import {
  endOfMonth, endOfWeek, getDayOfWeek, getLocalTimeZone, isToday, parseDate,
  startOfMonth, startOfWeek, today, type CalendarDate,
} from '@internationalized/date'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from '@untitledui/icons'
import { useDateFormatter } from 'react-aria'
import {
  Button as AriaButton,
  CalendarCell as AriaCalendarCell,
  CalendarGrid as AriaCalendarGrid,
  CalendarGridBody as AriaCalendarGridBody,
  CalendarGridHeader as AriaCalendarGridHeader,
  CalendarHeaderCell as AriaCalendarHeaderCell,
  DateInput as AriaDateInput,
  DateRangePicker as AriaDateRangePicker,
  DateSegment as AriaDateSegment,
  Dialog as AriaDialog,
  Group as AriaGroup,
  Popover as AriaPopover,
  RangeCalendar as AriaRangeCalendar,
  RangeCalendarContext,
  RangeCalendarStateContext,
  useLocale,
  useSlottedContext,
  type DateValue,
} from 'react-aria-components'
import { cn } from '@/lib/utils'
import { Button } from './button'

/**
 * Untitled UI's DateRangePicker (components/application/date-picker:
 * date-range-picker, range-calendar, cell, and base/input/input-date), the
 * "Select dates" button of the "No users found" table. Built on react-aria as
 * theirs is; only the theme tokens are swapped for our palette:
 * bg-primary → #1b1b1b, bg-secondary → #2a2a2a, primary_hover → #262626,
 * border-secondary → #424242, brand-solid → #4df9ed (dark text on it),
 * text-secondary → #e5e5e5, text-quaternary / placeholder → #818181.
 *
 * One change from theirs: the range is a draft until Apply, so Cancel really
 * cancels, and a Clear button empties it. Values in and out are YYYY-MM-DD.
 */

export interface DateRange { from: string; to: string }

type RangeValue = { start: DateValue; end: DateValue }

// Untitled UI's useBreakpoint("md"): the server renders the desktop layout.
const MD = '(min-width: 768px)'
function useIsDesktop() {
  return useSyncExternalStore(
    (on) => { const m = window.matchMedia(MD); m.addEventListener('change', on); return () => m.removeEventListener('change', on) },
    () => window.matchMedia(MD).matches,
    () => true,
  )
}

const toRange   = (r: DateRange | null): RangeValue | null => (r ? { start: parseDate(r.from), end: parseDate(r.to) } : null)
const fromRange = (r: RangeValue | null): DateRange | null => (r ? { from: r.start.toString(), to: r.end.toString() } : null)

/* ── Calendar cell (cell.tsx) ─────────────────────────────────────────────── */

function CalendarCell({ date }: { date: CalendarDate }) {
  const { locale } = useLocale()
  const dayOfWeek = getDayOfWeek(date, locale)
  const range = useSlottedContext(RangeCalendarContext)
  const start = range?.value?.start
  const end   = range?.value?.end

  const isAfterStart = start ? date.compare(start) > 0 : true
  const isBeforeEnd  = end ? date.compare(end) < 0 : true
  const isInRange    = !!(start && end && date.compare(start) >= 0 && date.compare(end) <= 0)
  const isLastDay    = date.day === new Date(date.year, date.month, 0).getDate()
  const isFirstDay   = date.day === 1
  const isTodayDate  = isToday(date, getLocalTimeZone())

  return (
    <AriaCalendarCell
      date={date}
      className={({ isDisabled, isFocusVisible, isSelectionStart, isSelectionEnd, isSelected, isOutsideMonth }) => cn(
        'relative size-10 focus:outline-hidden',
        (isSelectionStart || dayOfWeek === 0) && 'rounded-l-full',
        (isSelectionEnd || dayOfWeek === 6) && 'rounded-r-full',
        isInRange && isDisabled && 'bg-[#2a2a2a]',
        isSelected && 'bg-[#2a2a2a]',
        isDisabled ? 'pointer-events-none' : 'cursor-pointer',
        isFocusVisible ? 'z-10' : 'z-0',
        isOutsideMonth && 'hidden',
        // The range fading off the edge of the month.
        isLastDay && isSelected && isBeforeEnd &&
          'after:absolute after:inset-0 after:translate-x-full after:bg-gradient-to-l after:from-transparent after:to-[#2a2a2a] in-[[role=gridcell]:last-child]:after:hidden',
        isFirstDay && isSelected && isAfterStart &&
          'after:absolute after:inset-0 after:-translate-x-full after:bg-gradient-to-r after:from-transparent after:to-[#2a2a2a] in-[[role=gridcell]:first-child]:after:hidden',
      )}
    >
      {({ isDisabled, isFocusVisible, isSelectionStart, isSelectionEnd, isSelected, formattedDate }) => {
        const marked = isSelectionStart || isSelectionEnd
        return (
          <div className={cn(
            'relative flex size-full items-center justify-center rounded-full text-sm text-[#e5e5e5]',
            isDisabled && 'text-[#e5e5e5]/50',
            isFocusVisible && 'outline-2 outline-offset-2 outline-[#4df9ed]',
            isSelected && !isDisabled && 'font-medium',
            marked && 'bg-[#4df9ed] font-medium text-[#0a0a0a]',
            !isSelected && !isDisabled && '[@media(hover:hover)]:hover:bg-[#262626] [@media(hover:hover)]:hover:font-medium',
            !isSelected && isTodayDate && 'bg-[#262626] font-medium',
          )}>
            {formattedDate}
            {isTodayDate && (
              <div className={cn('absolute bottom-1 left-1/2 size-1.25 -translate-x-1/2 rounded-full', marked ? 'bg-[#0a0a0a]' : 'bg-[#4df9ed]')} />
            )}
          </div>
        )
      }}
    </AriaCalendarCell>
  )
}

/* ── Range calendar (range-calendar.tsx) ──────────────────────────────────── */

function MonthTitle({ part }: { part: 'start' | 'end' }) {
  const state = useContext(RangeCalendarStateContext)
  const fmt = useDateFormatter({ month: 'long', year: 'numeric', timeZone: state?.timeZone })
  if (!state) return null
  return <>{fmt.format((part === 'start' ? state.visibleRange.start : state.visibleRange.end).toDate(state.timeZone))}</>
}

const NAV_BTN =
  'flex size-8 cursor-pointer items-center justify-center rounded-lg text-[#818181] outline-[#4df9ed] transition ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 [@media(hover:hover)]:hover:bg-[#262626] [@media(hover:hover)]:hover:text-[#c4c4c4]'

function MonthGrid({ offset }: { offset?: { months: number } }) {
  return (
    <AriaCalendarGrid weekdayStyle="short" offset={offset} className="w-max">
      <AriaCalendarGridHeader>
        {(day) => (
          <AriaCalendarHeaderCell className="border-b-4 border-transparent p-0">
            <div className="flex size-10 items-center justify-center text-sm font-medium text-[#e5e5e5]">{day.slice(0, 2)}</div>
          </AriaCalendarHeaderCell>
        )}
      </AriaCalendarGridHeader>
      <AriaCalendarGridBody className="[&_td]:p-0 [&_tr]:border-b-4 [&_tr]:border-transparent [&_tr:last-of-type]:border-none">
        {(date) => <CalendarCell date={date} />}
      </AriaCalendarGridBody>
    </AriaCalendarGrid>
  )
}

/** Untitled UI's InputDateBase, size sm: typed day/month/year segments. */
function DateField({ slot, className }: { slot: 'start' | 'end'; className?: string }) {
  return (
    <AriaGroup className={cn(
      'relative flex w-full rounded-lg bg-[#1b1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-[#424242] transition-shadow ring-inset focus-within:ring-2 focus-within:ring-[#4df9ed]',
      className,
    )}>
      <AriaDateInput slot={slot} className="flex w-full px-3 py-2 text-sm">
        {(segment) => (
          <AriaDateSegment
            segment={segment}
            className={cn(
              'rounded px-0.5 text-white tabular-nums caret-transparent focus:bg-[#4df9ed] focus:font-medium focus:text-[#0a0a0a] focus:outline-hidden',
              segment.isPlaceholder && 'uppercase text-[#818181]',
              segment.type === 'literal' && 'text-[#818181]',
            )}
          />
        )}
      </AriaDateInput>
    </AriaGroup>
  )
}

function RangeCalendar({ focusedValue, onFocusChange, presets }: {
  focusedValue: DateValue | null
  onFocusChange: (d: DateValue) => void
  presets: Record<string, { label: string; value: RangeValue }>
}) {
  const desktop = useIsDesktop()
  const months = desktop ? 2 : 1

  return (
    <AriaRangeCalendar
      className="flex"
      visibleDuration={{ months }}
      focusedValue={focusedValue ?? undefined}
      onFocusChange={onFocusChange}
    >
      <div className="flex flex-col gap-3 px-4 py-5 md:gap-2 md:px-6">
        <header className={cn('relative flex items-center', months > 1 ? 'justify-start' : 'justify-between')}>
          <AriaButton slot="previous" aria-label="Previous month" className={NAV_BTN}><ChevronLeft className="size-5" /></AriaButton>
          <h2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-semibold text-[#e5e5e5]">
            <MonthTitle part="start" />
          </h2>
          {months === 1 && <AriaButton slot="next" aria-label="Next month" className={NAV_BTN}><ChevronRight className="size-5" /></AriaButton>}
        </header>

        {!desktop && (
          <>
            <div className="flex items-center gap-2">
              <DateField slot="start" className="flex-1" />
              <div className="text-base text-[#818181]">–</div>
              <DateField slot="end" className="flex-1" />
            </div>
            <MobilePresets presets={presets} />
          </>
        )}

        <MonthGrid />
      </div>

      {months > 1 && (
        <div className="flex flex-col gap-3 border-l border-[#424242] px-6 py-5">
          <header className="relative flex items-center justify-end">
            <h2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-semibold text-[#e5e5e5]">
              <MonthTitle part="end" />
            </h2>
            <AriaButton slot="next" aria-label="Next month" className={NAV_BTN}><ChevronRight className="size-5" /></AriaButton>
          </header>
          <MonthGrid offset={{ months: 1 }} />
        </div>
      )}
    </AriaRangeCalendar>
  )
}

/** Phones: Last week · Last month · Last year as links above the grid. */
function MobilePresets({ presets }: { presets: Record<string, { label: string; value: RangeValue }> }) {
  return (
    <div className="mt-1 flex justify-between gap-3 px-2">
      {(['lastWeek', 'lastMonth', 'lastYear'] as const).map((k) => <MobilePreset key={k} preset={presets[k]} />)}
    </div>
  )
}

function MobilePreset({ preset }: { preset: { label: string; value: RangeValue } }) {
  const state = useContext(RangeCalendarStateContext)
  return (
    <button
      type="button"
      onClick={() => { state?.setValue(preset.value); state?.setFocusedDate(preset.value.start as CalendarDate) }}
      className="text-sm font-semibold text-[#4df9ed] [@media(hover:hover)]:hover:text-[#7bfbf5]"
    >
      {preset.label}
    </button>
  )
}

/** The presets column on desktop (RangePresetButton). */
function PresetButton({ value, onPick, children }: { value: RangeValue; onPick: () => void; children: string }) {
  const range = useSlottedContext(RangeCalendarContext)
  const selected = range?.value?.start?.compare(value.start) === 0 && range?.value?.end?.compare(value.end) === 0
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'cursor-pointer rounded-md px-3 py-2 text-left text-sm font-medium outline-[#4df9ed] transition focus-visible:outline-2 focus-visible:outline-offset-2',
        selected ? 'bg-[#2a2a2a] text-white' : 'text-[#e5e5e5] [@media(hover:hover)]:hover:bg-[#262626] [@media(hover:hover)]:hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

/* ── The picker (date-range-picker.tsx) ───────────────────────────────────── */

export function DateRangePicker({ value, onChange, label, className, untitled = false }: {
  value: DateRange | null
  onChange: (range: DateRange | null) => void
  label?: string
  className?: string
  /** The earlier Untitled UI trigger ("Select dates"), for the screens kept as they were. */
  untitled?: boolean
}) {
  const { locale } = useLocale()
  const fmt = useDateFormatter({ month: 'short', day: 'numeric', year: 'numeric' })
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<RangeValue | null>(null)
  const [focusedValue, setFocusedValue] = useState<DateValue | null>(null)

  const presets = useMemo(() => {
    const now = today(getLocalTimeZone())
    return {
      today:     { label: 'Today',      value: { start: now, end: now } },
      yesterday: { label: 'Yesterday',  value: { start: now.subtract({ days: 1 }), end: now.subtract({ days: 1 }) } },
      thisWeek:  { label: 'This week',  value: { start: startOfWeek(now, locale), end: endOfWeek(now, locale) } },
      lastWeek:  { label: 'Last week',  value: { start: startOfWeek(now, locale).subtract({ weeks: 1 }), end: endOfWeek(now, locale).subtract({ weeks: 1 }) } },
      thisMonth: { label: 'This month', value: { start: startOfMonth(now), end: endOfMonth(now) } },
      lastMonth: { label: 'Last month', value: { start: startOfMonth(now).subtract({ months: 1 }), end: endOfMonth(now).subtract({ months: 1 }) } },
      thisYear:  { label: 'This year',  value: { start: startOfMonth(now.set({ month: 1 })), end: endOfMonth(now.set({ month: 12 })) } },
      lastYear:  { label: 'Last year',  value: { start: startOfMonth(now.set({ month: 1 }).subtract({ years: 1 })), end: endOfMonth(now.set({ month: 12 }).subtract({ years: 1 })) } },
      allTime:   { label: 'All time',   value: { start: now.set({ year: 2000, month: 1, day: 1 }), end: now } },
    }
  }, [locale])

  const shown = toRange(value)
  const text = shown
    ? `${fmt.format(shown.start.toDate(getLocalTimeZone()))} – ${fmt.format(shown.end.toDate(getLocalTimeZone()))}`
    : null

  const openChange = (next: boolean) => {
    // Every opening starts from what is applied.
    if (next) { setDraft(shown); setFocusedValue(shown?.start ?? null) }
    setOpen(next)
  }

  return (
    <AriaDateRangePicker
      aria-label={label}
      shouldCloseOnSelect={false}
      value={draft}
      onChange={(v) => setDraft(v as RangeValue | null)}
      isOpen={open}
      onOpenChange={openChange}
      className={className}
    >
      <AriaGroup className="max-md:w-full">
        {untitled ? (
        <AriaButton className={cn(
          'relative inline-flex max-md:w-full max-md:justify-start cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold outline-[#4df9ed] transition focus-visible:outline-2 focus-visible:outline-offset-2',
          'shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(0,0,0,0.18),inset_0_-2px_0_rgba(0,0,0,0.25)] ring-1 ring-inset',
          value ? 'bg-[#4df9ed]/[0.12] text-[#4df9ed] ring-[#4df9ed]' : 'bg-[#1b1b1b] text-[#e5e5e5] ring-[#424242] [@media(hover:hover)]:hover:bg-[#262626]',
        )}>
          <CalendarIcon className={cn('size-5 shrink-0', value ? 'text-[#4df9ed]' : 'text-[#818181]')} />
          <span className="px-0.5">{text ?? <span className="text-[#818181]">{label ?? 'Select dates'}</span>}</span>
        </AriaButton>
        ) : (
        // The table format's grey "Select Date" block (Figma 3234:594).
        <AriaButton className={cn(
          'ff-sc relative inline-flex h-[38px] 3xl:h-[44px] max-md:w-full max-md:justify-start cursor-pointer items-center justify-center gap-1.5 3xl:gap-2 whitespace-nowrap rounded-[10px] border px-3 3xl:px-3.5 text-[15px] 3xl:text-[18px] outline-[#4df9ed] transition focus-visible:outline-2 focus-visible:outline-offset-2',
          value ? 'border-[#4df9ed] bg-[#4df9ed]/[0.12] text-[#4df9ed]' : 'border-[#343434] bg-[#2a2828] text-white [@media(hover:hover)]:hover:bg-[#343232]',
        )}>
          <CalendarIcon className={cn('size-5 3xl:size-[22px] shrink-0', value ? 'text-[#4df9ed]' : 'text-white')} />
          <span className="px-0.5">{text ?? label ?? 'Select Date'}</span>
        </AriaButton>
        )}
      </AriaGroup>
      <AriaPopover
        placement="bottom right"
        offset={8}
        className={({ isEntering, isExiting }) => cn(
          'origin-(--trigger-anchor-point) will-change-transform',
          isEntering && 'duration-150 ease-out animate-in fade-in placement-bottom:slide-in-from-top-0.5 placement-top:slide-in-from-bottom-0.5',
          isExiting && 'duration-100 ease-in animate-out fade-out placement-bottom:slide-out-to-top-0.5 placement-top:slide-out-to-bottom-0.5',
        )}
      >
        <AriaDialog aria-label={label} className="ff-regular flex max-h-[85dvh] overflow-y-auto rounded-2xl bg-[#1b1b1b] text-white shadow-[0_20px_40px_rgba(0,0,0,0.6)] ring-1 ring-[#424242] focus:outline-hidden">
          {({ close }) => (
            <>
              <div className="hidden w-38 flex-col gap-0.5 border-r border-[#424242] p-3 lg:flex">
                {Object.values(presets).map((p) => (
                  <PresetButton key={p.label} value={p.value} onPick={() => { setDraft(p.value); setFocusedValue(p.value.start) }}>
                    {p.label}
                  </PresetButton>
                ))}
              </div>
              <div className="flex flex-col">
                <RangeCalendar focusedValue={focusedValue} onFocusChange={setFocusedValue} presets={presets} />
                <div className="flex justify-between gap-3 border-t border-[#424242] p-4">
                  <div className="hidden items-center gap-2 md:flex">
                    <DateField slot="start" />
                    <div className="text-base text-[#818181]">–</div>
                    <DateField slot="end" />
                  </div>
                  <div className="grid w-full grid-cols-3 gap-3 md:flex md:w-auto">
                    <Button color="secondary" disabled={!draft && !value} onClick={() => { onChange(null); close() }}>Clear</Button>
                    <Button color="secondary" onClick={() => close()}>Cancel</Button>
                    <Button color="primary" onClick={() => { onChange(fromRange(draft)); close() }}>Apply</Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </AriaDialog>
      </AriaPopover>
    </AriaDateRangePicker>
  )
}

