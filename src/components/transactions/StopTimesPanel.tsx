'use client'

import { useCallback, useEffect, useState } from 'react'
import { Clock, Package, Pencil, X } from 'lucide-react'

import {
  bookingService,
  type StepTime,
  type StopTimes,
  type TimelineStage,
  type TimelineTrip,
} from '@/lib/services/client/booking.service'
import { assignmentService } from '@/lib/services/admin/assignment.service'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { SectionHeader } from './TransactionDetail'
import { formatDateTime } from './transaction-format'
import { PALETTE } from '@/lib/palette'
import { BORDER_C, CYAN, MUTED } from './transaction-theme'
import { writeAccess } from '@/components/layout/ModuleAccess'

const ORANGE = PALETTE.orange

/**
 * The times at each stop, per trip: the loading at the origin and the unloading
 * at every drop-off, each as arrival at the parking → arrival at the docking →
 * start → finish → departure, plus the total goods loaded on the run.
 *
 * The finish is the proof confirmation (its photo is elsewhere on the page);
 * the other four are the driver's taps. Staff with edit rights can fill in a
 * missing time or correct one, with a reason — the original stays in the audit
 * log. The client sees the same times, without the office's notes.
 *
 * Renders nothing until a trip has at least one time on it.
 */

type Step = keyof StopTimes

const LOADING_STEPS: Array<[Step, string]> = [
  ['arrived_parking', 'Arrival at parking'],
  ['docked',          'Arrival at docking'],
  ['started',         'Start loading'],
  ['finished',        'Loading finished'],
  ['departed',        'Departure'],
]
const UNLOADING_STEPS: Array<[Step, string]> = [
  ['arrived_parking', 'Arrival at parking'],
  ['docked',          'Arrival at docking'],
  ['started',         'Start unloading'],
  ['finished',        'End unloading'],
  ['departed',        'Departure'],
]

const hasAny = (t: StopTimes) => Object.values(t).some(Boolean)

/** "2026-10-18T14:05" in Manila for a datetime-local input. */
function toManilaInput(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : Date.now()
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 16)
}

interface Editing {
  tripId:     string
  tripStopId: string | null
  stage:      TimelineStage
  label:      string
  where:      string
  current:    StepTime | null
}

export default function StopTimesPanel({ bookingId, staff = false, canEdit = false, allowed = true }: {
  bookingId: string
  /** Staff read (with correction notes) from the admin route. */
  staff?:    boolean
  /** Operations Manager / Company Administrator, and nobody else is editing the booking. */
  canEdit?:  boolean
  /** The Booking Management tier allows it. Read Only sees the edit buttons disabled. */
  allowed?:  boolean
}) {
  const [trips, setTrips] = useState<TimelineTrip[]>([])
  const [editing, setEditing] = useState<Editing | null>(null)

  const fetchTimeline = useCallback(
    () => (staff ? assignmentService.getTimeline(bookingId) : bookingService.fetchBookingTimeline(bookingId)),
    [bookingId, staff],
  )

  useEffect(() => {
    let cancelled = false
    // A read-only extra; the booking still renders without it.
    fetchTimeline().then((rows) => { if (!cancelled) setTrips(rows ?? []) }).catch(() => {})
    return () => { cancelled = true }
  }, [fetchTimeline])
  // A driver's tap lands while the page is open.
  useLiveTable(['live:bookings'], () => { fetchTimeline().then((rows) => setTrips(rows ?? [])).catch(() => {}) })

  const shown = trips.filter((t) => hasAny(t.loading) || t.stops.some(hasAny))
  if (shown.length === 0) return null

  const many = trips.length > 1

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader icon={<Clock size={16} />} title="Stop Times" />
      {shown.map((t) => (
        <div key={t.trip_id} className="rounded-xl border p-3 flex flex-col gap-3" style={{ borderColor: BORDER_C }}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {many && <span className="text-sm font-bold text-white">Trip {t.trip_number}</span>}
            <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: MUTED }}>
              <Package size={13} />
              Total loaded:{' '}
              <span className="text-white/85 font-semibold">
                {t.total_loaded
                  ? `${t.total_loaded.pieces.toLocaleString('en-PH')} pcs` +
                    (t.total_loaded.weight_kg ? ` · ${t.total_loaded.weight_kg.toLocaleString('en-PH')} kg` : '')
                  : 'not loaded yet'}
              </span>
            </span>
          </div>

          <StopBlock
            title="Loading"
            steps={LOADING_STEPS}
            times={t.loading}
            canEdit={canEdit}
            allowed={allowed}
            onEdit={(stage, label) => setEditing({
              tripId: t.trip_id, tripStopId: null, stage, label, where: `Loading${many ? `, trip ${t.trip_number}` : ''}`,
              current: t.loading[stage],
            })}
          />

          {t.stops.map((s, i) => (
            <StopBlock
              key={s.trip_stop_id}
              title={`Unloading · Drop-off ${s.stop_number ?? i + 1}`}
              subtitle={s.address}
              steps={UNLOADING_STEPS}
              times={s}
              canEdit={canEdit}
              allowed={allowed}
              onEdit={(stage, label) => setEditing({
                tripId: t.trip_id, tripStopId: s.trip_stop_id, stage, label,
                where: `Drop-off ${s.stop_number ?? i + 1}${many ? `, trip ${t.trip_number}` : ''}`,
                current: s[stage],
              })}
            />
          ))}
        </div>
      ))}

      {editing && (
        <EditStopTime
          bookingId={bookingId}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => { setTrips(next); setEditing(null) }}
        />
      )}
    </div>
  )
}

