'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X } from 'lucide-react'

import {
  supportService,
  TICKET_CATEGORY_LABEL,
  type TicketBookingOption,
  type TicketCategory,
  type TicketClientOption,
} from '@/lib/services/support.service'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'

const CATEGORIES = Object.keys(TICKET_CATEGORY_LABEL) as TicketCategory[]

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const LABEL = 'block text-[11px] font-bold uppercase tracking-wide text-white/45 mb-1.5'
// text-base on phones: iOS Safari zooms into any input under 16px.
const FIELD = 'w-full rounded-xl border border-white/10 bg-[#111] px-3 py-2.5 text-base sm:text-sm text-white/85 outline-none focus:border-[var(--color-cyan)]/50 disabled:opacity-50'

/**
 * The Company Administrator or Operations Manager opens a ticket for a client
 * who called, emailed or walked in. It is the same ticket a client opens from
 * the help assistant: emailed to the client (support inbox CC'd), listed in
 * their tickets, answered by Reply all, resolved here.
 */
export default function NewTicketModal({ open, onClose, onCreated }: {
  open:      boolean
  onClose:   () => void
  onCreated: () => void
}) {
  const [client,        setClient]        = useState<TicketClientOption | null>(null)
  const [clientQuery,   setClientQuery]   = useState('')
  const [clientOptions, setClientOptions] = useState<TicketClientOption[]>([])
  const [searching,     setSearching]     = useState(false)
  const [bookings,      setBookings]      = useState<TicketBookingOption[]>([])
  const [bookingId,     setBookingId]     = useState('')
  const [category,      setCategory]      = useState<TicketCategory>('delivery')
  const [subject,       setSubject]       = useState('')
  const [message,       setMessage]       = useState('')
  const [busy,          setBusy]          = useState(false)
  useBodyScrollLock(open)

  // Fresh form every time it opens.
  useEffect(() => {
    if (!open) return
    setClient(null)
    setClientQuery('')
    setBookingId('')
    setCategory('delivery')
    setSubject('')
    setMessage('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  // Debounced client search; empty lists the first clients alphabetically.
  useEffect(() => {
    if (!open || client) return
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      supportService.searchClients(clientQuery)
        .then((rows) => { if (!cancelled) setClientOptions(rows) })
        .catch(() => { if (!cancelled) setClientOptions([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [open, client, clientQuery])

  // The chosen client's recent bookings, for naming one.
  useEffect(() => {
    setBookings([])
    setBookingId('')
    if (!client) return
    let cancelled = false
    supportService.clientBookings(client.client_id)
      .then((rows) => { if (!cancelled) setBookings(rows) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [client])

  const canSubmit = !!client && subject.trim().length >= 3 && message.trim().length >= 10 && !busy

  async function submit() {
    if (!canSubmit || !client) return
    setBusy(true)
    try {
      const ticket = await supportService.openForClient({
        client_id:  client.client_id,
        category,
        subject:    subject.trim(),
        message:    message.trim(),
        booking_id: bookingId || null,
      })
      appToast.success(`${ticket.reference} opened for ${client.company_name ?? 'the client'}. It was emailed to them.`, {
        action: 'support-open', entityId: ticket.ticket_id,
      })
      onCreated()
      onClose()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Could not open the ticket.'), { action: 'support-open' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { if (!busy) onClose() }}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-ticket-title"
            className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
              <div className="min-w-0">
                <h2 id="new-ticket-title" className="text-base font-bold text-white">New Ticket</h2>
                <p className="text-[11px] text-white/40 mt-0.5">
                  For a client who called, emailed or came in. It is emailed to them, and you answer in that thread.
                </p>
              </div>
              <button type="button" disabled={busy} onClick={onClose} className="p-2 rounded-lg text-white/50 shrink-0 [@media(hover:hover)]:hover:bg-white/5" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto min-h-0">
              {/* Client */}
              <div>
                <span className={LABEL}>Client<span className="text-red-400"> *</span></span>
                {client ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-cyan)]/35 bg-[rgba(77,249,237,0.06)] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{client.company_name ?? 'Unnamed client'}</p>
                      <p className="truncate text-[11px] text-white/45">
                        {[client.contact_name, client.email].filter(Boolean).join(' · ') || 'No contact on file'}
                      </p>
                    </div>
                    <button type="button" disabled={busy} onClick={() => setClient(null)} className="text-xs font-semibold text-[var(--color-cyan)] shrink-0 [@media(hover:hover)]:hover:underline">
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
                      <Search size={14} className="text-white/35 shrink-0" />
                      <input
                        value={clientQuery}
                        onChange={(e) => setClientQuery(e.target.value)}
                        placeholder="Search company, contact name or email…"
                        aria-label="Search clients"
                        className="bg-transparent outline-none text-base sm:text-sm flex-1 min-w-0 text-white/85 placeholder:text-white/30"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {searching && clientOptions.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-white/40">Searching…</p>
                      ) : clientOptions.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-white/40">No clients match.</p>
                      ) : clientOptions.map((o) => (
                        <button
                          key={o.client_id}
                          type="button"
                          onClick={() => setClient(o)}
                          className="w-full text-left px-3 py-2 [@media(hover:hover)]:hover:bg-white/5"
                        >
                          <span className="block truncate text-sm text-white/85">{o.company_name ?? 'Unnamed client'}</span>
                          <span className="block truncate text-[11px] text-white/40">
                            {[o.contact_name, o.email].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Booking (optional) */}
              <div>
                <label htmlFor="ticket-booking" className={LABEL}>
                  Booking <span className="normal-case font-normal text-white/30">(optional)</span>
                </label>
                <select
                  id="ticket-booking"
                  value={bookingId}
                  disabled={busy || !client}
                  onChange={(e) => setBookingId(e.target.value)}
                  className={FIELD}
                >
                  <option value="">{client ? (bookings.length ? 'Not about one booking' : 'This client has no bookings') : 'Choose a client first'}</option>
                  {bookings.map((b) => (
                    <option key={b.booking_id} value={b.booking_id}>
                      {(b.reference_number ?? b.booking_id.slice(0, 8))} · {titleCase(b.status)}{b.schedule_date ? ` · ${b.schedule_date}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label htmlFor="ticket-category" className={LABEL}>Topic</label>
                <select
                  id="ticket-category"
                  value={category}
                  disabled={busy}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  className={FIELD}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{TICKET_CATEGORY_LABEL[c]}</option>)}
                </select>
              </div>

              {/* Subject + message */}
              <div>
                <label htmlFor="ticket-subject" className={LABEL}>Subject<span className="text-red-400"> *</span></label>
                <input
                  id="ticket-subject"
                  value={subject}
                  disabled={busy}
                  maxLength={150}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Drop-off address needs changing"
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="ticket-message" className={LABEL}>What the client told us<span className="text-red-400"> *</span></label>
                <textarea
                  id="ticket-message"
                  value={message}
                  disabled={busy}
                  maxLength={4000}
                  rows={5}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="At least a sentence or two. The client sees this in the email."
                  className={`${FIELD} resize-none`}
                />
              </div>
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-white/[0.07] shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/10 text-white/50 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void submit()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-[#0a0a0a] disabled:opacity-40"
                style={{ background: 'var(--color-cyan)' }}
              >
                {busy ? 'Opening…' : 'Open and email client'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
