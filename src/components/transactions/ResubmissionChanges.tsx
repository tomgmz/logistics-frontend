'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Clock, FileText, GitCompare, Loader2 } from 'lucide-react'

import { bookingService, type BookingRevision, type BookingSnapshot } from '@/lib/services/client/booking.service'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { getApiErrorMessage } from '@/lib/api-error'
import { roleLabel } from '@/lib/roles'
import { SectionHeader } from './TransactionDetail'
import { formatDateTime, fileNameFromUrl } from './transaction-format'
import { AMBER, BG_PANEL, BG_CARD, BORDER, BORDER_C, CYAN, MUTED, ERROR } from './transaction-theme'
import { cachedFetch } from '@/lib/query/useApiQuery'
import { DesignCard } from '@/app/admin/booking-management/BookingDetailParts'
import { FileViewButton } from '@/components/ui/FileViewer'
import { usePanelSection } from '@/components/ui/PanelReady'

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

interface Change {
  label: string
  before: string
  after: string
  /** For Documents: the files on each side, as links the viewer can open. */
  beforeFiles?: string[]
  afterFiles?: string[]
}

/**
 * The client's files on one side of a resubmission. The server keeps every
 * earlier file (nothing is deleted on resubmit) and hands back an openable link
 * for each, so staff can open the previous file next to the new one.
 */
