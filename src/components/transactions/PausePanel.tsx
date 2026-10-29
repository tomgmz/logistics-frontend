'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronDown, ChevronRight, PauseCircle, Play } from 'lucide-react'

import { pauseService, pauseReasonLabel, PAUSE_REASON_LABEL, type BookingPause, type PauseReason } from '@/lib/services/admin/pause.service'
import { useAuthStore } from '@/lib/store/auth.store'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { RemarksModal } from '@/components/layout/ReusableModal'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { formatCallClock } from '@/app/admin/booking-management/DriverCallTime'
import { phDay } from '@/lib/ph-date'
import { formatDateTime } from './transaction-format'
import { AMBER, BORDER_C, GREEN, MUTED } from './transaction-theme'
import { MapPointLink } from '@/components/map/LocationMapModal'

/**
 * Staff view of the pauses on one booking: a way to pause a delivery in
 * transit, the pause in force (reason, note, since when, the breakdown report it
 * filed) with a way to end it, and every earlier pause with how long it lasted.
 *
 * Only the Operations Manager and the Company Administrator pause or resume a
 * delivery — never the driver, and not IT (the backend enforces the same).
 *
 * The notes are staff-only — the client is told the reason category and nothing
 * more — so this reads them from the staff endpoint, never from the booking the
 * client also reads.
 *
 * Renders nothing for a booking that was never paused and can't be paused now.
 */

const PAUSE_ROLES = ['admin', 'operations_manager']

const REPORTS_PATH: Record<string, string> = {
  operations_manager: '/operations_admin/reports',
  fleet_manager:      '/fleet_admin/reports',
}

function personName(p: { first_name: string | null; last_name: string | null } | null): string | null {
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim()
  return name || null
}

