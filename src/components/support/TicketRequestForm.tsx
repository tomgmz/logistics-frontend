'use client'

import { useEffect, useState } from 'react'
import { useFormGuard } from '@/lib/hooks/useFormGuard'
import { Loader2, Send } from 'lucide-react'
import authApi from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
import { getApiErrorMessage } from '@/lib/api-error'
import { bookingRef } from '@/lib/booking'
import { cachedFetch } from '@/lib/query/useApiQuery'
import Dropdown from '@/components/ui/Dropdown'
import Combobox from '@/components/ui/Combobox'
import { FieldError, errorBorder } from '@/components/ui/FieldError'
import { supportService, TICKET_CATEGORY_LABEL, type SupportTicket, type TicketCategory } from '@/lib/services/support.service'

/**
 * "Submit a ticket" (user 2026-11-22, Zendesk's "Submit a request" next to
 * chat): a client files a formal request themselves (a complaint, a claim,
 * damaged goods). Same server rules as before: up to 5 open tickets, a copy is
 * emailed, replies continue by email. Not linked to conversations.
 */

interface BookingOption { booking_id: string; label: string }

export default function TicketRequestForm({ onCancel, onDone }: {
  onCancel: () => void
  onDone:   (ticket: SupportTicket) => void
}) {
  const user = useAuthStore((s) => s.user)
  const [category,  setCategory]  = useState<TicketCategory>('other')
  const [bookingId, setBookingId] = useState('')
  const [subject,   setSubject]   = useState('')
  const [details,   setDetails]   = useState('')
  const [bookings,  setBookings]  = useState<BookingOption[]>([])
  const [sending,   setSending]   = useState(false)
  const [tried,     setTried]     = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Send pressed: problems show under their fields, live.
  const errors = {
    subject: subject.trim().length < 3 ? 'Add a short subject.' : undefined,
    details: details.trim().length < 10 ? 'Describe the problem in a sentence or two.' : undefined,
  }
  const shown: Partial<typeof errors> = tried ? errors : {}

  // The client's bookings, for "which booking is this about?".
  useEffect(() => {
    const clientId = user?.clients?.client_id
    if (!clientId) return
    type Row = { booking_id: string; reference_number?: string | null; schedule_date?: string | null; status: string }
    const apply = (rows: Row[]) => setBookings(rows.slice(0, 30).map((b) => ({
      booking_id: b.booking_id,
      label: `${bookingRef(b)}${b.schedule_date ? ` · ${b.schedule_date}` : ''} · ${b.status.replace(/_/g, ' ')}`,
    })))
    cachedFetch(['help', 'ticket-bookings', clientId],
      async () => ((await authApi.get(`/booking/client/${clientId}`)).data?.data ?? []) as Row[], apply)
      .then(apply)
      .catch(() => setBookings([]))
  }, [user])

  // Anything typed: Cancel asks first, and Submit asks once more (user 2026-11-27).
  const guard = useFormGuard(category !== 'other' || !!bookingId || !!subject.trim() || !!details.trim(), { zClassName: 'z-[200]' })

  function requestSubmit() {
    setTried(true)
    if (errors.subject || errors.details) return
    guard.confirmSubmit(() => void submit(), {
      title:        'Submit this ticket?',
      description:  'Our team will reply by email.',
      confirmLabel: 'Submit ticket',
    })
  }

  async function submit() {
    setSending(true)
    setError(null)
    try {
      const ticket = await supportService.open({
        category, subject: subject.trim(), message: details.trim(), booking_id: bookingId || null,
      })
      onDone(ticket)
    } catch (e) {
      setError(getApiErrorMessage(e, 'The ticket could not be sent. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2.5 text-[14px] text-white outline-none focus:border-[var(--color-cyan)]/50'
  const label = 'text-[13px] font-bold text-white/60'

  return (
    <form onSubmit={(e) => { e.preventDefault(); requestSubmit() }} className="flex min-h-0 flex-1 flex-col">
      {guard.modal}
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
        <p className="text-[14px] leading-snug text-white/50">
          For something that needs a formal record, like a complaint, a claim or damaged goods. Our team replies by
          email{user?.email ? ` to ${user.email}` : ''}. For a quick question, ask in Messages instead.
        </p>
        <label className="block">
          <span className={label}>Topic</span>
          <Dropdown value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)} className={field}>
            {(Object.keys(TICKET_CATEGORY_LABEL) as TicketCategory[]).map((c) => (
              <option key={c} value={c}>{TICKET_CATEGORY_LABEL[c]}</option>
            ))}
          </Dropdown>
        </label>
        <label className="block">
          <span className={label}>Booking (optional)</span>
          <Combobox value={bookingId} onChange={(e) => setBookingId(e.target.value)} className={field}>
            <option value="">Not about a specific booking</option>
            {bookings.map((b) => <option key={b.booking_id} value={b.booking_id}>{b.label}</option>)}
          </Combobox>
        </label>
        <label className="block">
          <span className={label}>Subject</span>
          <input id="ticket-subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)}
            maxLength={150} aria-invalid={!!shown.subject} className={`${field} ${errorBorder(shown.subject)}`} />
          <FieldError>{shown.subject}</FieldError>
        </label>
        <label className="block">
          <span className={label}>What happened?</span>
          <textarea id="ticket-details" name="details" value={details} onChange={(e) => setDetails(e.target.value)}
            rows={5} maxLength={4000} aria-invalid={!!shown.details} className={`${field} resize-none ${errorBorder(shown.details)}`} />
          <FieldError>{shown.details}</FieldError>
        </label>
        {/* Not about one field (the 5-open-tickets limit, the server): a box. */}
        {error && <p role="alert" className="rounded-lg border border-[#F62626]/30 bg-[#F62626]/[0.06] px-3 py-2 text-[13px] text-[#F62626]">{error}</p>}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-white/[0.07] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => guard.requestClose(onCancel)} disabled={sending}
          className="rounded-lg border border-white/10 px-3.5 py-2 text-[14px] text-white/70 hover:bg-white/5">Cancel</button>
        <button type="submit" disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-cyan)] px-3.5 py-2 text-[14px] font-bold text-[#0a0a0a] disabled:opacity-50">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit ticket
        </button>
      </div>
    </form>
  )
}
