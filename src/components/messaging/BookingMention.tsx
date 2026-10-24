'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { Loader2, Package } from 'lucide-react'
import { messagingService } from '@/lib/services/messaging.service'
import { bookingStatusColor } from '@/lib/palette'
import {
  activeMentionQuery, bookingStatusLabel, formatSchedule, insertMention, mentionedBookingRefs, splitMentions,
} from '@/lib/bookingMentions'
import type { BookingMentionDetails, MentionableBooking } from '@/app/types/messaging/messaging.types'

/* ── Details cache ───────────────────────────────────────────────────────────
 * Every message on screen asks for its mentioned bookings; one request per
 * short burst serves them all, and answers are kept for a minute. A booking
 * the reader may not see comes back missing and is cached as null.
 */

const TTL_MS   = 60_000
const BATCH_MS = 40
const cache    = new Map<string, { value: BookingMentionDetails | null; at: number }>()
const queued   = new Set<string>()
const inFlight = new Set<string>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null
let version = 0

function emit() { version++; listeners.forEach(l => l()) }

function flush() {
  timer = null
  const refs = [...queued].slice(0, 20)
  refs.forEach(r => { queued.delete(r); inFlight.add(r) })
  if (queued.size) timer = setTimeout(flush, BATCH_MS)
  if (!refs.length) return
  messagingService.getBookingMentionDetails(refs)
    .then(rows => {
      const now = Date.now()
      for (const ref of refs) cache.set(ref, { value: rows.find(r => r.reference_number === ref) ?? null, at: now })
    })
    .catch(() => {
      // Leave them uncached so the next render tries again.
    })
    .finally(() => { refs.forEach(r => inFlight.delete(r)); emit() })
}