function duration(fromIso: string, toIso: string | null): string {
  const to = toIso ? Date.parse(toIso) : Date.now()
  const minutes = Math.max(0, Math.round((to - Date.parse(fromIso)) / 60000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

// 'driver' and 'auto' are older pauses, from before pausing became the office's call.
const ENDED_BY: Record<string, string> = {
  driver: 'Resumed by the driver',
  staff:  'Resumed by the office',
  auto:   'Ended when the driver confirmed a stop',
}

/** "Oct 26, 2026" from YYYY-MM-DD, as a calendar day (no timezone shift). */
function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function PausePanel({ bookingId, pausedAt, inTransit, canControl, allowed = true, onUpdated }: {
  bookingId:  string
  /** The booking's own `paused_at` — a change re-reads the history. */
  pausedAt:   string | null | undefined
  /** Only a delivery in transit can be paused. */
  inTransit:  boolean
  /** The view shows the controls: nobody else is editing. The role is checked here too. */
  canControl: boolean
  /** The Booking Management tier allows it. Read Only sees the controls disabled. */
  allowed?:   boolean
  onUpdated:  () => void
}) {
  const role = useAuthStore((s) => s.user?.role ?? '')
  const [pauses, setPauses]   = useState<BookingPause[]>([])
  const [showPast, setShowPast] = useState(false)
  const [asking, setAsking]   = useState(false)
  const [pausing, setPausing] = useState(false)
  const [reason, setReason]   = useState<PauseReason | ''>('')
  const [busy, setBusy]       = useState(false)
  // The expected continuation, while it is being set.
  const [planning, setPlanning] = useState(false)
  const [planDate, setPlanDate] = useState('')
  const [planTime, setPlanTime] = useState('')
  const canAct = canControl && PAUSE_ROLES.includes(role)

  const load = useCallback(async () => {
    try {
      setPauses(await pauseService.list(bookingId))
    } catch {
      // Read-only extra; the booking still renders without it.
      setPauses([])
    }
  }, [bookingId])

  useEffect(() => { void load() }, [load, pausedAt])

  const open = pauses.find((p) => !p.resumed_at) ?? null
  const past = pauses.filter((p) => !!p.resumed_at)
  const canPause = canAct && inTransit && !open && !pausedAt
  if (!open && past.length === 0 && !canPause) return null

  const reportHref = (reportId: string) =>
    `${REPORTS_PATH[role] ?? '/admin/reports'}?report=${encodeURIComponent(reportId)}`

  async function pause(note: string) {
    if (!reason) return
    if (note.length < 3) {
      appToast.error('Say why the delivery is paused (at least 3 characters).')
      return
    }
    setBusy(true)
    try {
      await pauseService.pause(bookingId, reason, note)
      appToast.success('Delivery paused. The driver and the client have been told.')
      setPausing(false)
      setReason('')
      await load()
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not pause the delivery.'))
    } finally {
      setBusy(false)
    }
  }

  function beginPlan() {
    setPlanDate(open?.expected_resume_date ?? '')
    setPlanTime(open?.expected_resume_call_time?.slice(0, 5) ?? '')
    setPlanning(true)
  }

  async function savePlan() {
    if (!planDate || !planTime) {
      appToast.error('Pick the date and the driver\'s call time.')
      return
    }
    setBusy(true)
    try {
      await pauseService.setContinuation(bookingId, planDate, planTime)
      appToast.success('Continuation set. The client was told the date; the driver the date and call time.')
      setPlanning(false)
      await load()
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not set the continuation date.'))
    } finally {
      setBusy(false)
    }
  }

  async function resume(note: string) {
    setBusy(true)
    try {
      await pauseService.resume(bookingId, note)
      appToast.success('Pause ended. The driver and the client have been told.')
      setAsking(false)
      await load()
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not end the pause.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {canPause && (
        <div className="rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-2"
          style={{ borderColor: BORDER_C }}>
          <span className="text-[12px] min-w-0 flex-1" style={{ color: MUTED }}>
            Something stopping the truck (weather, a breakdown, a closed stop)? Pause the delivery; only the office can resume it.
          </span>
          <button type="button" disabled={busy} onClick={() => setPausing(true)} {...writeAccess(allowed)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ background: AMBER, color: '#000' }}>
            <PauseCircle size={13} />
            Pause delivery
          </button>
        </div>
      )}

      {open && (
        <div className="rounded-xl border p-3.5 flex flex-col gap-2"
          style={{ borderColor: `${AMBER}55`, background: `${AMBER}0d` }}>
          <div className="flex items-center gap-2">
            <PauseCircle size={16} style={{ color: AMBER }} />
            <h3 className="text-sm font-bold text-white">
              Delivery paused · {pauseReasonLabel(open.reason)}
            </h3>
          </div>
          <p className="text-[13px] text-white/85 whitespace-pre-wrap">{open.note}</p>
          <span className="text-[11px]" style={{ color: MUTED }}>
            Since {formatDateTime(open.paused_at)} ({duration(open.paused_at, null)})
            {personName(open.pauser) ? ` · by ${personName(open.pauser)}` : ''}
            {open.latitude != null && open.longitude != null && (
              <> · <MapPointLink className="underline"
                point={{ latitude: open.latitude, longitude: open.longitude, label: 'Where the truck was when paused' }}>where the truck was</MapPointLink></>
            )}
          </span>
          {open.report_id && (
            <Link href={reportHref(open.report_id)} className="text-[12px] font-semibold underline" style={{ color: AMBER }}>
              Breakdown report filed — open it in Reports
            </Link>
          )}
          {/* When it continues: a date for the client, plus a call time for the driver. */}
          <div className="flex flex-col gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: BORDER_C }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/85 min-w-0">
                <CalendarClock size={13} style={{ color: AMBER }} className="shrink-0" />
                {open.expected_resume_date
                  ? <>Continues {dayLabel(open.expected_resume_date)}
                      {open.expected_resume_call_time ? ` · driver call time ${formatCallClock(open.expected_resume_call_time)}` : ''}</>
                  : 'No continuation date set yet'}
              </span>
              {canAct && !planning && (
                <button type="button" disabled={busy} onClick={beginPlan} {...writeAccess(allowed)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-white/10 text-white/60 hover:text-white
                             hover:border-white/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                  {open.expected_resume_date ? 'Change date' : 'Set continuation date'}
                </button>
              )}
            </div>
            {planning && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider text-white/50">
                    Continuation date
                    <input type="date" value={planDate} min={phDay(Date.now())} disabled={busy}
                      onChange={(e) => setPlanDate(e.target.value)}
                      className="w-full min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base sm:text-sm font-normal normal-case tracking-normal text-white/85 outline-none [color-scheme:dark]" />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-wider text-white/50">
                    Driver call time
                    <input type="time" value={planTime} step={300} disabled={busy}
                      onChange={(e) => setPlanTime(e.target.value)}
                      className="w-full min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base sm:text-sm font-normal normal-case tracking-normal text-white/85 outline-none [color-scheme:dark]" />
                  </label>
                </div>
                <p className="text-[11px]" style={{ color: MUTED }}>
                  The client is told the date. The driver is told the date and the call time.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => setPlanning(false)}
                    className="flex-1 min-w-[90px] py-2 rounded-lg border border-white/10 text-[12px] font-bold text-white/50 hover:text-white transition-colors disabled:opacity-40">
                    Cancel
                  </button>
                  <button type="button" disabled={busy || !planDate || !planTime} onClick={() => void savePlan()}
                    className="flex-1 min-w-[90px] py-2 rounded-lg text-[12px] font-bold transition-colors disabled:opacity-40"
                    style={{ background: `${AMBER}26`, color: AMBER }}>
                    {busy ? 'Saving…' : 'Save and notify'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {canAct && (
            <div>
              <button type="button" disabled={busy} onClick={() => setAsking(true)} {...writeAccess(allowed)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                style={{ background: GREEN, color: '#000' }}>
                <Play size={13} fill="#000" />
                {busy ? 'Saving…' : 'End pause'}
              </button>
            </div>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: BORDER_C }}>
          <button type="button" onClick={() => setShowPast((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/50 cursor-pointer bg-transparent border-none p-0">
            {showPast ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Earlier pauses ({past.length})
          </button>
          {showPast && (
            <ul className="mt-2 flex flex-col gap-2.5 list-none p-0 m-0">
              {past.map((p) => (
                <li key={p.pause_id} className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-semibold text-white/85">
                    {pauseReasonLabel(p.reason)} · {duration(p.paused_at, p.resumed_at)}
                  </span>
                  <span className="text-[12px] text-white/70 whitespace-pre-wrap">{p.note}</span>
                  <span className="text-[11px]" style={{ color: MUTED }}>
                    {formatDateTime(p.paused_at)} – {formatDateTime(p.resumed_at)} · {ENDED_BY[p.resumed_via ?? ''] ?? 'Ended'}
                    {p.resumed_via === 'staff' && personName(p.resumer) ? ` (${personName(p.resumer)})` : ''}
                    {p.resume_note ? `: ${p.resume_note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <RemarksModal
        open={pausing}
        title="Pause this delivery?"
        description="The driver is told to wait until the office resumes it; the client sees the reason, not your note."
        remarksLabel="Note for the driver and the office"
        remarksPlaceholder="e.g. Typhoon signal no. 2 on the route — wait at the next safe stop."
        confirmLabel="Pause"
        busy={busy}
        confirmDisabled={!reason}
        onConfirm={(note) => void pause(note)}
        onCancel={() => { setPausing(false); setReason('') }}
      >
        <div className="space-y-1">
          <label htmlFor="pause-reason" className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
            Reason <span className="text-red-400">*</span>
          </label>
          <select id="pause-reason" value={reason} disabled={busy}
            onChange={(e) => setReason(e.target.value as PauseReason | '')}
            className="w-full rounded-lg border border-white/10 bg-black/30 text-base sm:text-sm text-white/85 px-3 py-2 outline-none disabled:opacity-50">
            <option value="" disabled>Choose a reason</option>
            {(Object.keys(PAUSE_REASON_LABEL) as PauseReason[]).map((k) => (
              <option key={k} value={k} className="bg-[#424242]">{PAUSE_REASON_LABEL[k]}</option>
            ))}
          </select>
        </div>
      </RemarksModal>

      <RemarksModal
        open={asking}
        title="End this pause?"
        description="The driver is told the office resumed the delivery, and the client sees it moving again."
        remarksLabel="Note for the driver"
        remarksPlaceholder="e.g. Spoke to the driver — the road is open again."
        confirmLabel="End pause"
        busy={busy}
        onConfirm={(note) => void resume(note)}
        onCancel={() => setAsking(false)}
      />
    </div>
  )
}
