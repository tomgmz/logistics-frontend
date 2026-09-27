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
 * Completion is the client's call. Once the driver has finished every drop-off
 * the booking sits at 'delivered' until the client confirms it (or reports a
 * problem instead), staff confirm it for them, or 3 days pass.
 *
 *   client — Confirm / Report a problem
 *   staff  — Confirm on the client's behalf (also how a reported problem is closed)
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
  const autoAt      = deliveredAt
    ? new Date(new Date(deliveredAt).getTime() + AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null

  async function confirm() {
    setBusy(true)
    try {
      const next = await bookingService.confirmCompletion(bookingId)
      appToast.success(mode === 'client' ? 'Thank you — the booking is now complete.' : 'Booking confirmed complete.')
      onUpdated(next)
    } catch (err) {
      appToast.error(getApiErrorMessage(err, 'Could not confirm the booking.'))
    } finally {
      setBusy(false)
    }
  }

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

  const accent = issueNote ? ERROR : AMBER

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ borderColor: `${accent}55`, background: `${accent}0d` }}>
      <div className="flex items-center gap-2">
        {issueNote
          ? <AlertTriangle size={16} style={{ color: ERROR }} />
          : <PackageCheck size={16} style={{ color: AMBER }} />}
        <h3 className="text-sm font-bold text-white">
          {issueNote
            ? 'Problem reported by the client'
            : mode === 'client' ? 'Your delivery is done — please confirm' : 'Awaiting the client’s confirmation'}
        </h3>
      </div>

      {issueNote ? (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-white/85 whitespace-pre-wrap">{issueNote}</p>
          <span className="text-[11px]" style={{ color: MUTED }}>
            {issueAt ? `Reported ${formatDateTime(issueAt)} · ` : ''}
            {mode === 'client'
              ? 'Operations will follow up. This booking will not complete until it is resolved.'
              : 'This booking will not complete on its own. Confirm it once the problem is resolved.'}
          </span>
        </div>
      ) : (
        <p className="text-[12px] text-white/70">
          The driver finished every drop-off{deliveredAt ? ` on ${formatDateTime(deliveredAt)}` : ''}.{' '}
          {mode === 'client'
            ? 'Confirm the booking is complete, or report a problem if something is wrong.'
            : 'The client can confirm it or report a problem; you can confirm it for them.'}
          {autoAt && <> It completes automatically on <span className="font-semibold">{formatDateTime(autoAt)}</span> if nothing is reported.</>}
        </p>
      )}

      {reporting ? (
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
            {busy ? 'Confirming…'
              : mode === 'client' ? 'Confirm booking is complete'
              : issueNote ? 'Resolve and confirm complete' : 'Confirm on the client’s behalf'}
          </button>
          {mode === 'client' && !issueNote && (
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
