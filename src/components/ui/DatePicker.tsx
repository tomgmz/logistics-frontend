'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { nowDate } from '@/app/utils/serverTime'
import { phDay } from '@/lib/ph-date'
import CalendarPanel, { formatDisplayDate } from './CalendarPanel'

/**
 * The client booking form's calendar, for every other date field on the web
 * (replaces <input type="date">, whose look and behaviour differ per browser
 * and which iOS Safari shows as a bare wheel).
 *
 * Value is "YYYY-MM-DD" or "" — the same string a native date input gives, so
 * a call site only swaps the element. Days outside min/max cannot be picked.
 * The calendar is portalled to <body> with fixed position, so a scrolling
 * modal or side panel never clips it; it flips above the field when there is
 * no room below. The calendar itself is CalendarPanel: click the month name for
 * the months, the year for a grid of years (2026-11-23).
 */

const CYAN = '#4DF9ED'
const POPUP_W = 260
const GAP = 6
const EDGE = 8

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const today = phDay(nowDate())

  // The panel mounts fresh on every open, so it starts on the chosen day's month
  // (else today's), kept inside min/max.
  const openPicker = () => {
    if (disabled || readOnly) return
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
  const pick = (s: string) => { onChange(s); close(true) }

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
              <CalendarPanel
                value={value}
                today={today}
                min={min}
                max={max}
                onPick={pick}
                onLayoutChange={place}
                footer={
                  <>
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
                  </>
                }
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
