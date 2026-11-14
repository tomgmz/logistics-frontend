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
import { cachedFetch } from '@/lib/query/useApiQuery'
import { DesignCard } from '@/app/admin/booking-management/BookingDetailParts'
import { usePanelSection } from '@/components/ui/PanelReady'

const ORANGE = PALETTE.orange

/**
 * The times at each stop, per trip: the loading at the origin and the unloading
 * at every drop-off visit, each as arrival → start → finish, plus how long the
 * stop took and the total goods loaded on the run.
 *
 * The arrival is recorded by the driver's phone when it reaches the stop; the
 * start is the driver's one tap ("Start loading" / "Start unloading"); the
 * finish is the proof confirmation (its photo is elsewhere on the page) and is
 * the delivery time for a drop-off.
 *
 * A booking is one truck making several runs, so a drop-off can be served over
 * several trips. Each visit is its own block, labelled "visit 1 of 3", and only
 * the last one completes the drop-off.
 *
 * Staff with edit rights can fill in a missing arrival or start, or correct
 * one, with a reason — the original stays in the audit log. The client sees the
 * same times, without the office's notes.
 *
 * Renders nothing until a trip has at least one time on it.
 */

type Step = keyof StopTimes

const LOADING_STEPS: Array<[Step, string]> = [
  ['arrived',  'Arrived at pickup'],
  ['started',  'Start loading'],
  ['finished', 'Loading finished'],
  ['proof',    'Proof of pickup'],
]
const BOOKING_LOADING_STEPS: Array<[Step, string]> = [
  ['arrived',  'Arrived at pickup'],
  ['started',  'Start loading'],
  ['finished', 'Loading finished'],
  ['proof',    'Picked up (proof sent)'],
]
const BOOKING_UNLOADING_STEPS: Array<[Step, string]> = [
  ['arrived',  'Arrived at drop-off'],
  ['started',  'Start unloading'],
  ['finished', 'Unloading finished'],
  ['proof',    'Delivered (proof sent)'],
]
const UNLOADING_STEPS: Array<[Step, string]> = [
  ['arrived',  'Arrived at drop-off'],
  ['started',  'Start unloading'],
  ['finished', 'Unloading finished'],
  ['proof',    'Delivered (proof)'],
]

/**
 * The visit's times as this screen reads them. A server before 2026-11-12 sends
 * no `proof`: its `finished` WAS the proof, and no separate finish existed.
 */
function normalized(t: StopTimes): Required<StopTimes> {
  return t.proof === undefined
    ? { arrived: t.arrived, started: t.started, finished: null, proof: t.finished }
    : { arrived: t.arrived, started: t.started, finished: t.finished, proof: t.proof ?? null }
}

const hasAny = (t: StopTimes) => Object.values(t).some(Boolean)

