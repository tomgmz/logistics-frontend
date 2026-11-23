'use client'

import { useLayoutEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * The calendar inside every web date field: the shared DatePicker and the client
 * booking form's own date box (2026-11-23).
 *
 * Three views, as Material / MUI date pickers do it: days → click the month name
 * for the months, click the year for a grid of years. Picking a year opens its
 * months, picking a month opens its days. The chevrons move by month (days), by
 * year (months) or by 12 years (years). Nothing outside min/max can be picked.
 *
 * Dates are "YYYY-MM-DD" strings, compared as strings.
 */

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const CYAN = '#4DF9ED'
const YEARS_PER_PAGE = 12

export function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseDateStr(s: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!s) return null
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m: m - 1, d }
}

export function formatDisplayDate(s: string) {
  const p = parseDateStr(s)
  if (!p) return ''
  return new Date(p.y, p.m, p.d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`

type View = 'days' | 'months' | 'years'

export interface CalendarPanelProps {
  value: string
  /** Today, "YYYY-MM-DD" (Manila day from the server clock). */
  today: string
  min?: string
  max?: string
  /** First month shown; defaults to the value's, else today's, kept inside min/max. */
  start?: string
  onPick: (value: string) => void
  /** Row under the calendar (Today / Clear / Next available). */
  footer?: ReactNode
  /** Called after the panel changes size (view or month change), to re-place a popup. */
  onLayoutChange?: () => void
}

export default function CalendarPanel({ value, today, min, max, start, onPick, footer, onLayoutChange }: CalendarPanelProps) {
  const minP = parseDateStr(min)
  const maxP = parseDateStr(max)

  const [init] = useState(() => {
    let s = parseDateStr(start ?? value) ?? parseDateStr(today)!
    if (minP && toDateStr(s.y, s.m, s.d) < min!) s = minP
    if (maxP && toDateStr(s.y, s.m, s.d) > max!) s = maxP
    return s
  })
  const [view, setView] = useState<View>('days')
  const [viewYear, setViewYear] = useState(init.y)
  const [viewMonth, setViewMonth] = useState(init.m)
  // First year on the years page; the picked/shown year sits in the second row.
  const [pageStart, setPageStart] = useState(init.y - 4)

  useLayoutEffect(() => { onLayoutChange?.() }, [view, viewYear, viewMonth, pageStart, onLayoutChange])

  const outside = (s: string) => (!!min && s < min) || (!!max && s > max)
  const monthOutside = (y: number, m: number) =>
    (!!minP && monthKey(y, m) < monthKey(minP.y, minP.m)) ||
    (!!maxP && monthKey(y, m) > monthKey(maxP.y, maxP.m))
  const yearOutside = (y: number) => (!!minP && y < minP.y) || (!!maxP && y > maxP.y)

  const openYears = () => { setPageStart(viewYear - 4); setView('years') }

  const prev = () => {
    if (view === 'days') {
      if (viewMonth === 0) { setViewMonth(11); setViewYear((v) => v - 1) } else setViewMonth((v) => v - 1)
    } else if (view === 'months') setViewYear((v) => v - 1)
    else setPageStart((p) => p - YEARS_PER_PAGE)
  }
  const next = () => {
    if (view === 'days') {
      if (viewMonth === 11) { setViewMonth(0); setViewYear((v) => v + 1) } else setViewMonth((v) => v + 1)
    } else if (view === 'months') setViewYear((v) => v + 1)
    else setPageStart((p) => p + YEARS_PER_PAGE)
  }
  const atFirst =
    view === 'days'   ? monthOutside(viewMonth === 0 ? viewYear - 1 : viewYear, viewMonth === 0 ? 11 : viewMonth - 1)
    : view === 'months' ? yearOutside(viewYear - 1)
    : !!minP && pageStart - 1 < minP.y
  const atLast =
    view === 'days'   ? monthOutside(viewMonth === 11 ? viewYear + 1 : viewYear, viewMonth === 11 ? 0 : viewMonth + 1)
    : view === 'months' ? yearOutside(viewYear + 1)
    : !!maxP && pageStart + YEARS_PER_PAGE > maxP.y

  const unit = view === 'days' ? 'month' : view === 'months' ? 'year' : '12 years'

  const first = new Date(viewYear, viewMonth, 1).getDay()
  const total = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayP = parseDateStr(today)!
  const valueP = parseDateStr(value)

  const navBtn = 'p-1 rounded text-white/60 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ' +
    '[@media(hover:hover)]:hover:bg-white/10 [@media(hover:hover)]:hover:text-white'
  const titleBtn = 'ff-sc text-xs font-bold text-white tracking-wider rounded px-1.5 py-0.5 cursor-pointer transition-colors ' +
    '[@media(hover:hover)]:hover:bg-white/10'
  const cell = (selected: boolean, current: boolean, off: boolean) => ({
    background: selected ? CYAN : current ? 'rgba(77,249,237,0.12)' : 'transparent',
    color: off ? 'rgba(255,255,255,0.15)' : selected ? '#000' : current ? CYAN : '#fff',
    cursor: off ? 'not-allowed' : 'pointer',
    fontWeight: selected || current ? 700 : 400,
  })

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prev} disabled={atFirst} aria-label={`Previous ${unit}`} className={navBtn}>
          <ChevronLeft size={15} />
        </button>
        <div className="flex items-center">
          {view === 'days' && (
            <button type="button" onClick={() => setView('months')} aria-label="Choose month" className={titleBtn}>
              {MONTHS[viewMonth]}
            </button>
          )}
          {view === 'years' ? (
            <button type="button" onClick={() => setView('days')} aria-label="Back to days" className={titleBtn}>
              {pageStart} – {pageStart + YEARS_PER_PAGE - 1}
            </button>
          ) : (
            <button type="button" onClick={openYears} aria-label="Choose year" className={titleBtn}>
              {viewYear}
            </button>
          )}
        </div>
        <button type="button" onClick={next} disabled={atLast} aria-label={`Next ${unit}`} className={navBtn}>
          <ChevronRight size={15} />
        </button>
      </div>

      {view === 'days' && (
        <>
          <div className="grid grid-cols-7 mb-1">
            {DOW.map((d) => (
              <div key={d} className="text-center ff-sc text-[10px] py-0.5 text-white/30">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: first }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: total }, (_, i) => i + 1).map((d) => {
              const str = toDateStr(viewYear, viewMonth, d)
              const off = outside(str)
              return (
                <button
                  key={d}
                  type="button"
                  disabled={off}
                  onClick={() => onPick(str)}
                  aria-label={formatDisplayDate(str)}
                  aria-pressed={str === value}
                  className="h-8 w-full flex items-center justify-center rounded-md text-xs ff-sc transition-all"
                  style={cell(str === value, viewYear === todayP.y && viewMonth === todayP.m && d === todayP.d, off)}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </>
      )}

      {view === 'months' && (
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS_SHORT.map((label, m) => {
            const off = monthOutside(viewYear, m)
            return (
              <button
                key={label}
                type="button"
                disabled={off}
                onClick={() => { setViewMonth(m); setView('days') }}
                aria-label={`${MONTHS[m]} ${viewYear}`}
                className="h-9 rounded-md text-xs ff-sc transition-all"
                style={cell(viewYear === valueP?.y && m === valueP?.m, m === viewMonth, off)}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {view === 'years' && (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: YEARS_PER_PAGE }, (_, i) => pageStart + i).map((y) => {
            const off = yearOutside(y)
            return (
              <button
                key={y}
                type="button"
                disabled={off}
                onClick={() => {
                  setViewYear(y)
                  // Keep the month if it exists in that year's range, else the nearest allowed one.
                  if (monthOutside(y, viewMonth)) setViewMonth(minP && y === minP.y ? minP.m : maxP && y === maxP.y ? maxP.m : viewMonth)
                  setView('months')
                }}
                className="h-9 rounded-md text-xs ff-sc transition-all"
                style={cell(y === valueP?.y, y === viewYear, off)}
              >
                {y}
              </button>
            )
          })}
        </div>
      )}

      {footer && <div className="mt-3 pt-2 border-t border-white/[0.07] flex justify-center gap-6">{footer}</div>}
    </>
  )
}
