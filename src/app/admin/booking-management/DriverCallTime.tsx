'use client'

import { useEffect, useState } from 'react'

import { tripService, type DriverCallCheck } from '@/lib/services/admin/trip.service'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { PALETTE } from '@/lib/palette'
import { GREY_BUTTON_STYLE, TEAL_BUTTON_CLASS, TEAL_BUTTON_STYLE } from './BookingDetailParts'
import Dropdown from '@/components/ui/Dropdown'
import { useFormGuard } from '@/lib/hooks/useFormGuard'
import { FieldError, errorBorder } from '@/components/ui/FieldError'

/**
 * The driver's call time: when the driver should start the delivery so the
 * truck is at the pickup point by the client's pick-up time (user 2026-11-26).
 *
 * Separate from the client's call time (the pick-up time), which stays what the
 * client booked, and never the same: it must be before it, because the drive
 * there takes time. Required after assignment (user 2026-11-24): a step of the
 * booking's progress that can't be cleared. With none set, the driver gets no
 * reminder and there is no Late start. Still guidance, not a gate: the driver
 * can start without it or earlier. The app reminds the drivers 1 hour before.
 * Editable until the delivery starts.
 *
 * It has its own day (user 2026-11-17): the booking day or the day before, so a
 * 12:00 AM pick-up can have a 10:00 PM call the night before. The server
 * refuses the same rules. While picking, the drive time from the parking at
 * that hour is checked and a warning shows when it would miss the pick-up
 * (never a block).
 */

interface Props {
  bookingId:       string
  /** The client's requested call time (`HH:MM[:SS]`). */
  clientCallTime:  string | null | undefined
  /** The booking day (`YYYY-MM-DD`). */
  scheduleDate:    string | null | undefined
  /** What operations set (`HH:MM[:SS]`), or null. */
  driverCallTime:  string | null | undefined
  /** Its day (`YYYY-MM-DD`); null = the booking day. */
  driverCallDate?: string | null | undefined
  /** RBAC edit right and the booking lock. */
  canEdit:         boolean
  /** The Booking Management tier allows it. Read Only sees the button disabled. */
  allowed?:        boolean
  /** Only an assigned booking — once started a call time has nothing left to say. */
  editable:        boolean
  /** Saved: the panel updates the booking (and the other copy of this card). */
  onSaved?:        (time: string | null, date: string | null) => void
  /** 'card' = the Trips box; 'step' = inside the progress step (no frame or title of its own). */
  variant?:        'card' | 'step'
}

const HOURS   = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