/** "1 h 5 min", "40 min" between two step times; null when either is missing. */
function span(from: StepTime | null, to: StepTime | null): string | null {
  if (!from || !to) return null
  const min = Math.round((Date.parse(to.at) - Date.parse(from.at)) / 60_000)
  if (!Number.isFinite(min) || min < 0) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Where a drop-off visit sits among the trips that serve the same drop-off. */
interface Visit { index: number; of: number; laterTrip: number | null }

function visitsOf(trips: TimelineTrip[]): Map<string, Visit> {
  const byDest = new Map<string, Array<{ tripStopId: string; trip: number }>>()
  for (const t of [...trips].sort((a, b) => a.trip_number - b.trip_number)) {
    for (const s of t.stops) {
      const list = byDest.get(s.destination_id) ?? []
      list.push({ tripStopId: s.trip_stop_id, trip: t.trip_number })
      byDest.set(s.destination_id, list)
    }
  }
  const out = new Map<string, Visit>()
  for (const list of byDest.values()) {
    list.forEach((v, i) => out.set(v.tripStopId, {
      index: i + 1, of: list.length, laterTrip: list[i + 1]?.trip ?? null,
    }))
  }
  return out
}

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

export default function StopTimesPanel({
  bookingId, staff = false, canEdit = false, allowed = true, look = 'default', pickupAddress, summary,
}: {
  bookingId: string
  /**
   * 'booking' = Booking Management's design (Figma "Stop Times", 2026-11-14): one
   * card, every step listed with "----" until it happens, a card per trip when
   * there are several. Other screens keep the default look.
   */
  look?:     'default' | 'booking'
  /** The pickup address, shown under LOADING in the booking look. */
  pickupAddress?: string | null
  /** "1,200 kg · 4.5 CBM" under the card title in the booking look. */
  summary?:  string | null
  /** Staff read (with correction notes) from the admin route. */
  staff?:    boolean
  /**
   * Operations Manager / Company Administrator, nobody else is editing the
   * booking, and the delivery has started (In Transit, Delivered, Completed).
   */
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

  const [loaded, setLoaded] = useState(false)
  usePanelSection(!loaded)
  useEffect(() => {
    let cancelled = false
    // A read-only extra; the booking still renders without it.
    cachedFetch(['booking', bookingId, 'stop-times', staff ? 'staff' : 'client'], fetchTimeline, (rows) => { setTrips(rows ?? []); setLoaded(true) })
      .then((rows) => { if (!cancelled) setTrips(rows ?? []) }).catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [fetchTimeline])
  // An arrival or a driver's tap lands while the page is open.
  useLiveTable(['live:bookings'], () => { fetchTimeline().then((rows) => setTrips(rows ?? [])).catch(() => {}) })

  const booking = look === 'booking'
  // The booking look lists every planned trip, times or not; the default only
  // trips with at least one time.
  const shown = booking
    ? [...trips].sort((a, b) => a.trip_number - b.trip_number)
    : trips.filter((t) => hasAny(t.loading) || t.stops.some(hasAny))
  if (shown.length === 0) {
    return booking ? <p className="text-sm text-[#818181]">No trips planned yet.</p> : null
  }

  const many   = trips.length > 1
  const visits = visitsOf(trips)

  if (booking) {
    const tripBody = (t: TimelineTrip) => (
      <div className="flex flex-col gap-5">
        <StopBlock
          booking
          title="Loading"
          subtitle={pickupAddress}
          steps={BOOKING_LOADING_STEPS}
          times={t.loading}
          workLabel="Loading took"
          canEdit={canEdit}
          allowed={allowed}
          onEdit={(stage, label) => setEditing({
            tripId: t.trip_id, tripStopId: null, stage, label, where: `Loading${many ? `, trip ${t.trip_number}` : ''}`,
            current: t.loading[stage],
          })}
        />
        {t.stops.map((st, i) => {
          const v     = visits.get(st.trip_stop_id)
          const split = !!v && v.of > 1
          const note = split && normalized(st).proof
            ? v!.laterTrip ? `Part delivered · rest on trip ${v!.laterTrip}` : 'Last visit · drop-off complete'
            : null
          const visitText = split ? `visit ${v!.index} of ${v!.of}` : null
          return (
            <StopBlock
              booking
              key={st.trip_stop_id}
              title={`Unloading · Drop-off ${st.stop_number ?? i + 1}${visitText ? ` · ${visitText}` : ''}`}
              subtitle={st.address}
              note={note}
              steps={BOOKING_UNLOADING_STEPS}
              times={st}
              workLabel="Unloading took"
              canEdit={canEdit && (t.status === 'in_transit' || t.status === 'completed')}
              allowed={allowed}
              onEdit={(stage, label) => setEditing({
                tripId: t.trip_id, tripStopId: st.trip_stop_id, stage, label,
                where: `Drop-off ${st.stop_number ?? i + 1}${visitText ? `, ${visitText}` : ''}${many ? `, trip ${t.trip_number}` : ''}`,
                current: st[stage],
              })}
            />
          )
        })}
        {t.total_loaded && (
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-[#818181]">
            <Package size={13} /> Total loaded:{' '}
            <span className="text-white">
              {`${t.total_loaded.pieces.toLocaleString('en-PH')} pcs` +
                (t.total_loaded.weight_kg ? ` · ${t.total_loaded.weight_kg.toLocaleString('en-PH')} kg` : '')}
            </span>
          </p>
        )}
      </div>
    )
    return (
      <DesignCard
        icon={<Clock size={22} strokeWidth={2} />}
        title="Transit stop times"
        subtitle={summary ? <span className="text-[#818181]">{summary}</span> : undefined}
        info="Each stop's times from the driver's app: arrival (recorded when the phone reaches the stop), start, finish and the proof photo. The office can fill in or correct a missing time once the delivery is on the road; the original stays in the audit log."
      >
        {many ? (
          <div className="flex flex-col gap-3">
            {shown.map((t) => (
              <div key={t.trip_id} className="rounded-[15px] border border-[#424242] bg-[#141414] px-3 sm:px-4 pt-3 pb-4 flex flex-col gap-3">
                <p className="text-lg font-bold text-white">Trip {t.trip_number}</p>
                {tripBody(t)}
              </div>
            ))}
          </div>
        ) : tripBody(shown[0])}
        {editing && (
          <EditStopTime
            bookingId={bookingId}
            editing={editing}
            onClose={() => setEditing(null)}
            onSaved={(next) => { setTrips(next); setEditing(null) }}
          />
        )}
      </DesignCard>
    )
  }

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
            workLabel="Loading took"
            canEdit={canEdit}
            allowed={allowed}
            onEdit={(stage, label) => setEditing({
              tripId: t.trip_id, tripStopId: null, stage, label, where: `Loading${many ? `, trip ${t.trip_number}` : ''}`,
              current: t.loading[stage],
            })}
          />

          {t.stops.map((s, i) => {
            const v     = visits.get(s.trip_stop_id)
            const split = !!v && v.of > 1
            // A delivery on an earlier visit is part of the drop-off, not all of it.
            const note = split && normalized(s).proof
              ? v!.laterTrip ? `Part delivered · rest on trip ${v!.laterTrip}` : 'Last visit · drop-off complete'
              : null
            const visitText = split ? `visit ${v!.index} of ${v!.of}` : null
            return (
              <StopBlock
                key={s.trip_stop_id}
                title={`Unloading · Drop-off ${s.stop_number ?? i + 1}${visitText ? ` · ${visitText}` : ''}`}
                subtitle={s.address}
                note={note}
                steps={UNLOADING_STEPS}
                times={s}
                workLabel="Unloading took"
                // A drop-off can't be reached before its run was loaded (server checks too).
                canEdit={canEdit && (t.status === 'in_transit' || t.status === 'completed')}
                allowed={allowed}
                onEdit={(stage, label) => setEditing({
                  tripId: t.trip_id, tripStopId: s.trip_stop_id, stage, label,
                  where: `Drop-off ${s.stop_number ?? i + 1}${visitText ? `, ${visitText}` : ''}${many ? `, trip ${t.trip_number}` : ''}`,
                  current: s[stage],
                })}
              />
            )
          })}
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

function StopBlock({ title, subtitle, note, steps, times, workLabel, canEdit, allowed, onEdit, booking = false }: {
  /** Booking Management's design. */
  booking?:  boolean
  title:     string
  subtitle?: string | null
  /** For a drop-off split over trips: whether this visit finished it. */
  note?:     string | null
  steps:     Array<[Step, string]>
  times:     StopTimes
  workLabel: string
  canEdit:   boolean
  allowed:   boolean
  onEdit:    (stage: TimelineStage, label: string) => void
}) {
  const t      = normalized(times)
  const work   = span(t.started, t.finished ?? t.proof)
  const atStop = span(t.arrived, t.proof ?? t.finished)
  if (booking) {
    return (
      <div className="flex flex-col gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold uppercase leading-tight" style={{ color: CYAN }}>{title}</p>
          {subtitle && <p className="text-sm font-bold uppercase text-white break-words">{subtitle}</p>}
          {note && <p className="text-xs font-semibold text-white/75">{note}</p>}
        </div>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 m-0">
          {steps.map(([key, label]) => {
            const v = t[key]
            const editable = canEdit && key !== 'proof'
            const notRecorded = !v && key === 'finished' && !!t.proof
            return (
              <div key={key} className="contents">
                <dt className="text-sm font-bold text-[#818181] min-w-0">{label}</dt>
                <dd className="m-0 flex items-center justify-end gap-1.5 text-sm font-bold text-right text-[#818181]">
                  <span className={v ? 'text-white/85' : ''}
                    title={notRecorded ? 'The driver’s app was an older version without this step.' : undefined}>
                    {v ? formatDateTime(v.at) : notRecorded ? 'Not recorded (older app)' : '----'}
                  </span>
                  {v?.corrected && (
                    <span className="text-[11px] font-semibold" title={v.note ?? undefined}>(corrected)</span>
                  )}
                  {v?.clock_adjusted && canEdit && (
                    <span className="text-[11px] font-semibold" style={{ color: ORANGE }}
                      title="The driver's phone clock was changed before this synced; the time was moved to keep the steps in order. Check it.">
                      (check time)
                    </span>
                  )}
                  {editable && (
                    <button type="button" onClick={() => onEdit(key as TimelineStage, label)}
                      aria-label={`${v ? 'Correct' : 'Fill in'} ${label.toLowerCase()}`}
                      {...writeAccess(allowed)}
                      className="p-1 -m-1 rounded text-white/40 cursor-pointer bg-transparent border-none [@media(hover:hover)]:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed">
                      <Pencil size={13} />
                    </button>
                  )}
                </dd>
              </div>
            )
          })}
          {work && (
            <div className="contents">
              <dt className="text-sm text-[#818181] min-w-0">{workLabel}</dt>
              <dd className="m-0 text-sm text-right text-white/85">{work}</dd>
            </div>
          )}
          {atStop && (
            <div className="contents">
              <dt className="text-sm text-[#818181] min-w-0">Total time at the stop</dt>
              <dd className="m-0 text-sm text-right text-white/85">{atStop}</dd>
            </div>
          )}
        </dl>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="min-w-0">
        <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: CYAN }}>{title}</p>
        {subtitle && <p className="text-[11px] truncate" style={{ color: MUTED }}>{subtitle}</p>}
        {note && <p className="text-[11px] font-semibold text-white/75">{note}</p>}
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 m-0">
        {steps.map(([key, label]) => {
          const v = t[key]
          // The proof is the photo confirmation: never edited here.
          const editable = canEdit && key !== 'proof'
          // Confirmed by an app version that had no "finished" step.
          const notRecorded = !v && key === 'finished' && !!t.proof
          return (
            <div key={key} className="contents">
              <dt className="text-[12px] text-white/70 min-w-0">{label}</dt>
              <dd className="m-0 flex items-center justify-end gap-1.5 text-[12px] text-right">
                <span className={v ? 'text-white' : ''} style={v ? undefined : { color: MUTED }}
                  title={notRecorded ? 'The driver’s app was an older version without this step.' : undefined}>
                  {v ? formatDateTime(v.at) : notRecorded ? 'Not recorded (older app)' : '—'}
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
        {work && (
          <div className="contents">
            <dt className="text-[12px] min-w-0" style={{ color: MUTED }}>{workLabel}</dt>
            <dd className="m-0 text-[12px] text-right text-white/85">{work}</dd>
          </div>
        )}
        {atStop && (
          <div className="contents">
            <dt className="text-[12px] min-w-0" style={{ color: MUTED }}>Total time at the stop</dt>
            <dd className="m-0 text-[12px] text-right text-white/85">{atStop}</dd>
          </div>
        )}
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
              Now: {formatDateTime(editing.current.at)} ({editing.current.source === 'staff' ? 'set by the office' : 'from the driver’s phone'})
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
              placeholder="e.g. Phone was offline at the gate; warehouse log says 09:40."
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
