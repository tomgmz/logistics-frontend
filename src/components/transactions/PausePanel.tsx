'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, PauseCircle, Play } from 'lucide-react'

import { pauseService, pauseReasonLabel, PAUSE_REASON_LABEL, type BookingPause, type PauseReason } from '@/lib/services/admin/pause.service'
import { useAuthStore } from '@/lib/store/auth.store'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { RemarksModal } from '@/components/layout/ReusableModal'
import { formatDateTime } from './transaction-format'
import { AMBER, BORDER_C, GREEN, MUTED } from './transaction-theme'

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

export default function PausePanel({ bookingId, pausedAt, inTransit, canControl, onUpdated }: {
  bookingId:  string
  /** The booking's own `paused_at` — a change re-reads the history. */
  pausedAt:   string | null | undefined
  /** Only a delivery in transit can be paused. */
  inTransit:  boolean
  /** The view allows it: booking edit rights, not read-only. The role is checked here too. */
  canControl: boolean
  onUpdated:  () => void
}) {
  const role = useAuthStore((s) => s.user?.role ?? '')
  const [pauses, setPauses]   = useState<BookingPause[]>([])
  const [showPast, setShowPast] = useState(false)
  const [asking, setAsking]   = useState(false)
  const [pausing, setPausing] = useState(false)
  const [reason, setReason]   = useState<PauseReason | ''>('')
  const [busy, setBusy]       = useState(false)
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
          <button type="button" disabled={busy} onClick={() => setPausing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"
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
              <> · <a className="underline" target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps?q=${open.latitude},${open.longitude}`}>where the truck was</a></>
            )}
          </span>
          {open.report_id && (
            <Link href={reportHref(open.report_id)} className="text-[12px] font-semibold underline" style={{ color: AMBER }}>
              Breakdown report filed — open it in Reports
            </Link>
          )}
          {canAct && (
            <div>
              <button type="button" disabled={busy} onClick={() => setAsking(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"
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