/** `HH:MM[:SS]` → "9:05 AM". */
export function formatCallClock(time: string | null | undefined): string {
  const m = /^(\d{2}):(\d{2})/.exec(time ?? '')
  if (!m) return '—'
  const h = Number(m[1])
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

function split(time: string | null | undefined) {
  const m = /^(\d{2}):(\d{2})/.exec(time ?? '')
  const h = m ? Number(m[1]) : 8
  const min = m ? Number(m[2]) : 0
  return { hour: h % 12 || 12, minute: min - (min % 5), pm: h >= 12 }
}

function join(hour: number, minute: number, pm: boolean): string {
  const h = (hour % 12) + (pm ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** A calendar day moved by `n` days. */
function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** "Tue, Nov 11". */
function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** A PH wall-clock day + time as an instant (ms), comparable across days. */
function phMs(day: string, hhmm: string): number {
  return new Date(`${day}T${hhmm.slice(0, 5)}:00+08:00`).getTime()
}

/** "10:00 PM", plus the day when it isn't the booking day. */
export function formatDriverCall(time: string | null | undefined, day: string | null | undefined, scheduleDay: string | null | undefined): string {
  const clock = formatCallClock(time)
  if (!day || !scheduleDay || day === scheduleDay) return clock
  return `${clock}, ${formatDay(day)} (day before)`
}

/** What's wrong with the picked call, or null. */
function callError(day: string, time: string, scheduleDay: string, clientCallTime: string | null | undefined): string | null {
  const at    = phMs(day, time)
  const start = clientCallTime ? phMs(scheduleDay, clientCallTime) : NaN
  if (!Number.isNaN(start) && at >= start) {
    return `Must be before the client's pick-up time (${formatDay(scheduleDay)}, ${formatCallClock(clientCallTime)}), so the truck can get there in time.`
  }
  if (at <= Date.now()) return 'This time has already passed. Pick a later time.'
  return null
}

/** A first guess: 1 hour before the client's pick-up time (the day before when that crosses midnight). */
function defaultCall(scheduleDay: string, clientCallTime: string | null | undefined): { day: string; time: string } {
  const start = clientCallTime ? phMs(scheduleDay, clientCallTime) : NaN
  if (Number.isNaN(start)) return { day: scheduleDay, time: '07:00' }
  const ph = new Date(start - 60 * 60_000 + 8 * 60 * 60_000)
  return { day: ph.toISOString().slice(0, 10), time: ph.toISOString().slice(11, 16) }
}

/** "9:05 AM" from an ISO instant, Manila. */
function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
}

/** The drive-time check in words; `late` = it would miss the pick-up. */
function checkText(c: DriverCallCheck | null): { text: string; late: boolean } | null {
  if (!c) return null
  if (c.reason === 'no_parking') return { text: "No parking position on record yet, so the drive time can't be checked.", late: false }
  if (c.drive_minutes == null || !c.arrives_at) return null
  const drive = c.drive_minutes >= 60
    ? `${Math.floor(c.drive_minutes / 60)} h ${c.drive_minutes % 60} min`
    : `${c.drive_minutes} min`
  const base = `Driving from the parking takes about ${drive} at that hour, arriving around ${clockOf(c.arrives_at)}`
  if (c.late_minutes != null && c.late_minutes > 0) {
    return { text: `${base}: about ${c.late_minutes} min after the client's pick-up time. Pick an earlier time, or allow for it.`, late: true }
  }
  return { text: `${base}, in time for the pick-up. Allow extra for the pre-trip checks.`, late: false }
}

const selectClass =
  'rounded-lg border border-white/10 bg-[#1a1a1a] text-sm text-white px-2 py-2 outline-none ' +
  'focus:border-[var(--color-cyan)]/50 disabled:opacity-50'

export default function DriverCallTime({
  bookingId, clientCallTime, scheduleDate, driverCallTime, driverCallDate, canEdit, allowed = true, editable,
  onSaved, variant = 'card',
}: Props) {
  const scheduleDay = (scheduleDate ?? '').slice(0, 10)
  const dayBefore   = scheduleDay ? shiftDay(scheduleDay, -1) : ''
  const [saved, setSaved]       = useState<string | null>(driverCallTime ? driverCallTime.slice(0, 5) : null)
  const [savedDay, setSavedDay] = useState<string | null>(driverCallTime ? (driverCallDate ?? scheduleDay) : null)
  const [editing, setEditing]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [draft, setDraft]       = useState(() => split(saved ?? defaultCall(scheduleDay, clientCallTime).time))
  const [draftDay, setDraftDay] = useState(savedDay ?? defaultCall(scheduleDay, clientCallTime).day)
  const [check, setCheck]       = useState<DriverCallCheck | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  // The pick as editing began: Cancel after a change asks first, Save asks once
  // more because the driver is reminded at this time (user 2026-11-27).
  const [callStart, setCallStart] = useState('')

  // The same call time shows in the progress step and in Trips: follow the
  // booking when the other copy (or someone else) saves, unless mid-edit.
  const propTime = driverCallTime ? driverCallTime.slice(0, 5) : null
  const propDay  = driverCallTime ? (driverCallDate ?? scheduleDay) : null
  useEffect(() => {
    if (editing) return
    setSaved(propTime)
    setSavedDay(propDay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propTime, propDay])

  const canChange  = canEdit && editable
  const draftTime  = join(draft.hour, draft.minute, draft.pm)
  const draftError = scheduleDay ? callError(draftDay, draftTime, scheduleDay, clientCallTime) : null
  const errClass   = errorBorder(showErrors && draftError)
  const callGuard  = useFormGuard(editing && `${draftDay}|${draftTime}` !== callStart)

  const begin = () => {
    const g = defaultCall(scheduleDay, clientCallTime)
    setDraft(split(saved ?? g.time))
    setDraftDay(savedDay ?? g.day)
    setCallStart(`${savedDay ?? g.day}|${saved ?? g.time}`)
    setShowErrors(false)
    setCheck(null)
    setEditing(true)
  }

  // The drive time at the picked hour, once the pick stops changing. Only a
  // valid pick is checked (one Google call each, cached by the server).
  useEffect(() => {
    if (!editing || draftError || !draftDay) { setCheck(null); return }
    let live = true
    const t = setTimeout(() => {
      tripService.checkDriverCall(bookingId, draftDay, draftTime)
        .then((c) => { if (live) setCheck(c) })
        .catch(() => { if (live) setCheck(null) })
    }, 600)
    return () => { live = false; clearTimeout(t) }
  }, [editing, draftError, draftDay, draftTime, bookingId])
  const warning = editing && !draftError ? checkText(check) : null

  const save = async (value: string, day: string) => {
    setSaving(true)
    try {
      const next = await tripService.setDriverCallTime(bookingId, value, day)
      const time = next.time ? next.time.slice(0, 5) : null
      const date = next.time ? (next.date ?? scheduleDay) : null
      setSaved(time)
      setSavedDay(date)
      setEditing(false)
      onSaved?.(time, date)
      appToast.success(
        `Driver call time set to ${formatDriverCall(next.time, next.date, scheduleDay)}. The driver is reminded 1 hour before.`,
        { action: 'driver-call-time', entityId: bookingId },
      )
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'The driver call time could not be saved.'), {
        action: 'driver-call-time', entityId: bookingId,
      })
    } finally {
      setSaving(false)
    }
  }

  // Figma "Trips" (2026-11-14): the value in cyan when set, red "No call time
  // set" when the driver follows the client; the full-width teal button.
  const smallBtn = 'flex-1 min-w-[80px] min-h-[40px] py-2 rounded-[10px] border text-sm font-bold transition-colors disabled:opacity-40'
  const isStep = variant === 'step'
  return (
    <div className={isStep ? 'space-y-3' : 'rounded-[15px] border border-[#424242] bg-[#2a2828] px-3.5 sm:px-4 py-3 space-y-3'}>
      {!isStep && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-base font-bold">
          <span className="text-white">Driver Call Time:</span>
          {!editing && (
            <span style={{ color: saved ? PALETTE.cyan : PALETTE.red }}>
              {saved ? formatDriverCall(saved, savedDay, scheduleDay) : 'Required, not set yet'}
            </span>
          )}
        </p>
      )}

      {callGuard.modal}
      {editing && (
        <>
          <div>
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown aria-label="Day" value={draftDay} disabled={saving || !scheduleDay}
              onChange={(e) => setDraftDay(e.target.value)} className={`${selectClass} ${errClass}`}>
              <option value={scheduleDay}>{formatDay(scheduleDay)} (booking day)</option>
              <option value={dayBefore}>{formatDay(dayBefore)} (day before)</option>
            </Dropdown>
            <Dropdown aria-label="Hour" value={draft.hour} disabled={saving}
              onChange={(e) => setDraft((d) => ({ ...d, hour: Number(e.target.value) }))} className={`${selectClass} ${errClass}`}>
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </Dropdown>
            <span className="text-white/40">:</span>
            <Dropdown aria-label="Minute" value={draft.minute} disabled={saving}
              onChange={(e) => setDraft((d) => ({ ...d, minute: Number(e.target.value) }))} className={`${selectClass} ${errClass}`}>
              {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
            </Dropdown>
            <Dropdown aria-label="AM or PM" value={draft.pm ? 'PM' : 'AM'} disabled={saving}
              onChange={(e) => setDraft((d) => ({ ...d, pm: e.target.value === 'PM' }))} className={`${selectClass} ${errClass}`}>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </Dropdown>
          </div>
          <FieldError>{showErrors ? draftError : null}</FieldError>
          {warning && (
            <p className="mt-1.5 text-xs leading-snug" style={{ color: warning.late ? PALETTE.orange : '#9a9a9a' }}>
              {warning.text}
            </p>
          )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => callGuard.requestClose(() => setEditing(false))} disabled={saving} className={smallBtn} style={GREY_BUTTON_STYLE}>
              Cancel
            </button>
            <button type="button" onClick={() => {
              setShowErrors(true)
              if (draftError) return
              callGuard.confirmSubmit(() => void save(draftTime, draftDay), {
                title:        `Set the driver call time to ${formatDriverCall(draftTime, draftDay, scheduleDay)}?`,
                description:  'The driver is reminded 1 hour before.',
                confirmLabel: 'Save',
              })
            }} disabled={saving}
              className={smallBtn} style={TEAL_BUTTON_STYLE}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}

      {/* Inside the progress step the step itself explains this. */}
      {!isStep && (
        <p className="text-xs font-bold uppercase leading-snug text-[#818181]">
          {`Client's pick-up time: ${formatCallClock(clientCallTime)} on the booking day. `}
          {saved
            ? 'The driver is notified in the app 1 hour before and can still start the delivery early.'
            : 'Required: when the driver should leave so the truck is there by then. Until it is set the driver gets no reminder.'}
        </p>
      )}

      {!editing && canChange && (
        <button type="button" onClick={begin} disabled={saving} {...writeAccess(allowed)}
          className={`${TEAL_BUTTON_CLASS} min-h-[40px] text-sm`} style={TEAL_BUTTON_STYLE}>
          {saved ? 'Change' : 'Pick a Time'}
        </button>
      )}
    </div>
  )
}
