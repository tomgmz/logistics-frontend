'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { nowDate } from '@/app/utils/serverTime'
import { phDay } from '@/lib/ph-date'

/**
 * The client booking form's calendar, for every other date field on the web
 * (replaces <input type="date">, whose look and behaviour differ per browser
 * and which iOS Safari shows as a bare wheel).
 *
 * Value is "YYYY-MM-DD" or "" — the same string a native date input gives, so
 * a call site only swaps the element. Days outside min/max cannot be picked.
 * The calendar is portalled to <body> with fixed position, so a scrolling
 * modal or side panel never clips it; it flips above the field when there is
 * no room below. Clicking the month title jumps by month and year (licence and
 * registration dates are years ahead).
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const CYAN = '#4DF9ED'
const POPUP_W = 260
const GAP = 6
const EDGE = 8

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseDateStr(s: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!s) return null
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m: m - 1, d }
}

function formatDisplayDate(s: string) {
  const p = parseDateStr(s)
  if (!p) return ''
  return new Date(p.y, p.m, p.d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "YYYY-MM" of a day string, for comparing whole months. */
const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`

export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  disabled?: boolean
  readOnly?: boolean
  /** Red edge, as an invalid field. */
  invalid?: boolean
  placeholder?: string
  /** Shows a Clear button in the calendar (optional fields). */
  clearable?: boolean
  /** Classes of the closed box, so it matches the form's other fields. */
  className?: string
  id?: string
  title?: string
  'aria-label'?: string
}

export default function DatePicker({
  value, onChange, min, max, disabled, readOnly, invalid,
  placeholder = 'Select date', clearable, className, id, title,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [openState, setOpen] = useState(false)
  // A field that becomes disabled/read-only while open closes its calendar.
  const open = openState && !disabled && !readOnly
  const [view, setView] = useState<'days' | 'months'>('days')
  const [viewYear, setViewYear] = useState(0)
  const [viewMonth, setViewMonth] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const today = phDay(nowDate())
  const minP = parseDateStr(min)
  const maxP = parseDateStr(max)

  const openPicker = () => {
    if (disabled || readOnly) return
    // Start on the chosen day's month, else today's, kept inside min/max.
    let start = parseDateStr(value) ?? parseDateStr(today)!
    if (minP && toDateStr(start.y, start.m, start.d) < min!) start = minP
    if (maxP && toDateStr(start.y, start.m, start.d) > max!) start = maxP
    setViewYear(start.y)
    setViewMonth(start.m)
    setView('days')
    setPos(null)
    setOpen(true)
  }

  const close = useCallback((refocus = false) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])

  // Place under the field (or above when there is no room), inside the screen.
  const place = useCallback(() => {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    const h = popupRef.current?.offsetHeight ?? 330
    const vw = window.innerWidth
    const vh = window.innerHeight
    const below = r.bottom + GAP
    const top = below + h > vh - EDGE && r.top - GAP - h >= EDGE ? r.top - GAP - h : below
    const left = Math.max(EDGE, Math.min(r.left, vw - POPUP_W - EDGE))
    setPos({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, view, viewYear, viewMonth, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node
      if (triggerRef.current?.contains(n) || popupRef.current?.contains(n)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(true) } }
    const onMove = () => place()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, close, place])


  const outside = (s: string) => (!!min && s < min) || (!!max && s > max)
  const monthOutside = (y: number, m: number) =>
    (!!minP && monthKey(y, m) < monthKey(minP.y, minP.m)) ||
    (!!maxP && monthKey(y, m) > monthKey(maxP.y, maxP.m))

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((v) => v - 1) } else setViewMonth((v) => v - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((v) => v + 1) } else setViewMonth((v) => v + 1)
  }
  const atFirst = view === 'days'
    ? monthOutside(viewMonth === 0 ? viewYear - 1 : viewYear, viewMonth === 0 ? 11 : viewMonth - 1)
    : !!minP && viewYear - 1 < minP.y
  const atLast = view === 'days'
    ? monthOutside(viewMonth === 11 ? viewYear + 1 : viewYear, viewMonth === 11 ? 0 : viewMonth + 1)
    : !!maxP && viewYear + 1 > maxP.y

  const pick = (s: string) => { onChange(s); close(true) }

  const first = new Date(viewYear, viewMonth, 1).getDay()
  const total = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayP = parseDateStr(today)!
  const valueP = parseDateStr(value)

  const navBtn = 'p-1 rounded text-white/60 transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ' +
    '[@media(hover:hover)]:hover:bg-white/10 [@media(hover:hover)]:hover:text-white'

  const box = className ??
    'h-9 w-full rounded-[10px] border border-[#818181] bg-[#2A2828] px-3 text-sm text-white outline-none focus-visible:border-[#4DF9ED66]'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : openPicker())}
        className={`${box} flex items-center gap-2 text-left ${readOnly ? 'cursor-default' : 'cursor-pointer'} disabled:cursor-not-allowed disabled:opacity-50 ${invalid ? 'border-red-500/60!' : ''} ${open ? 'border-[#4DF9ED66]!' : ''}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/booking-form/date.svg" alt="" width={16} height={16} className="shrink-0" draggable={false} />
        <span className={`flex-1 min-w-0 truncate ${value ? 'text-white' : 'text-white/30'}`}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popupRef}
              role="dialog"
              aria-label={ariaLabel ?? 'Choose a date'}
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[1000] rounded-xl shadow-2xl p-4"
              style={{
                width: POPUP_W,
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                visibility: pos ? 'visible' : 'hidden',
                background: '#1E1C1C',
                border: '1px solid #818181',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={view === 'days' ? prevMonth : () => setViewYear((v) => v - 1)}
                  disabled={atFirst} aria-label={view === 'days' ? 'Previous month' : 'Previous year'} className={navBtn}>
                  <ChevronLeft size={15} />
                </button>
                <button type="button" onClick={() => setView((v) => (v === 'days' ? 'months' : 'days'))}
                  aria-label={view === 'days' ? 'Choose month and year' : 'Back to days'}
                  className="ff-sc text-xs font-bold text-white tracking-wider rounded px-2 py-0.5 cursor-pointer transition-colors [@media(hover:hover)]:hover:bg-white/10">
                  {view === 'days' ? `${MONTHS[viewMonth]} ${viewYear}` : viewYear}
                </button>
                <button type="button" onClick={view === 'days' ? nextMonth : () => setViewYear((v) => v + 1)}
                  disabled={atLast} aria-label={view === 'days' ? 'Next month' : 'Next year'} className={navBtn}>
                  <ChevronRight size={15} />
                </button>
              </div>

              {view === 'days' ? (
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
                      const isSelected = str === value
                      const isToday = viewYear === todayP.y && viewMonth === todayP.m && d === todayP.d
                      const off = outside(str)
                      return (
                        <button
                          key={d}
                          type="button"
                          disabled={off}
                          onClick={() => pick(str)}
                          aria-label={formatDisplayDate(str)}
                          aria-pressed={isSelected}
                          className="h-8 w-full flex items-center justify-center rounded-md text-xs ff-sc transition-all"
                          style={{
                            background: isSelected ? CYAN : isToday ? 'rgba(77,249,237,0.12)' : 'transparent',
                            color: off ? 'rgba(255,255,255,0.15)' : isSelected ? '#000' : isToday ? CYAN : '#fff',
                            cursor: off ? 'not-allowed' : 'pointer',
                            fontWeight: isSelected || isToday ? 700 : 400,
                          }}
                        >
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTHS_SHORT.map((label, m) => {
                    const off = monthOutside(viewYear, m)
                    const current = viewYear === valueP?.y && m === valueP?.m
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={off}
                        onClick={() => { setViewMonth(m); setView('days') }}
                        className="h-9 rounded-md text-xs ff-sc transition-all"
                        style={{
                          background: current ? CYAN : m === viewMonth ? 'rgba(77,249,237,0.12)' : 'transparent',
                          color: off ? 'rgba(255,255,255,0.15)' : current ? '#000' : '#fff',
                          cursor: off ? 'not-allowed' : 'pointer',
                          fontWeight: current ? 700 : 400,
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="mt-3 pt-2 border-t border-white/[0.07] flex justify-center gap-6">
                <button
                  type="button"
                  disabled={outside(today)}
                  onClick={() => pick(today)}
                  className="ff-sc text-xs cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: CYAN }}
                >
                  Today
                </button>
                {clearable && value && (
                  <button
                    type="button"
                    onClick={() => pick('')}
                    className="ff-sc text-xs cursor-pointer transition-colors text-white/60 [@media(hover:hover)]:hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
