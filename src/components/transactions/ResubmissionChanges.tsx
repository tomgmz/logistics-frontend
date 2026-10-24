'use client'

import { useCallback, useEffect, useState } from 'react'
import { GitCompare, Loader2 } from 'lucide-react'

import { bookingService, type BookingRevision, type BookingSnapshot } from '@/lib/services/client/booking.service'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { getApiErrorMessage } from '@/lib/api-error'
import { roleLabel } from '@/lib/roles'
import { SectionHeader } from './TransactionDetail'
import { formatDateTime, fileNameFromUrl } from './transaction-format'
import { BG_PANEL, BG_CARD, BORDER, BORDER_C, CYAN, MUTED, ERROR } from './transaction-theme'

/**
 * The old and resubmitted values of a booking the client corrected after a
 * rejection. A resubmission rewrites the same booking, so without this the
 * earlier values would be gone; the server keeps both sides of every
 * resubmission (GET /booking/:id/revisions) and this lists only what changed.
 *
 * Shown to the client in their history, to the approver in Booking Management
 * and in the admin transaction history. Renders nothing for a booking that was
 * never resubmitted.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Snapshot dates and times are bare Postgres values ("2026-10-25", "10:00:00").
// Formatted by hand: Safari will not parse a date-only string with no zone.
function fmtDate(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''))
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ''
}

function fmtTime(v: unknown): string {
  const m = /^(\d{2}):(\d{2})/.exec(String(v ?? ''))
  if (!m) return ''
  const h = Number(m[1])
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

function num(v: unknown, unit: string): string {
  return v == null || v === '' ? '' : `${Number(v)} ${unit}`
}

function yesNo(v: unknown): string {
  return v == null ? '' : v ? 'Yes' : 'No'
}

function cargoLine(c: Record<string, unknown>): string {
  const dims = [c.length_cm, c.width_cm, c.height_cm].every((x) => x != null)
    ? `${Number(c.length_cm)} × ${Number(c.width_cm)} × ${Number(c.height_cm)} CM`
    : ''
  return [
    [c.product, c.commodity ? `(${c.commodity})` : ''].filter(Boolean).join(' '),
    c.quantity != null ? `${Number(c.quantity)}${c.unit ? ` ${c.unit}` : ''}` : '',
    num(c.weight_kg, 'KG'),
    c.volume_cbm != null ? `${Number(c.volume_cbm).toFixed(2)} CBM` : '',
    dims,
    [c.shc, c.ashc].filter(Boolean).join(' / '),
    c.dropoff_sequence_order != null ? `to Drop-off ${c.dropoff_sequence_order}` : '',
    typeof c.notes === 'string' ? c.notes : '',
  ].filter(Boolean).join(' · ')
}

interface Change { label: string; before: string; after: string }

/** Every field that differs between two snapshots, in the order the booking form asks for them. */
function diff(before: BookingSnapshot, after: BookingSnapshot): Change[] {
  const rows: Change[] = []
  const add = (label: string, b: string, a: string) => { if (b !== a) rows.push({ label, before: b, after: a }) }

  add('Pickup Address',  String(before.origin ?? ''), String(after.origin ?? ''))
  add('Schedule Date',   fmtDate(before.schedule_date), fmtDate(after.schedule_date))
  add('Call Time',       fmtTime(before.call_time), fmtTime(after.call_time))
  add('Vehicle Type',    String(before.truck_type_needed ?? ''), String(after.truck_type_needed ?? ''))

  const bStops = before.destinations ?? []
  const aStops = after.destinations ?? []
  for (let i = 0; i < Math.max(bStops.length, aStops.length); i++) {
    const stop = (s?: Record<string, unknown>) =>
      s ? [s.address, s.notes].filter(Boolean).join(' — ') : ''
    add(`Drop-off ${i + 1}`, stop(bStops[i]), stop(aStops[i]))
  }

  const bCargo = before.cargo_items ?? []
  const aCargo = after.cargo_items ?? []
  for (let i = 0; i < Math.max(bCargo.length, aCargo.length); i++) {
    add(`Cargo ${i + 1}`, bCargo[i] ? cargoLine(bCargo[i]) : '', aCargo[i] ? cargoLine(aCargo[i]) : '')
  }

  add('Required Volume',     num(before.required_volume_cbm, 'CBM'),   num(after.required_volume_cbm, 'CBM'))
  add('Required Weight',     num(before.required_weight_kg, 'KG'),     num(after.required_weight_kg, 'KG'))
  add('Required Net Weight', num(before.required_net_weight_kg, 'KG'), num(after.required_net_weight_kg, 'KG'))
  add('Required Length',     num(before.required_length_cm, 'CM'),     num(after.required_length_cm, 'CM'))
  add('Stackable Required',  yesNo(before.stackable_required),         yesNo(after.stackable_required))
  add('Non-stackable Cargo', yesNo(before.non_stackable_cargo),        yesNo(after.non_stackable_cargo))

  const docs = (s: BookingSnapshot) => (s.transaction_documents ?? []).map(fileNameFromUrl).join(', ')
  add('Documents', docs(before), docs(after))

  return rows
}