function FileList({ files, align = 'left', muted = false }: { files: string[]; align?: 'left' | 'right'; muted?: boolean }) {
  if (files.length === 0) return <span className="text-[#818181]">—</span>
  return (
    <span className={`flex flex-col gap-1 min-w-0 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      {files.map((url) => {
        const name = fileNameFromUrl(url)
        return (
          <FileViewButton key={url} url={url} name={name}
            className={`inline-flex items-center gap-1.5 max-w-full text-left underline-offset-2 [@media(hover:hover)]:hover:underline ${muted ? 'text-[#818181]' : 'text-white'}`}>
            <FileText size={13} className="shrink-0" />
            <span className="min-w-0 break-all">{name}</span>
          </FileViewButton>
        )
      })}
    </span>
  )
}

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
  const bDocs = before.transaction_documents ?? []
  const aDocs = after.transaction_documents ?? []
  // Compared by the stored file, not the name: a new file with the same name is a change.
  if (bDocs.map(String).join('|') !== aDocs.map(String).join('|') || docs(before) !== docs(after)) {
    rows.push({ label: 'Documents', before: docs(before), after: docs(after), beforeFiles: bDocs, afterFiles: aDocs })
  }

  return rows
}

/**
 * The same changes grouped the way Booking Management's design shows them
 * (Figma "Changes After Rejection", 2026-11-14): one group per field, and a
 * cargo line broken into the parts that changed, each as previous → updated.
 */
interface ChangeGroup { label: string; rows: Array<{ before: string; after: string }>; beforeFiles?: string[]; afterFiles?: string[] }

function cargoParts(c: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!c) return []
  const dims = [c.length_cm, c.width_cm, c.height_cm].every((x) => x != null)
    ? `${Number(c.length_cm)} × ${Number(c.width_cm)} × ${Number(c.height_cm)} CM` : ''
  return [
    ['Product',   String(c.product ?? '')],
    ['Commodity', String(c.commodity ?? '')],
    ['Quantity',  c.quantity != null ? `${Number(c.quantity)}${c.unit ? ` ${c.unit}` : ''}` : ''],
    ['Weight',    num(c.weight_kg, 'KG')],
    ['Volume',    c.volume_cbm != null ? `${Number(c.volume_cbm).toFixed(2)} CBM` : ''],
    ['Size',      dims],
    ['Handling',  [c.shc, c.ashc].filter(Boolean).join(' / ')],
    ['Drop-off',  c.dropoff_sequence_order != null ? `Drop-off ${c.dropoff_sequence_order}` : ''],
    ['Notes',     typeof c.notes === 'string' ? c.notes : ''],
  ]
}

function groups(before: BookingSnapshot, after: BookingSnapshot): ChangeGroup[] {
  const out: ChangeGroup[] = []
  for (const c of diff(before, after)) {
    const m = /^Cargo (\d+)$/.exec(c.label)
    if (!m) { out.push({ label: c.label, rows: [{ before: c.before, after: c.after }], beforeFiles: c.beforeFiles, afterFiles: c.afterFiles }); continue }
    const i = Number(m[1]) - 1
    const b = (before.cargo_items ?? [])[i]
    const a = (after.cargo_items ?? [])[i]
    // Added or removed whole: one row, the full line against nothing.
    if (!b || !a) { out.push({ label: c.label, rows: [{ before: c.before, after: c.after }] }); continue }
    const bp = cargoParts(b), ap = cargoParts(a)
    const rows = bp
      .map(([name, v], k) => ({ before: v ? `${name}: ${v}` : '', after: ap[k][1] ? `${name}: ${ap[k][1]}` : '', same: v === ap[k][1] }))
      .filter((r) => !r.same)
      .map(({ before, after }) => ({ before, after }))
    out.push({ label: c.label, rows: rows.length ? rows : [{ before: c.before, after: c.after }] })
  }
  return out
}

/** Booking Management's look. */
function BookingRevisions({ revisions }: { revisions: BookingRevision[] }) {
  // Newest first: the latest resubmission is the one awaiting a decision.
  const ordered = [...revisions].reverse()
  const [pick, setPick] = useState(ordered[0]?.revision_number ?? 0)
  const rev = ordered.find((r) => r.revision_number === pick) ?? ordered[0]
  if (!rev) return null
  const b = rev.before_snapshot
  const rejectedBy = b.gm_status === 'rejected'
    ? roleLabel(b.rejected_role ?? 'general_manager')
    : b.rejected_role ? roleLabel(b.rejected_role) : null
  const list = groups(rev.before_snapshot, rev.after_snapshot)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {ordered.length > 1 ? (
            <label className="relative inline-flex items-center gap-1 text-lg font-bold uppercase" style={{ color: CYAN }}>
              <span className="sr-only">Resubmission to show</span>
              <select
                value={rev.revision_number}
                onChange={(e) => setPick(Number(e.target.value))}
                className="appearance-none bg-transparent pr-6 font-bold uppercase outline-none cursor-pointer"
                style={{ color: CYAN, colorScheme: 'dark' }}
              >
                {ordered.map((r) => (
                  <option key={r.revision_number} value={r.revision_number} style={{ color: '#fff', background: '#1b1b1b' }}>
                    Resubmission {r.revision_number}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-0" />
            </label>
          ) : (
            <span className="text-lg font-bold uppercase" style={{ color: CYAN }}>Resubmission {rev.revision_number}</span>
          )}
          <span className="text-xs text-[#818181]">{formatDateTime(rev.created_at)}</span>
        </div>
        {(rejectedBy || b.rejection_reason) && (
          <div className="mt-1 text-sm font-bold leading-snug" style={{ color: ERROR }}>
            <p>Rejected{rejectedBy ? ` by the ${rejectedBy}` : ''}{b.rejected_at ? ` · ${formatDateTime(b.rejected_at)}` : ''}</p>
            {b.rejection_reason && (
              <p>Remarks: <span className="text-white break-words">{b.rejection_reason}</span></p>
            )}
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-[#818181]">Resubmitted without changes.</p>
      ) : (
        <div className="flex flex-col">
        {/* One header for the whole list (user 2026-11-14), not one per field. */}
        <div className="flex items-center justify-between gap-3 pb-3 mb-1 border-b border-[#424242] text-base font-bold">
          <span className="text-white">Previous</span>
          <span style={{ color: AMBER }}>Updated</span>
        </div>
        <ul className="flex flex-col">
          {list.map((g, gi) => (
            <li key={g.label} className={`flex flex-col gap-2 py-4 ${gi > 0 ? 'border-t border-[#424242]' : ''}`}>
              <span className="text-lg font-bold uppercase leading-tight" style={{ color: CYAN }}>{g.label}</span>
              {g.beforeFiles || g.afterFiles ? (
                <div className="grid grid-cols-2 gap-3 py-1.5 text-sm font-bold">
                  <FileList files={g.beforeFiles ?? []} muted />
                  <FileList files={g.afterFiles ?? []} align="right" />
                </div>
              ) : (
              <div className="flex flex-col">
                {g.rows.map((r, ri) => (
                  <div key={ri}
                    className={`grid grid-cols-2 gap-3 py-1.5 text-sm font-bold ${ri > 0 ? 'border-t border-dashed border-[#818181]/60' : ''}`}>
                    <span className="text-[#818181] break-words whitespace-pre-wrap min-w-0">{r.before || '—'}</span>
                    <span className="text-white text-right break-words whitespace-pre-wrap min-w-0">{r.after || '—'}</span>
                  </div>
                ))}
              </div>
              )}
            </li>
          ))}
        </ul>
        </div>
      )}
    </div>
  )
}

function Value({ label, value, color, files }: { label: string; value: string; color: string; files?: string[] }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg px-3 py-2 border min-w-0"
      style={{ background: BG_CARD, borderColor: BORDER_C }}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
      {files
        ? <span className="text-xs"><FileList files={files} /></span>
        : <span className="text-xs text-white/85 whitespace-pre-wrap break-words">{value || '—'}</span>}
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
                <Value label="Before" value={c.before} color={MUTED} files={c.beforeFiles} />
                <Value label="Resubmitted" value={c.after} color={CYAN} files={c.afterFiles} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ResubmissionChanges({ bookingId, resubmissionCount, look = 'default' }: {
  bookingId:          string
  resubmissionCount?: number | null
  /** 'booking' = Booking Management's design; other screens keep the default look. */
  look?:              'default' | 'booking'
}) {
  const [revisions, setRevisions] = useState<BookingRevision[] | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [reload, setReload]       = useState(0)
  const resubmitted = (resubmissionCount ?? 0) > 0
  usePanelSection(resubmitted && revisions === null && !error)

  useEffect(() => {
    if (!resubmitted) return
    let cancelled = false
    cachedFetch(['booking', bookingId, 'revisions'], () => bookingService.fetchBookingRevisions(bookingId),
      (rows) => { setRevisions(rows ?? []); setError(null) })
      .then((rows) => { if (!cancelled) { setRevisions(rows ?? []); setError(null) } })
      .catch((e) => { if (!cancelled) setError(getApiErrorMessage(e, 'Could not load the earlier values of this booking.')) })
    return () => { cancelled = true }
  }, [bookingId, resubmitted, reload])

  // A further resubmission lands on live:bookings.
  const bump = useCallback(() => setReload((n) => n + 1), [])
  useLiveTable(['live:bookings'], bump)

  if (!resubmitted) return null

  if (look === 'booking') {
    const n = resubmissionCount ?? 0
    return (
      <DesignCard
        icon={<Clock size={22} strokeWidth={2} />}
        title="Changes after Rejection"
        subtitle={<span className="font-bold uppercase" style={{ color: ERROR }}>{n} submission{n === 1 ? '' : 's'}</span>}
        info="What the client changed each time they corrected and resubmitted this booking after a rejection: the earlier value next to the updated one. Only fields that changed are listed."
      >
        {error && !revisions ? (
          <p className="text-sm" style={{ color: ERROR }}>{error}</p>
        ) : !revisions ? (
          <div className="flex items-center gap-2 text-sm text-[#818181]">
            <Loader2 size={14} className="animate-spin" /> Loading earlier values…
          </div>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-[#818181]">
            This booking was resubmitted before earlier values were kept, so there is nothing to compare.
          </p>
        ) : (
          <BookingRevisions revisions={revisions} />
        )}
      </DesignCard>
    )
  }

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
