'use client'

import { useState } from 'react'

import { tripService } from '@/lib/services/admin/trip.service'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { PALETTE } from '@/lib/palette'
import { GREY_BUTTON_STYLE, TEAL_BUTTON_CLASS, TEAL_BUTTON_STYLE } from './BookingDetailParts'
import Dropdown from '@/components/ui/Dropdown'
import { FieldError, errorBorder } from '@/components/ui/FieldError'

/**
 * The driver's call time: when operations wants the driver at the pickup point.
 *
 * Separate from the client's call time, which stays what the client booked.
 * Left empty, the driver follows the client's time. It is guidance, not a gate —
 * the driver can still start the delivery earlier — and the driver app reminds
 * the crew one hour before it. Editable until the delivery starts.
 *
 * It has its own day (user 2026-11-17): the booking day or the day before, so a
 * 12:00 AM start can have a 10:00 PM call the night before. It can't be after
 * the booking start (booking day + client's call time) or already past; the
 * server refuses the same.
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
  if (!Number.isNaN(start) && at > start) {
    return `Can't be after the booking starts (${formatDay(scheduleDay)}, ${formatCallClock(clientCallTime)}).`
  }
  if (at <= Date.now()) return 'This time has already passed. Pick a later time.'
  return null
}

const selectClass =
  'rounded-lg border border-white/10 bg-[#1a1a1a] text-sm text-white px-2 py-2 outline-none ' +
  'focus:border-[var(--color-cyan)]/50 disabled:opacity-50'

export default function DriverCallTime({ bookingId, clientCallTime, scheduleDate, driverCallTime, driverCallDate, canEdit, allowed = true, editable }: Props) {
  const scheduleDay = (scheduleDate ?? '').slice(0, 10)
  const dayBefore   = scheduleDay ? shiftDay(scheduleDay, -1) : ''
  const [saved, setSaved]       = useState<string | null>(driverCallTime ? driverCallTime.slice(0, 5) : null)
  const [savedDay, setSavedDay] = useState<string | null>(driverCallTime ? (driverCallDate ?? scheduleDay) : null)
  const [editing, setEditing]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [draft, setDraft]       = useState(() => split(saved ?? clientCallTime))
  const [draftDay, setDraftDay] = useState(savedDay ?? scheduleDay)
  const [showErrors, setShowErrors] = useState(false)

  const canChange  = canEdit && editable
  const draftTime  = join(draft.hour, draft.minute, draft.pm)
  const draftError = scheduleDay ? callError(draftDay, draftTime, scheduleDay, clientCallTime) : null
  const errClass   = errorBorder(showErrors && draftError)

  const begin = () => {
    setDraft(split(saved ?? clientCallTime))
    setDraftDay(savedDay ?? scheduleDay)
    setShowErrors(false)
    setEditing(true)
  }

  const save = async (value: string | null, day: string | null = null) => {
    setSaving(true)
    try {
      const next = await tripService.setDriverCallTime(bookingId, value, day)
      setSaved(next.time ? next.time.slice(0, 5) : null)
      setSavedDay(next.time ? (next.date ?? scheduleDay) : null)
      setEditing(false)
      appToast.success(
        next.time
          ? `Driver call time set to ${formatDriverCall(next.time, next.date, scheduleDay)}. The driver is reminded 1 hour before.`
          : 'Driver call time cleared. The driver follows the client\'s call time.',
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
  return (
    <div className="rounded-[15px] border border-[#424242] bg-[#2a2828] px-3.5 sm:px-4 py-3 space-y-3">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-base font-bold">
        <span className="text-white">Driver Call Time:</span>
        {!editing && (
          <span style={{ color: saved ? PALETTE.cyan : PALETTE.red }}>
            {saved ? formatDriverCall(saved, savedDay, scheduleDay) : 'No call time set'}
          </span>
        )}
      </p>

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
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className={smallBtn} style={GREY_BUTTON_STYLE}>
              Cancel
            </button>
            {saved && (
              <button type="button" onClick={() => void save(null)} disabled={saving} className={`${smallBtn} min-w-[120px]`} style={GREY_BUTTON_STYLE}>
                Use Client&apos;s Time
              </button>
            )}
            <button type="button" onClick={() => { setShowErrors(true); if (!draftError) void save(draftTime, draftDay) }} disabled={saving}
              className={smallBtn} style={TEAL_BUTTON_STYLE}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}

      <p className="text-xs font-bold uppercase leading-snug text-[#818181]">
        {saved
          ? `Client's call time: ${formatCallClock(clientCallTime)} on the booking day. `
          : `Not set, so the driver follows the client's call time (${formatCallClock(clientCallTime)}). `}
        The driver is notified in the app 1 hour before and can still start the delivery early.
      </p>

      {!editing && canChange && (
        <button type="button" onClick={begin} {...writeAccess(allowed)}
          className={`${TEAL_BUTTON_CLASS} min-h-[40px] text-sm`} style={TEAL_BUTTON_STYLE}>
          {saved ? 'Change' : 'Set Call Time'}
        </button>
      )}
    </div>
  )
}