function Value({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg px-3 py-2 border min-w-0"
      style={{ background: BG_CARD, borderColor: BORDER_C }}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
      <span className="text-xs text-white/85 whitespace-pre-wrap break-words">{value || '—'}</span>
    </div>
  )
}

function Revision({ rev }: { rev: BookingRevision }) {
  const changes = diff(rev.before_snapshot, rev.after_snapshot)
  const b       = rev.before_snapshot
  const rejectedBy = b.gm_status === 'rejected'
    ? roleLabel(b.rejected_role ?? 'general_manager')
    : b.rejected_role ? roleLabel(b.rejected_role) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-bold text-white">Resubmission {rev.revision_number}</span>
        <span className="text-[11px]" style={{ color: MUTED }}>{formatDateTime(rev.created_at)}</span>
      </div>

      {(b.rejection_reason || rejectedBy) && (
        <p className="text-xs rounded-lg px-3 py-2"
          style={{ background: `${ERROR}10`, border: `1px solid ${ERROR}30`, color: ERROR }}>
          <span className="font-semibold">Rejected{rejectedBy ? ` by the ${rejectedBy}` : ''}</span>
          {b.rejected_at ? ` · ${formatDateTime(b.rejected_at)}` : ''}
          {b.rejection_reason ? <><br /><span className="font-semibold">Remarks:</span> {b.rejection_reason}</> : null}
        </p>
      )}

      {changes.length === 0 ? (
        <p className="text-xs" style={{ color: MUTED }}>Resubmitted without changes.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {changes.map((c) => (
            <li key={c.label} className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase text-[#818181]">{c.label}</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Value label="Before" value={c.before} color={MUTED} />
                <Value label="Resubmitted" value={c.after} color={CYAN} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ResubmissionChanges({ bookingId, resubmissionCount }: {
  bookingId:          string
  resubmissionCount?: number | null
}) {
  const [revisions, setRevisions] = useState<BookingRevision[] | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [reload, setReload]       = useState(0)
  const resubmitted = (resubmissionCount ?? 0) > 0

  useEffect(() => {
    if (!resubmitted) return
    let cancelled = false
    bookingService.fetchBookingRevisions(bookingId)
      .then((rows) => { if (!cancelled) { setRevisions(rows ?? []); setError(null) } })
      .catch((e) => { if (!cancelled) setError(getApiErrorMessage(e, 'Could not load the earlier values of this booking.')) })
    return () => { cancelled = true }
  }, [bookingId, resubmitted, reload])

  // A further resubmission lands on live:bookings.
  const bump = useCallback(() => setReload((n) => n + 1), [])
  useLiveTable(['live:bookings'], bump)

  if (!resubmitted) return null

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-4"
      style={{ background: BG_PANEL, borderColor: BORDER }}>
      <SectionHeader icon={<GitCompare size={15} />} title="Changes after Rejection" />
      {error && !revisions ? (
        <p className="text-xs" style={{ color: ERROR }}>{error}</p>
      ) : !revisions ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
          <Loader2 size={13} className="animate-spin" /> Loading earlier values…
        </div>
      ) : revisions.length === 0 ? (
        // Resubmitted before 2026-10-24, when the old values were not kept yet.
        <p className="text-xs" style={{ color: MUTED }}>
          This booking was resubmitted before earlier values were kept, so there is nothing to compare.
        </p>
      ) : (
        // Newest first: the latest resubmission is the one awaiting a decision.
        [...revisions].reverse().map((rev, i) => (
          <div key={rev.revision_number} className={i > 0 ? 'pt-4 border-t' : ''} style={{ borderColor: BORDER_C }}>
            <Revision rev={rev} />
          </div>
        ))
      )}
    </div>
  )
}
