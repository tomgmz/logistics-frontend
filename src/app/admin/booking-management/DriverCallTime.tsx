'use client'

import { useState } from 'react'
import { AlarmClock } from 'lucide-react'

import { tripService } from '@/lib/services/admin/trip.service'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { writeAccess } from '@/components/layout/ModuleAccess'

/**
 * The driver's call time: when operations wants the driver at the pickup point.
 *
 * Separate from the client's call time, which stays what the client booked.
 * Left empty, the driver follows the client's time. It is guidance, not a gate —
 * the driver can still start the delivery earlier — and the driver app reminds
 * the crew one hour before it. Editable until the delivery starts.
 */

interface Props {
  bookingId:       string
  /** The client's requested call time (`HH:MM[:SS]`). */
  clientCallTime:  string | null | undefined
  /** What operations set (`HH:MM[:SS]`), or null. */
  driverCallTime:  string | null | undefined
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

const selectClass =
  'rounded-lg border border-white/10 bg-[#1a1a1a] text-sm text-white px-2 py-2 outline-none ' +
  'focus:border-[var(--color-cyan)]/50 disabled:opacity-50'

export default function DriverCallTime({ bookingId, clientCallTime, driverCallTime, canEdit, allowed = true, editable }: Props) {
  const [saved, setSaved]     = useState<string | null>(driverCallTime ? driverCallTime.slice(0, 5) : null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [draft, setDraft]     = useState(() => split(saved ?? clientCallTime))

  const canChange = canEdit && editable

  const begin = () => {
    setDraft(split(saved ?? clientCallTime))
    setEditing(true)
  }

  const save = async (value: string | null) => {
    setSaving(true)
    try {
      const next = await tripService.setDriverCallTime(bookingId, value)
      setSaved(next ? next.slice(0, 5) : null)
      setEditing(false)
      appToast.success(
        next
          ? `Driver call time set to ${formatCallClock(next)}. The driver is reminded 1 hour before.`
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

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlarmClock size={14} className="text-[var(--color-cyan)] shrink-0" />
          <span className="text-[12px] font-bold text-white/70">Driver Call Time</span>
          {!editing && (
            <span className="text-[12px] font-bold text-white">
              {saved ? formatCallClock(saved) : formatCallClock(clientCallTime)}
            </span>
          )}
        </div>

        {!editing && canChange && (
          <button
            type="button"
            onClick={begin}
            {...writeAccess(allowed)}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-white/10
                       text-white/50 hover:text-white hover:border-white/25 transition-colors shrink-0
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saved ? 'Change' : 'Set call time'}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Hour"
              value={draft.hour}
              disabled={saving}
              onChange={(e) => setDraft((d) => ({ ...d, hour: Number(e.target.value) }))}
              className={selectClass}
            >
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-white/40">:</span>
            <select
              aria-label="Minute"
              value={draft.minute}
              disabled={saving}
              onChange={(e) => setDraft((d) => ({ ...d, minute: Number(e.target.value) }))}
              className={selectClass}
            >
              {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
            </select>
            <select
              aria-label="AM or PM"
              value={draft.pm ? 'PM' : 'AM'}
              disabled={saving}
              onChange={(e) => setDraft((d) => ({ ...d, pm: e.target.value === 'PM' }))}
              className={selectClass}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="flex-1 min-w-[80px] py-2 rounded-lg border border-white/10 text-[12px] font-bold
                         text-white/50 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            {saved && (
              <button
                type="button"
                onClick={() => void save(null)}
                disabled={saving}
                className="flex-1 min-w-[120px] py-2 rounded-lg border border-white/10 text-[12px] font-bold
                           text-white/50 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40"
              >
                Use Client&apos;s Time
              </button>
            )}
            <button
              type="button"
              onClick={() => void save(join(draft.hour, draft.minute, draft.pm))}
              disabled={saving}
              className="flex-1 min-w-[80px] py-2 rounded-lg text-[12px] font-bold transition-colors disabled:opacity-40"
              style={{ background: 'rgba(77,249,237,0.14)', color: 'var(--color-cyan)' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : null}

      <p className="text-[11px] leading-relaxed text-white/35">
        {saved
          ? `Client's call time: ${formatCallClock(clientCallTime)}. `
          : 'Not set, so the driver follows the client\'s call time. '}
        The driver is notified in the app 1 hour before and can still start the delivery early.
      </p>
    </div>
  )
}
