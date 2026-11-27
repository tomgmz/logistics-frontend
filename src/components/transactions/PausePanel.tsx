'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFormGuard } from '@/lib/hooks/useFormGuard'
import Link from 'next/link'
import { PauseCircle } from 'lucide-react'
import { CARD_TOGGLE, ToggleBox } from '@/components/ui/accordion'

import { pauseService, pauseReasonLabel, PAUSE_REASON_LABEL, resumeRequestOpen, type BookingPause, type PauseReason } from '@/lib/services/admin/pause.service'
import { useAuthStore } from '@/lib/store/auth.store'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { RemarksModal } from '@/components/layout/ReusableModal'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { formatCallClock } from '@/app/admin/booking-management/DriverCallTime'
import { phDay } from '@/lib/ph-date'
import { formatDateTime } from './transaction-format'
import { MUTED } from './transaction-theme'
import { PALETTE } from '@/lib/palette'
import { codingFlagFor } from '@/lib/number-coding'
import { OFFICE_CLOSE_HOUR, OFFICE_HOURS_LABEL, OFFICE_OPEN_HOUR } from '@/lib/office-hours'
import { MapPointLink } from '@/components/map/LocationMapModal'
import { cachedFetch } from '@/lib/query/useApiQuery'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { usePanelSection } from '@/components/ui/PanelReady'
import Dropdown from '@/components/ui/Dropdown'
import DatePicker from '@/components/ui/DatePicker'

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

/**
 * What the continuation day changes, re-checked like the original day was at
 * assignment: MMDA number coding for the vehicle on the route, and whether the
 * driver's call time falls outside receiving hours (Mon–Sat, 8 AM–5 PM).
 * Warnings only, as at assignment.
 */