function request(refs: string[]) {
  const now = Date.now()
  for (const ref of refs) {
    const hit = cache.get(ref)
    if ((hit && now - hit.at < TTL_MS) || inFlight.has(ref)) continue
    queued.add(ref)
  }
  if (queued.size && !timer) timer = setTimeout(flush, BATCH_MS)
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

function useMentionDetails(refs: string[]): BookingMentionDetails[] {
  const key = refs.join(',')
  useEffect(() => { if (key) request(key.split(',')) }, [key])
  const v = useSyncExternalStore(subscribe, () => version, () => 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => refs.map(r => cache.get(r)?.value).filter((d): d is BookingMentionDetails => !!d), [key, v])
}

/* ── In a message ──────────────────────────────────────────────────────── */

/** Message text with each booking number picked out. */
export function MentionText({ text }: { text: string }) {
  const parts = splitMentions(text)
  if (parts.length === 1 && !parts[0].ref) return <>{text}</>
  return (
    <>
      {parts.map((p, i) => p.ref
        ? <span key={i} className="rounded bg-[var(--color-cyan)]/10 px-0.5 font-medium text-[var(--color-cyan)]">{p.text}</span>
        : <span key={i}>{p.text}</span>)}
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = bookingStatusColor(status)
  return (
    <span
      className="ff-body inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {bookingStatusLabel(status)}
    </span>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-white/45">{label}</dt>
      <dd className="min-w-0 text-white/85 [overflow-wrap:anywhere]">{children}</dd>
    </>
  )
}

/** The important details of one mentioned booking. */
export function BookingMentionCard({ booking, compact = false }: { booking: BookingMentionDetails; compact?: boolean }) {
  const schedule = formatSchedule(booking.schedule_date, booking.call_time)
  return (
    <aside className={`ff-body flex w-full flex-col gap-2 rounded-lg bg-[var(--color-bg)] ring-1 ring-white/[0.08] ring-inset ${compact ? 'p-2.5 text-xs' : 'p-3 text-sm'}`}>
      <header className="flex flex-wrap items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-cyan)]/10 text-[var(--color-cyan)]">
          <Package size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-white">{booking.reference_number}</span>
        <StatusBadge status={booking.status} />
      </header>
      {booking.limited ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 leading-snug">
          {schedule && <Row label="Schedule">{schedule}</Row>}
          <dd className="col-span-2 text-white/40">You aren&apos;t on this booking, so only its status and schedule show.</dd>
        </dl>
      ) : (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 leading-snug">
        {booking.company_name && <Row label="Client">{booking.company_name}</Row>}
        {schedule && <Row label="Schedule">{schedule}</Row>}
        {booking.origin && <Row label="Pickup">{booking.origin}</Row>}
        {booking.drop_offs.length > 0 && (
          <Row label={booking.drop_offs.length > 1 ? `Drop-offs (${booking.drop_offs.length})` : 'Drop-off'}>
            {booking.drop_offs.length === 1
              ? booking.drop_offs[0]
              : <ol className="list-decimal space-y-0.5 pl-4">{booking.drop_offs.map((a, i) => <li key={i}>{a}</li>)}</ol>}
          </Row>
        )}
        <Row label="Vehicle">{booking.vehicle ?? <span className="text-white/40">Not assigned yet</span>}</Row>
        <Row label={booking.drivers.length > 1 ? 'Drivers' : 'Driver'}>
          {booking.drivers.length ? booking.drivers.join(', ') : <span className="text-white/40">Not assigned yet</span>}
        </Row>
      </dl>
      )}
    </aside>
  )
}

/** The cards for every booking a message mentions that the reader may see. */
export function BookingMentionCards({ text, alignEnd, compact }: { text: string; alignEnd?: boolean; compact?: boolean }) {
  const refs    = useMemo(() => mentionedBookingRefs(text), [text])
  const details = useMentionDetails(refs)
  if (!details.length) return null
  return (
    <div className={`flex w-full max-w-[380px] flex-col gap-1.5 ${alignEnd ? 'self-end' : 'self-start'}`}>
      {details.map(b => <BookingMentionCard key={b.booking_id} booking={b} compact={compact} />)}
    </div>
  )
}

/* ── In the composer ───────────────────────────────────────────────────── */

/**
 * Typing "@" opens the list of bookings the user may see; more letters or
 * digits narrow it. Arrow keys move, Enter / Tab picks, Esc closes.
 */
export function useBookingMentionPicker(
  value: string,
  setValue: (next: string) => void,
  field: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
) {
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [items, setItems]     = useState<MentionableBooking[]>([])
  // The query the current items answer; anything else is still loading.
  const [itemsFor, setItemsFor] = useState<string | null>(null)
  const [active, setActive]   = useState(0)

  /** Re-reads the "@…" before the caret; call on every change and caret move. */
  const sync = useCallback(() => {
    const el = field.current
    if (!el) return
    setMention(activeMentionQuery(el.value, el.selectionStart ?? el.value.length))
  }, [field])

  const query = mention?.query ?? null
  useEffect(() => {
    if (query === null) return
    let stale = false
    const t = setTimeout(() => {
      messagingService.searchMentionableBookings(query)
        .then(rows => { if (!stale) { setItems(rows); setActive(0); setItemsFor(query) } })
        .catch(() => { if (!stale) { setItems([]); setItemsFor(query) } })
    }, 200)
    return () => { stale = true; clearTimeout(t) }
  }, [query])

  const close = useCallback(() => setMention(null), [])

  const pick = useCallback((b: MentionableBooking) => {
    const el = field.current
    if (!el || !mention) return
    const caret = el.selectionStart ?? value.length
    const next  = insertMention(value, mention.start, caret, b.reference_number)
    setValue(next.text)
    setMention(null)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(next.caret, next.caret) })
  }, [field, mention, value, setValue])

  /** True when the key was the picker's, so the field must not also act on it. */
  const onKeyDown = useCallback((e: KeyboardEvent): boolean => {
    if (!mention) return false
    if (e.key === 'Escape') { e.preventDefault(); close(); return true }
    if (!items.length) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % items.length); return true }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => (i - 1 + items.length) % items.length); return true }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[active] ?? items[0]); return true }
    return false
  }, [mention, items, active, pick, close])

  const loading = query !== null && itemsFor !== query

  return { open: mention !== null, items, loading, active, setActive, pick, close, sync, onKeyDown }
}

/** The list above the composer. Place inside a `relative` box. */
export function BookingMentionMenu({ picker }: { picker: ReturnType<typeof useBookingMentionPicker> }) {
  if (!picker.open) return null
  return (
    <div
      role="listbox"
      aria-label="Mention a booking"
      className="ff-body absolute inset-x-0 bottom-full z-40 mb-2 overflow-hidden rounded-xl bg-[#161616] shadow-2xl ring-1 ring-white/10"
    >
      <p className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-xs font-medium text-white/45">
        Mention a booking
        {picker.loading && <Loader2 size={12} className="animate-spin" />}
      </p>
      <ul className="max-h-60 overflow-y-auto overscroll-contain py-1">
        {!picker.loading && picker.items.length === 0 && (
          <li className="px-3 py-3 text-sm text-white/40">No bookings match.</li>
        )}
        {picker.items.map((b, i) => {
          const schedule = formatSchedule(b.schedule_date, null)
          return (
            <li key={b.booking_id} role="option" aria-selected={i === picker.active}>
              <button
                type="button"
                // Keep the caret in the field while choosing.
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => picker.setActive(i)}
                onClick={() => picker.pick(b)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${i === picker.active ? 'bg-white/[0.07]' : ''}`}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: bookingStatusColor(b.status) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{b.reference_number}</span>
                  <span className="block truncate text-xs text-white/45">
                    {[b.company_name, bookingStatusLabel(b.status), schedule].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
