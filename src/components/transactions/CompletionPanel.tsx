'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, PackageCheck } from 'lucide-react'

import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'
import { bookingService } from '@/lib/services/client/booking.service'
import { getApiErrorMessage } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { formatDateTime } from './transaction-format'
import { AMBER, BORDER_C, CYAN, ERROR, MUTED } from './transaction-theme'

/**
 * Completion is the client's call, and only theirs. Once the driver has
 * finished every drop-off the booking sits at 'delivered' until the client
 * confirms it or 3 days pass. Reporting a problem holds the clock until staff
 * mark the problem resolved, which gives the client a fresh 3 days.
 *
 *   client — Confirm / Report a problem
 *   staff  — Mark a reported problem resolved (they cannot confirm for the client)
 *
 * Renders nothing unless the booking is delivered.
 */

const AUTO_COMPLETE_DAYS = 3

export default function CompletionPanel({ booking, mode, onUpdated }: {
  booking:   BookingWithRelations
  mode:      'client' | 'staff'
  onUpdated: (next: BookingWithRelations) => void
}) {
  const [busy, setBusy]         = useState(false)
  const [reporting, setReporting] = useState(false)
  const [note, setNote]         = useState('')

  if (String(booking.status ?? '').toLowerCase() !== 'delivered') return null

  const bookingId   = booking.booking_id as string
  const deliveredAt = booking.delivered_at as string | null | undefined
  const issueNote   = booking.client_issue_note as string | null | undefined
  const issueAt     = booking.client_issue_reported_at as string | null | undefined
  const resolvedAt  = booking.client_issue_resolved_at as string | null | undefined
  const openIssue   = !!issueNote && !resolvedAt
  // The 3 days run from delivery, and restart when a reported problem is resolved.
  const clockFrom   = resolvedAt ?? deliveredAt
  const autoAt      = clockFrom
    ? new Date(new Date(clockFrom).getTime() + AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null

  async function run(action: () => Promise<BookingWithRelations>, success: string, failure: string) {
    setBusy(true)
    try {
      const next = await action()
      appToast.success(success)
      onUpdated(next)
    } catch (err) {
      appToast.error(getApiErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => run(
    () => bookingService.confirmCompletion(bookingId),
    'Thank you — the booking is now complete.',
    'Could not confirm the booking.',
  )

  const resolve = () => run(
    () => bookingService.resolveDeliveryIssue(bookingId),
    `Marked resolved. The client has ${AUTO_COMPLETE_DAYS} days to confirm.`,
    'Could not mark the problem resolved.',
  )

  async function report() {
    if (note.trim().length < 5) {
      appToast.error('Describe the problem in a few words.')
      return
    }
    setBusy(true)
    try {
      const next = await bookingService.reportDeliveryIssue(bookingId, note.trim())
      appToast.success('Problem reported. Operations will follow up with you.')
      setReporting(false)
      setNote('')
      onUpdated(next)
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not report the problem.'))
    } finally {
      setBusy(false)
    }
  }

  const accent = openIssue ? ERROR : AMBER

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ borderColor: `${accent}55`, background: `${accent}0d` }}>
      <div className="flex items-center gap-2">
        {openIssue
          ? <AlertTriangle size={16} style={{ color: ERROR }} />
          : <PackageCheck size={16} style={{ color: AMBER }} />}
        <h3 className="text-sm font-bold text-white">
          {openIssue
            ? 'Problem reported by the client'
            : mode === 'client' ? 'Your delivery is done — please confirm' : 'Awaiting the client’s confirmation'}
        </h3>
      </div>

      {openIssue ? (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-white/85 whitespace-pre-wrap">{issueNote}</p>
          <span className="text-[11px]" style={{ color: MUTED }}>
            {issueAt ? `Reported ${formatDateTime(issueAt)} · ` : ''}
            {mode === 'client'
              ? 'Operations will follow up. This booking will not complete on its own until it is resolved.'
              : `Mark it resolved once it is dealt with. The client then has ${AUTO_COMPLETE_DAYS} days to confirm or report again.`}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[12px] text-white/70">
            {resolvedAt
              ? <>The reported problem was marked resolved on {formatDateTime(resolvedAt)}.{' '}</>
              : <>The driver finished every drop-off{deliveredAt ? ` on ${formatDateTime(deliveredAt)}` : ''}.{' '}</>}
            {mode === 'client'
              ? 'Confirm the booking is complete, or report a problem if something is wrong.'
              : 'Only the client can confirm it.'}
            {autoAt && <> It completes automatically on <span className="font-semibold">{formatDateTime(autoAt)}</span> if nothing is reported.</>}
          </p>
          {resolvedAt && issueNote && (
            <span className="text-[11px] whitespace-pre-wrap" style={{ color: MUTED }}>
              Reported problem: {issueNote}
            </span>
          )}
        </div>
      )}

      {mode === 'staff' ? (
        openIssue && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void resolve()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"
              style={{ background: CYAN, color: '#000' }}>
              <CheckCircle2 size={14} />
              {busy ? 'Saving…' : 'Mark problem resolved'}
            </button>
          </div>
        )
      ) : reporting ? (
        <div className="flex flex-col gap-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000}
            placeholder="What went wrong? e.g. items missing, damaged, delivered to the wrong place…"
            className="w-full rounded-lg border bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
            style={{ borderColor: BORDER_C }} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void report()}
              className="rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"
              style={{ background: ERROR, color: '#000' }}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" disabled={busy} onClick={() => { setReporting(false); setNote('') }}
              className="rounded-lg border px-3 py-2 text-xs font-bold text-white/70 cursor-pointer"
              style={{ borderColor: BORDER_C }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void confirm()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 cursor-pointer"
            style={{ background: CYAN, color: '#000' }}>
            <CheckCircle2 size={14} />
            {busy ? 'Confirming…' : 'Confirm booking is complete'}
          </button>
          {!openIssue && (
            <button type="button" disabled={busy} onClick={() => setReporting(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer"
              style={{ borderColor: `${ERROR}66`, color: ERROR }}>
              <AlertTriangle size={14} /> Report a problem
            </button>
          )}
        </div>
      )}
    </div>
  )
}