function continuationWarnings(
  date: string, time: string,
  plate: string | null | undefined,
  route: { origin?: string | null; booking_destinations?: Array<{ address?: string | null }> | null } | undefined,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  const out: string[] = []
  const coding = route ? codingFlagFor(plate, { ...route, schedule_date: date, call_time: time || null }) : null
  if (coding) {
    out.push(`Number coding: ${plate} is coded on ${coding.day}s in ${coding.cities.join(', ')} (${coding.hours})` +
      (coding.callTimeCoded ? ', and the call time falls inside it.' : '.'))
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  const hour = /^\d{2}:\d{2}/.test(time) ? Number(time.slice(0, 2)) : null
  if (weekday === 0) out.push(`${dayLabel(date)} is a Sunday, outside receiving hours (${OFFICE_HOURS_LABEL}).`)
  else if (hour != null && (hour < OFFICE_OPEN_HOUR || hour >= OFFICE_CLOSE_HOUR)) {
    out.push(`The call time is outside receiving hours (${OFFICE_HOURS_LABEL}).`)
  }
  return out
}

export default function PausePanel({ bookingId, pausedAt, inTransit, canControl, allowed = true, onUpdated, plate, route }: {
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
  /** The fleet vehicle's plate, for the number-coding re-check on the new day. */
  plate?:     string | null
  /** Origin and drop-offs, for the same check. */
  route?:     { origin?: string | null; booking_destinations?: Array<{ address?: string | null }> | null }
}) {
  const role = useAuthStore((s) => s.user?.role ?? '')
  const [pauses, setPauses]   = useState<BookingPause[]>([])
  const [showPast, setShowPast] = useState(false)
  const [asking, setAsking]   = useState(false)
  // "Not yet" to the driver's "Ready to continue", while its reason is written.
  const [declining, setDeclining] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [reason, setReason]   = useState<PauseReason | ''>('')
  const [busy, setBusy]       = useState(false)
  // The expected continuation, while it is being set.
  const [planning, setPlanning] = useState(false)
  const [planDate, setPlanDate] = useState('')
  const [planTime, setPlanTime] = useState('')
  // What the plan form opened with: Cancel after a change asks first, and Save
  // asks once more because it notifies the client and the driver (user 2026-11-27).
  const [planStart, setPlanStart] = useState('')
  const planGuard = useFormGuard(planning && `${planDate}|${planTime}` !== planStart)
  const canAct = canControl && PAUSE_ROLES.includes(role)

  const [loaded, setLoaded] = useState(false)
  usePanelSection(!loaded)
  const load = useCallback(async () => {
    try {
      setPauses(await cachedFetch(['booking', bookingId, 'pauses'], () => pauseService.list(bookingId), (p) => { setPauses(p); setLoaded(true) }))
    } catch {
      // Read-only extra; the booking still renders without it.
      setPauses([])
    } finally { setLoaded(true) }
  }, [bookingId])

  useEffect(() => { void load() }, [load, pausedAt])
  // Live: a continuation date or note set by someone else shows at once.
  useLiveTable(['live:bookings'], () => { void load() })

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

  // The continuation time came and went with the delivery still paused.
  const continuationAtMs = open?.expected_resume_date && open?.expected_resume_call_time
    ? Date.parse(`${open.expected_resume_date.slice(0, 10)}T${open.expected_resume_call_time.slice(0, 5)}:00+08:00`)
    : null
  const continuationOverdue = continuationAtMs != null && Number.isFinite(continuationAtMs) && continuationAtMs <= Date.now()

  function beginPlan() {
    setPlanDate(open?.expected_resume_date ?? '')
    setPlanTime(open?.expected_resume_call_time?.slice(0, 5) ?? '')
    setPlanStart(`${open?.expected_resume_date ?? ''}|${open?.expected_resume_call_time?.slice(0, 5) ?? ''}`)
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
      appToast.success('Continuation set. The planned arrival was moved to that day; the client and the driver were told.')
      setPlanning(false)
      await load()
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not set the continuation date.'))
    } finally {
      setBusy(false)
    }
  }

  async function declineRequest(note: string) {
    setBusy(true)
    try {
      await pauseService.declineRequest(bookingId, note)
      appToast.success('Answer sent. The driver was told to keep waiting, with your reason.')
      setDeclining(false)
      await load()
      onUpdated()
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not send the answer.'))
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

  // Figma "delivery paused" frames (2026-11-14): one red card that holds the
  // Pause button, or the pause in force (continuation, End Pause) and the
  // earlier pauses.
  const inputBox = 'w-full min-w-0 min-h-[46px] rounded-[10px] border border-[#424242] bg-[#0a0a0a] px-3 text-sm font-bold text-white outline-none [color-scheme:dark] disabled:opacity-50'
  const fieldLabel = 'flex flex-col gap-1.5 text-sm font-bold text-[#818181] min-w-0'
  const hint = (
    <p className="text-xs font-bold leading-snug" style={{ color: MUTED }}>
      The planned arrival moves to that day and call time. The client is told the date and the new expected arrival; the driver the date and the call time, with a reminder an hour before.
    </p>
  )
  const bigGreen = 'w-full min-h-[56px] rounded-[10px] border text-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const greenStyle = { background: '#2a1e0c', borderColor: PALETTE.green, color: PALETTE.green }
  const tealSmall = 'w-full min-h-[40px] rounded-[5px] border text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const tealStyle = { background: '#1f3533', borderColor: PALETTE.cyan, color: PALETTE.cyan }
  const redCard = (open || canPause)

  const earlier = past.length > 0 && (
    // Alone in the card (no pause running, no Pause button), its outline IS the card, so
    // there aren't two outlines one inside the other (user 2026-11-16).
    <ToggleBox open={showPast} onOpenChange={setShowPast} title={`Earlier pauses (${past.length})`}
      triggerStyle={{ color: PALETTE.cyan }}
      {...(redCard
        ? { triggerClassName: 'text-base' }
        : CARD_TOGGLE)}>
        <ul className="flex flex-col list-none p-0 m-0">
          {past.map((p) => (
            <li key={p.pause_id} className="py-2 border-b border-dashed border-[#818181]/60 last:border-b-0 flex flex-col gap-0.5">
              <span className="text-xs font-bold text-white whitespace-pre-wrap break-words">
                {pauseReasonLabel(p.reason)}{p.note ? ` · ${p.note}` : ''}
              </span>
              <span className="text-xs font-bold" style={{ color: MUTED }}>
                {formatDateTime(p.paused_at)} - {formatDateTime(p.resumed_at)} ({duration(p.paused_at, p.resumed_at)})
                {' · '}{p.resumed_via === 'staff' && personName(p.resumer)
                  ? `Resumed by: ${personName(p.resumer)}`
                  : ENDED_BY[p.resumed_via ?? ''] ?? 'Ended'}
                {p.resume_note ? ` · ${p.resume_note}` : ''}
              </span>
            </li>
          ))}
        </ul>
    </ToggleBox>
  )

  return (
    <div className={redCard
      ? 'rounded-[15px] border px-3.5 sm:px-4 pt-3 pb-4 flex flex-col gap-3'
      // Only "Earlier pauses" in it: that box draws the card itself.
      : 'flex flex-col gap-3'}
      style={redCard ? { borderColor: PALETTE.red, background: '#250505' } : undefined}>
      {canPause && (
        <>
          <div className="flex items-center gap-2">
            <PauseCircle size={22} strokeWidth={2} style={{ color: PALETTE.red }} className="shrink-0" />
            <h3 className="text-base font-bold leading-tight" style={{ color: PALETTE.red }}>Pause delivery</h3>
          </div>
          <p className="text-sm font-bold text-white leading-snug">
            Something stopping the truck (weather, a breakdown, a closed stop)? Pause the delivery; only the office can resume it.
          </p>
          <button type="button" disabled={busy} onClick={() => setPausing(true)} {...writeAccess(allowed)}
            className={bigGreen} style={greenStyle}>
            Pause delivery
          </button>
        </>
      )}

      {open && (
        <>
          <div className="flex items-start gap-2">
            <PauseCircle size={22} strokeWidth={2} style={{ color: PALETTE.red }} className="shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-tight" style={{ color: PALETTE.red }}>Delivery paused</h3>
              <p className="text-xs font-bold leading-snug mt-0.5" style={{ color: PALETTE.green }}>
                Since {formatDateTime(open.paused_at)} ({duration(open.paused_at, null)})
                {personName(open.pauser) ? ` · by ${personName(open.pauser)}` : ''}
              </p>
            </div>
          </div>
          <p className="text-xs font-bold leading-snug whitespace-pre-wrap break-words">
            <span style={{ color: PALETTE.red }}>Remarks:</span>{' '}
            <span className="text-white">{pauseReasonLabel(open.reason)}{open.note ? ` · ${open.note}` : ''}</span>
          </p>
          {(open.latitude != null && open.longitude != null) && (
            <MapPointLink className="text-xs font-bold underline self-start text-[#4DF9ED]"
              point={{ latitude: open.latitude, longitude: open.longitude, label: 'Where the truck was when paused' }}>
              Where the truck was when paused
            </MapPointLink>
          )}
          {open.report_id && (
            <Link href={reportHref(open.report_id)} className="text-xs font-bold underline self-start" style={{ color: PALETTE.orange }}>
              Breakdown report filed — open it in Reports
            </Link>
          )}

          {/* The driver pressed "Ready to continue" on the paused banner. Ending the
              pause (End Pause below) is the yes; "Not yet" keeps it paused with a reason. */}
          {resumeRequestOpen(open) && open.resume_requested_at && (
            <div className="rounded-[15px] border px-3.5 sm:px-4 py-3 flex flex-col gap-2"
              style={{ borderColor: PALETTE.yellow, background: '#262305' }}>
              <h4 className="text-sm font-bold leading-tight" style={{ color: PALETTE.yellow }}>Driver ready to continue</h4>
              <p className="text-xs font-bold leading-snug" style={{ color: MUTED }}>
                {personName(open.requester ?? null) ?? 'The driver'} asked at {formatDateTime(open.resume_requested_at)}
                {' '}({duration(open.resume_requested_at, null)} ago)
              </p>
              {open.resume_request_note && (
                <p className="text-xs font-bold text-white leading-snug whitespace-pre-wrap break-words">
                  &ldquo;{open.resume_request_note}&rdquo;
                </p>
              )}
              <p className="text-xs font-bold leading-snug" style={{ color: MUTED }}>
                End the pause if it is safe to go, or answer &ldquo;Not yet&rdquo; with a reason for the driver.
              </p>
              {canAct && (
                <button type="button" disabled={busy} onClick={() => setDeclining(true)} {...writeAccess(allowed)}
                  className={tealSmall} style={{ background: 'transparent', borderColor: PALETTE.yellow, color: PALETTE.yellow }}>
                  Not yet
                </button>
              )}
            </div>
          )}
          {!resumeRequestOpen(open) && open.resume_declined_at && (
            <p className="text-xs font-bold leading-snug whitespace-pre-wrap break-words" style={{ color: MUTED }}>
              The driver asked to continue; {personName(open.decliner ?? null) ?? 'the office'} answered &ldquo;Not yet&rdquo; at{' '}
              {formatDateTime(open.resume_declined_at)}{open.resume_decline_note ? `: ${open.resume_decline_note}` : ''}
            </p>
          )}

          {/* When it continues: a date for the client, plus a call time for the driver. */}
          <div className="rounded-[15px] border border-[#424242] bg-[#141414] px-3.5 sm:px-4 py-3 flex flex-col gap-3">
            {!open.expected_resume_date && (
              <p className="text-sm font-bold leading-snug" style={{ color: PALETTE.cyan }}>
                No continuation date set yet — the client sees the delivery date as to be confirmed
              </p>
            )}
            {planning ? (
              <>
                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                  <label className={fieldLabel}>
                    Continuation date
                    <DatePicker value={planDate} min={phDay(Date.now())} disabled={busy}
                      onChange={setPlanDate} className={inputBox} aria-label="Continuation date" />
                  </label>
                  <label className={fieldLabel}>
                    Driver call time
                    <input type="time" value={planTime} step={300} disabled={busy}
                      onChange={(e) => setPlanTime(e.target.value)} className={inputBox} />
                  </label>
                </div>
                {continuationWarnings(planDate, planTime, plate, route).map((w) => (
                  <p key={w} className="text-xs font-bold" style={{ color: PALETTE.orange }}>{w}</p>
                ))}
                {hint}
                <div className="flex gap-2.5">
                  <button type="button" disabled={busy} onClick={() => planGuard.requestClose(() => setPlanning(false))}
                    className={tealSmall} style={{ background: 'transparent', borderColor: MUTED, color: MUTED }}>
                    Cancel
                  </button>
                  <button type="button" disabled={busy || !planDate || !planTime} onClick={() => planGuard.confirmSubmit(() => void savePlan(), {
                      title:        'Save the continuation and notify?',
                      description:  `${planDate ? dayLabel(planDate) : ''}, driver call time ${planTime ? formatCallClock(planTime) : ''}. The client and the driver are told.`,
                      confirmLabel: 'Save and notify',
                    })}
                    className={tealSmall} style={tealStyle}>
                    {busy ? 'Saving…' : 'Save and notify'}
                  </button>
                </div>
              </>
            ) : open.expected_resume_date ? (
              <>
                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                  <div className={fieldLabel}>
                    Continuation date
                    <span className={`${inputBox} flex items-center`}>{dayLabel(open.expected_resume_date.slice(0, 10))}</span>
                  </div>
                  <div className={fieldLabel}>
                    Driver call time
                    <span className={`${inputBox} flex items-center`}>
                      {open.expected_resume_call_time ? formatCallClock(open.expected_resume_call_time) : '—'}
                    </span>
                  </div>
                </div>
                {continuationWarnings(
                  open.expected_resume_date.slice(0, 10), open.expected_resume_call_time?.slice(0, 5) ?? '', plate, route,
                ).map((w) => (
                  <p key={w} className="text-xs font-bold" style={{ color: PALETTE.orange }}>{w}</p>
                ))}
                {continuationOverdue && (
                  <p className="text-xs font-bold" style={{ color: PALETTE.orange }}>
                    That call time has passed and the delivery is still paused. Resume it, or set a new date.
                  </p>
                )}
                {hint}
                {canAct && (
                  <button type="button" disabled={busy} onClick={beginPlan} {...writeAccess(allowed)}
                    className={tealSmall} style={tealStyle}>
                    Change date
                  </button>
                )}
              </>
            ) : canAct && (
              <button type="button" disabled={busy} onClick={beginPlan} {...writeAccess(allowed)}
                className={tealSmall} style={tealStyle}>
                Set continuation date
              </button>
            )}
          </div>

          {canAct && (
            <button type="button" disabled={busy} onClick={() => setAsking(true)} {...writeAccess(allowed)}
              className={bigGreen} style={greenStyle}>
              {busy ? 'Saving…' : 'End Pause'}
            </button>
          )}
        </>
      )}

      {earlier}

      {planGuard.modal}
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
          <Dropdown id="pause-reason" value={reason} disabled={busy}
            onChange={(e) => setReason(e.target.value as PauseReason | '')}
            className="w-full rounded-lg border border-white/10 bg-black/30 text-base sm:text-sm text-white/85 px-3 py-2 outline-none disabled:opacity-50">
            <option value="" disabled>Choose a reason</option>
            {(Object.keys(PAUSE_REASON_LABEL) as PauseReason[]).map((k) => (
              <option key={k} value={k} className="bg-[#424242]">{PAUSE_REASON_LABEL[k]}</option>
            ))}
          </Dropdown>
        </div>
      </RemarksModal>

      <RemarksModal
        open={declining}
        title="Keep the delivery paused?"
        description="The driver is told the office answered not yet, with your reason. They can ask again later."
        remarksLabel="Reason for the driver"
        remarksPlaceholder="e.g. Still flooded at the next drop-off — wait for our call."
        confirmLabel="Send"
        busy={busy}
        minRemarks={3}
        minRemarksMessage="Say why the delivery stays paused (at least 3 characters)."
        onConfirm={(note) => void declineRequest(note)}
        onCancel={() => setDeclining(false)}
      />

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