function StopBlock({ title, subtitle, steps, times, canEdit, allowed, onEdit }: {
  title:    string
  subtitle?: string | null
  steps:    Array<[Step, string]>
  times:    StopTimes
  canEdit:  boolean
  allowed:  boolean
  onEdit:   (stage: TimelineStage, label: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="min-w-0">
        <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: CYAN }}>{title}</p>
        {subtitle && <p className="text-[11px] truncate" style={{ color: MUTED }}>{subtitle}</p>}
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 m-0">
        {steps.map(([key, label]) => {
          const v = times[key]
          // The finish is the photo confirmation: never edited here.
          const editable = canEdit && key !== 'finished'
          return (
            <div key={key} className="contents">
              <dt className="text-[12px] text-white/70 min-w-0">{label}</dt>
              <dd className="m-0 flex items-center justify-end gap-1.5 text-[12px] text-right">
                <span className={v ? 'text-white' : ''} style={v ? undefined : { color: MUTED }}>
                  {v ? formatDateTime(v.at) : '—'}
                </span>
                {v?.corrected && (
                  <span className="text-[10px] font-semibold" style={{ color: MUTED }} title={v.note ?? undefined}>
                    (corrected)
                  </span>
                )}
                {v?.clock_adjusted && canEdit && (
                  <span className="text-[10px] font-semibold" style={{ color: ORANGE }}
                    title="The driver's phone clock was changed before this synced; the time was moved to keep the steps in order. Check it.">
                    (check time)
                  </span>
                )}
                {editable && (
                  <button type="button" onClick={() => onEdit(key as TimelineStage, label)}
                    aria-label={`${v ? 'Correct' : 'Fill in'} ${label.toLowerCase()}`}
                    {...writeAccess(allowed)}
                    className="p-1 -m-1 rounded text-white/40 cursor-pointer bg-transparent border-none [@media(hover:hover)]:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed">
                    <Pencil size={12} />
                  </button>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function EditStopTime({ bookingId, editing, onClose, onSaved }: {
  bookingId: string
  editing:   Editing
  onClose:   () => void
  onSaved:   (trips: TimelineTrip[]) => void
}) {
  const [value, setValue] = useState(toManilaInput(editing.current?.at))
  const [note, setNote]   = useState('')
  const [busy, setBusy]   = useState(false)
  useBodyScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // The input is Manila wall time; send it with its zone so no browser guesses.
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+08:00` : null
  const canSave = !!iso && note.trim().length >= 3 && !busy

  async function save() {
    if (!iso) return
    setBusy(true)
    try {
      const next = await assignmentService.setStopTime(bookingId, {
        trip_id: editing.tripId, trip_stop_id: editing.tripStopId, stage: editing.stage, at: iso, note: note.trim(),
      })
      appToast.success('Time saved.')
      onSaved(next)
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not save the time.'))
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-lg border border-white/10 bg-[#1b1b1b] px-2.5 py-2 text-sm text-white disabled:opacity-50'
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="stop-time-title"
      onClick={busy ? undefined : onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-md max-h-[92dvh] rounded-t-[18px] sm:rounded-[18px] border border-white/[0.08] bg-[#232323]">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h2 id="stop-time-title" className="text-base font-bold text-white">
              {editing.current ? 'Correct' : 'Fill in'} {editing.label.toLowerCase()}
            </h2>
            <p className="text-[11px] text-white/40 mt-0.5 truncate">{editing.where}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="shrink-0 p-1 rounded-md text-white/45 disabled:opacity-40 [@media(hover:hover)]:hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {editing.current && (
            <p className="text-[12px]" style={{ color: MUTED }}>
              Now: {formatDateTime(editing.current.at)} ({editing.current.source === 'staff' ? 'set by the office' : 'tapped by the driver'})
            </p>
          )}
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Time (Philippine time)</label>
            <input type="datetime-local" value={value} disabled={busy} onChange={(e) => setValue(e.target.value)}
              className={field} />
          </div>
          <div>
            <label className="text-[11px] text-white/40 block mb-1">Reason<span className="text-red-400"> *</span></label>
            <textarea value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
              placeholder="e.g. Driver forgot to tap; warehouse log says 09:40."
              className={`${field} resize-none`} />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-white/[0.06] flex gap-2">
          <button type="button" disabled={busy} onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-bold border border-white/10 text-white/50 disabled:opacity-40">
            Cancel
          </button>
          <button type="button" disabled={!canSave} onClick={() => void save()}
            className="flex-1 py-2 rounded-lg text-sm font-bold disabled:opacity-40"
            style={{ background: 'rgba(77,249,237,0.12)', border: '1px solid rgba(77,249,237,0.30)', color: CYAN }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
