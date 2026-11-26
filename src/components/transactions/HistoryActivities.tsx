'use client'

import { useEffect, useId, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { PALETTE } from '@/lib/palette'
import { roleLabel } from '@/lib/roles'
import { cachedData, cachedFetch } from '@/lib/query/useApiQuery'
import { bookingService, type BookingRevision } from '@/lib/services/client/booking.service'
import type { BookingHistory, HistoryItem } from '@/lib/services/admin/transaction-history.service'
import { usePanelSection } from '@/components/ui/PanelReady'
import { resubmissionHistoryItems } from './ResubmissionChanges'
import { formatDate, formatDateTime } from './transaction-format'
import { ProofRow } from '@/app/admin/booking-management/DeliveryStopsCard'
import proxyApi from '@/lib/api/auth.api'
import { useLiveTable } from '@/lib/hooks/useLiveTable'

/**
 * The History section of a transaction (Figma "transaction_history/History",
 * 2026-11-26): Approvals, Transaction Activities and Transit Activities, each a
 * heading that opens and closes over a framed list of cards, oldest first.
 *
 * The cards come from the record (backend booking-history.service.ts); the
 * "Booking Denied (Resubmission)" cards are built here from the booking's
 * revisions, which only the web knows how to compare.
 */

const MUTED = '#818181'
const TONE = { yellow: PALETTE.yellow, orange: PALETTE.orange, red: PALETTE.red } as const

function Person({ name, role }: { name: string | null; role: string | null }) {
  const position = role === 'client' ? 'Client' : role ? roleLabel(role) : null
  return (
    <span className="flex flex-col items-end text-right min-w-0">
      <span className="text-sm font-bold text-white break-words">{name ?? (position ? `The ${position}` : 'Not recorded')}</span>
      {name && position && <span className="text-[10px] font-bold text-white/80">{position}</span>}
    </span>
  )
}

function ItemList({ title, rows, collapsible }: {
  title: string; rows: Array<{ label: string; value: string }>; collapsible: boolean
}) {
  const [open, setOpen] = useState(true)
  const id = useId()
  return (
    <div className="flex flex-col">
      {collapsible ? (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
          className="self-start inline-flex items-center gap-1 text-sm font-bold text-white cursor-pointer">
          {title}
          {open
            ? <ChevronUp size={14} style={{ color: PALETTE.cyan }} />
            : <ChevronDown size={14} style={{ color: PALETTE.cyan }} />}
        </button>
      ) : (
        <span className="text-sm font-bold text-white">{title}:</span>
      )}
      <div id={id} hidden={collapsible && !open} className="mt-1.5 -mx-3.5">
        {rows.map((r, i) => (
          <div key={i} className={`flex items-start justify-between gap-3 px-3.5 py-2 ${i > 0 ? 'border-t-[0.5px] border-[#818181]' : ''}`}>
            <span className="text-sm font-bold min-w-0 break-words" style={{ color: MUTED }}>{r.label}</span>
            <span className="text-sm font-bold text-white text-right break-words max-w-[55%]">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoryCard({ item }: { item: HistoryItem }) {
  const when = item.at ? (item.withTime ? formatDateTime(item.at) : formatDate(item.at)) : null
  const lines = item.lines ?? []
  return (
    <li className="rounded-[10px] bg-[#1b1b1b] px-3.5 pt-3 pb-3.5 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-bold leading-tight min-w-0" style={{ color: PALETTE.cyan }}>{item.title}</span>
        {when && <span className="shrink-0 text-[11px] font-bold" style={{ color: MUTED }}>{when}</span>}
      </div>

      {/* The first line sits next to the person ("Assigned driver was replaced.  [Name]"). */}
      {(item.by || lines.length > 0) && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            {item.by?.label && <span className="text-sm font-bold text-white">{item.by.label}</span>}
            {lines.map((l, i) => (
              <span key={i} className="text-sm font-bold text-white break-words whitespace-pre-wrap">
                {l}
                {i === lines.length - 1 && item.accent && (
                  <> <span style={{ color: PALETTE.yellow }}>{item.accent}</span>.</>
                )}
              </span>
            ))}
          </div>
          {item.by && <Person name={item.by.name} role={item.by.role} />}
        </div>
      )}

      {item.place && (
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-bold text-white shrink-0">{item.place.label}</span>
          <span className="flex flex-col items-end text-right min-w-0">
            <span className="text-sm font-bold text-white break-words">{item.place.address}</span>
            {item.place.kind && <span className="text-[10px] font-bold uppercase" style={{ color: MUTED }}>{item.place.kind}</span>}
            {item.late && <span className="text-[10px] font-bold uppercase" style={{ color: PALETTE.orange }}>{item.late}</span>}
          </span>
        </div>
      )}

      {item.remarks && (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white">Remarks:</span>
          <span className="text-sm text-white/90 break-words whitespace-pre-wrap">{item.remarks}</span>
        </div>
      )}

      {item.list && item.list.rows.length > 0 && (
        <ItemList title={item.list.title} rows={item.list.rows} collapsible={item.list.title !== 'Changes'} />
      )}

      {item.photo && <ProofRow url={item.photo.url} label={item.photo.label} at={item.at} />}
      {item.trip && <span className="text-[11px] font-bold" style={{ color: MUTED }}>{item.trip}</span>}
      {item.note && (
        <span className="text-[11px] font-bold leading-snug" style={{ color: TONE[item.note.tone] }}>{item.note.text}</span>
      )}
    </li>
  )
}

function Group({ title, items, empty }: { title: string; items: HistoryItem[]; empty: string }) {
  const [open, setOpen] = useState(true)
  const id = useId()
  return (
    <section className="flex flex-col gap-2">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-3 py-1 text-left cursor-pointer">
        <span className="text-sm font-bold uppercase text-white">{title}</span>
        <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} style={{ color: PALETTE.cyan }} />
      </button>
      <div id={id} hidden={!open} className="rounded-[15px] border border-[#424242] bg-[#232121] p-2.5">
        {items.length === 0
          ? <p className="px-1 py-1.5 text-sm" style={{ color: MUTED }}>{empty}</p>
          : <ul className="flex flex-col gap-2.5">{items.map((it) => <HistoryCard key={it.key} item={it} />)}</ul>}
      </div>
    </section>
  )
}

export default function HistoryActivities({ bookingId, history, resubmissionCount }: {
  bookingId: string
  /** undefined while loading; null when it could not be read. */
  history:   BookingHistory | null | undefined
  resubmissionCount?: number | null
}) {
  const resubmitted = (resubmissionCount ?? 0) > 0
  const [revisions, setRevisions] = useState<BookingRevision[] | null>(resubmitted ? null : [])
  usePanelSection(revisions === null)

  useEffect(() => {
    if (!resubmitted) return
    let cancelled = false
    // Same cache key as Changes after Rejection: one read for both.
    cachedFetch(['booking', bookingId, 'revisions'], () => bookingService.fetchBookingRevisions(bookingId),
      (rows) => { if (!cancelled) setRevisions(rows ?? []) })
      .then((rows) => { if (!cancelled) setRevisions(rows ?? []) })
      .catch(() => { if (!cancelled) setRevisions([]) })
    return () => { cancelled = true }
  }, [bookingId, resubmitted])

  // undefined = the record is still on its way.
  if (history === undefined) {
    return <p className="text-sm" style={{ color: MUTED }}>Loading the history…</p>
  }
  if (!history) {
    return <p className="text-sm" style={{ color: MUTED }}>The history could not be loaded. Try Refresh.</p>
  }

  const byTime = (a: HistoryItem, b: HistoryItem) => (Date.parse(a.at ?? '') || 0) - (Date.parse(b.at ?? '') || 0)
  const transaction = [...history.transaction, ...resubmissionHistoryItems(revisions ?? [])].sort(byTime)

  return (
    <div className="flex flex-col gap-4">
      <Group title="Approvals" items={history.approvals} empty="Not approved yet." />
      <Group title="Transaction Activities" items={transaction} empty="Nothing recorded yet." />
      <Group title="Transit Activities" items={history.transit} empty="The delivery has not started yet." />
    </div>
  )
}

/**
 * Booking Management's History section: the same cards, read through
 * /admin/assignments/:id/activity, which every Booking Management role can
 * reach (the Transaction History record is for that module's roles only).
 * Re-read when the booking or its reports change.
 */
export function BookingHistorySection({ bookingId, resubmissionCount }: {
  bookingId: string
  resubmissionCount?: number | null
}) {
  const [history, setHistory] = useState<BookingHistory | null | undefined>(
    () => cachedData<BookingHistory>(['booking', bookingId, 'activity']) ?? undefined)
  usePanelSection(history === undefined)

  const read = () => cachedFetch(['booking', bookingId, 'activity'],
    () => proxyApi.get<{ data: BookingHistory }>(`/admin/assignments/${bookingId}/activity`).then((r) => r.data.data))

  useEffect(() => {
    let cancelled = false
    read()
      .then((h) => { if (!cancelled) setHistory(h ?? null) })
      .catch(() => { if (!cancelled) setHistory((prev) => prev ?? null) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  useLiveTable(['live:bookings', 'live:driver_reports'], () => {
    read().then((h) => setHistory(h ?? null)).catch(() => {})
  }, { debounceMs: 1500 })

  return <HistoryActivities bookingId={bookingId} history={history} resubmissionCount={resubmissionCount} />
}
