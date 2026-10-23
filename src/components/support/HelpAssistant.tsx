'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot, CheckCircle2, ChevronRight, LifeBuoy, Loader2, MessageCircleQuestion, Send, Ticket, X,
} from 'lucide-react'
import { useClientMessages, ClientMessagesPanel } from './ClientMessages'

import authApi from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { getApiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/app/utils/timeFormat'
import { bookingRef } from '@/lib/booking'
import { matchFaq, CONFIDENT_SCORE, STARTER_QUESTIONS, PUBLIC_STARTER_QUESTIONS, type FaqEntry } from '@/lib/support/faq'
import {
  supportService, TICKET_CATEGORY_LABEL, OPEN_HELP_EVENT,
  type ChatLine, type HelpTab, type SupportTicket, type TicketCategory,
} from '@/lib/services/support.service'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

/**
 * The help assistant: an FAQ chatbot, and a ticket to our team when it can't
 * help. Tickets are for signed-in clients only.
 *
 *   audience="client"  the client portal (layout): answers + tickets
 *   audience="public"  the landing page: answers for anyone; when it can't
 *                      help, a visitor is sent to the contact form (also
 *                      answered by email), while a signed-in client still
 *                      gets a ticket
 *
 * The bot answers from the curated FAQ (lib/support/faq). When nothing matches,
 * or the client says the answer didn't help, it offers a ticket. The ticket
 * carries the conversation so staff see what was already suggested, and is
 * answered by email.
 *
 * In the portal it is also the client's inbox (the "Messages" tab, see
 * ClientMessages): their driver and our team write to them here, and the
 * header's message icon opens it instead of the staff messenger.
 */

interface Msg {
  id:    number
  from:  'client' | 'bot'
  text:  string
  /** The FAQ answer this message is, for its link and the "did this help?" buttons. */
  faq?:  FaqEntry
  /** Suggested questions, offered as buttons. */
  suggestions?: FaqEntry[]
  /** Offer the "talk to our team" button under this message. */
  offerTicket?: boolean
}

interface BookingOption { booking_id: string; label: string }

const noopSubscribe = () => () => {}

const GREETING =
  'Hi! I\'m the 8338 help assistant. Ask me about bookings, tracking, deliveries or your account, ' +
  'or pick a common question below. If I can\'t help, I\'ll pass you to our team.'

const PUBLIC_GREETING =
  'Hi! I\'m the 8338 help assistant. Ask me about our delivery service, how to become a client, or how ' +
  'booking and tracking work. If I can\'t help, I\'ll point you to our team.'

export default function HelpAssistant({ audience = 'client' }: { audience?: 'client' | 'public' }) {
  const user      = useAuthStore((s) => s.user)
  const pathname  = usePathname()
  const mounted   = useSyncExternalStore(noopSubscribe, () => true, () => false)
  // Tickets need a client account; a visitor is pointed to the contact form.
  const canTicket = user?.role === 'client'
  const isPublic  = audience === 'public'

  const [open, setOpen] = useState(false)
  const [tab,  setTab]  = useState<HelpTab>('chat')
  // Below `sm` the panel is full-screen; keep the page under it still (iOS).
  const isMobile = useIsMobile()
  useBodyScrollLock(open && isMobile)
  const inbox = useClientMessages(!isPublic && canTicket ? user?.user_id : undefined, open && tab === 'messages')
  const { openConversation } = inbox

  const nextId = useRef(1)
  const [messages, setMessages] = useState<Msg[]>(() => [
    isPublic && !canTicket
      ? { id: 0, from: 'bot', text: PUBLIC_GREETING, suggestions: PUBLIC_STARTER_QUESTIONS }
      : { id: 0, from: 'bot', text: GREETING, suggestions: STARTER_QUESTIONS },
  ])
  const [input, setInput] = useState('')
  const [helped, setHelped] = useState<Record<number, boolean>>({})
  // Where the common questions are offered: under the greeting (null) until the
  // client answers "Did this answer it?" (Yes or No), and again once a ticket is
  // sent. Each time they move to just below that message, the bottom of the
  // chat at that moment, ready for the next question.
  const [questionsAfter, setQuestionsAfter] = useState<number | null>(null)

  // Ticket form, shown inside the chat when the client asks for a person.
  const [ticketOpen, setTicketOpen] = useState(false)
  const [category,   setCategory]   = useState<TicketCategory>('other')
  const [subject,    setSubject]    = useState('')
  const [details,    setDetails]    = useState('')
  const [bookingId,  setBookingId]  = useState('')
  const [bookings,   setBookings]   = useState<BookingOption[]>([])
  const [sending,    setSending]    = useState(false)
  const [formError,  setFormError]  = useState<string | null>(null)

  const [tickets,        setTickets]        = useState<SupportTicket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)

  const scroller = useRef<HTMLDivElement>(null)

  const push = useCallback((m: Omit<Msg, 'id'>) => {
    setMessages((prev) => [...prev, { ...m, id: nextId.current++ }])
  }, [])

  // Opened from elsewhere in the portal (the dashboard's help card).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: HelpTab; conversationId?: string }>).detail
      setOpen(true)
      setTab(detail?.tab ?? 'chat')
      if (detail?.conversationId) void openConversation(detail.conversationId)
    }
    window.addEventListener(OPEN_HELP_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_HELP_EVENT, onOpen)
  }, [openConversation])

  // Arrived from /messages, a push tap (clientMessagesHref) or a ticket
  // notification (?chat=tickets): open that tab.
  useEffect(() => {
    if (isPublic) return
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('chat')
    if (wanted !== 'messages' && wanted !== 'tickets') return
    setOpen(true)
    setTab(wanted)
    const conversationId = params.get('conversation')
    if (conversationId) void openConversation(conversationId)
    params.delete('chat')
    params.delete('conversation')
    const rest = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
  }, [isPublic, openConversation])

  // A press anywhere outside the panel (or Escape) closes it, so other UI that
  // opens over the page isn't left sitting under or behind the chat. Presses
  // inside are flagged through React's tree, so the panel's own portaled
  // dialogs (the photo send dialog) still count as inside.
  const pressedInside = useRef(false)
  const markInside = useCallback(() => { pressedInside.current = true }, [])
  useEffect(() => {
    if (!open) return
    // The launcher press that opened the panel flagged itself; drop it.
    pressedInside.current = false
    const onPointerDown = () => {
      if (!pressedInside.current) setOpen(false)
      pressedInside.current = false
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages, ticketOpen])

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true)
    try { setTickets(await supportService.mine()) } catch { /* keep the last list */ }
    finally { setTicketsLoading(false) }
  }, [])

  useEffect(() => { if (open && tab === 'tickets') void loadTickets() }, [open, tab, loadTickets])
  useLiveTable(['live:support_tickets'], () => { void loadTickets() }, { enabled: open && tab === 'tickets' })

  // The client's bookings, for "which booking is this about?".
  useEffect(() => {
    if (!ticketOpen || bookings.length > 0) return
    const clientId = user?.clients?.client_id
    if (!clientId) return
    authApi.get(`/booking/client/${clientId}`)
      .then((res) => {
        const rows = (res.data?.data ?? []) as Array<{ booking_id: string; reference_number?: string | null; schedule_date?: string | null; status: string }>
        setBookings(rows.slice(0, 30).map((b) => ({
          booking_id: b.booking_id,
          label: `${bookingRef(b)}${b.schedule_date ? ` · ${b.schedule_date}` : ''} · ${b.status.replace(/_/g, ' ')}`,
        })))
      })
      .catch(() => setBookings([]))
  }, [ticketOpen, bookings.length, user])

  const answer = useCallback((entry: FaqEntry) => {
    push({ from: 'bot', text: entry.answer, faq: entry })
  }, [push])

  const ask = useCallback((text: string) => {
    const q = text.trim()
    if (!q) return
    push({ from: 'client', text: q })
    setInput('')

    const matches = matchFaq(q, 3, !canTicket)
    const best    = matches[0]
    if (best && best.score >= CONFIDENT_SCORE) {
      answer(best.entry)
    } else if (matches.length > 0) {
      push({
        from: 'bot',
        text: 'I\'m not completely sure what you mean. Is it one of these?',
        suggestions: matches.map((m) => m.entry),
        offerTicket: true,
      })
    } else {
      push({
        from: 'bot',
        text: canTicket
          ? 'Sorry, I don\'t have an answer for that. Our team can help: open a ticket and they will reply by email.'
          : 'Sorry, I don\'t have an answer for that. Our team can help: send them a message and they will reply by email.',
        offerTicket: true,
      })
    }
  }, [answer, push, canTicket])

  const pick = useCallback((entry: FaqEntry) => {
    push({ from: 'client', text: entry.question })
    answer(entry)
  }, [answer, push])

  const startTicket = useCallback(() => {
    const asked    = messages.filter((m) => m.from === 'client').map((m) => m.text)
    const lastFaq  = [...messages].reverse().find((m) => m.faq)?.faq
    setCategory(lastFaq?.category ?? 'other')
    setSubject((asked[0] ?? '').slice(0, 120))
    setDetails(asked.join('\n'))
    setFormError(null)
    setTicketOpen(true)
  }, [messages])

  const submitTicket = useCallback(async () => {
    if (subject.trim().length < 3)  { setFormError('Add a short subject.'); return }
    if (details.trim().length < 10) { setFormError('Describe the problem in a sentence or two.'); return }
    setSending(true)
    setFormError(null)
    try {
      const transcript: ChatLine[] = messages
        .filter((m) => m.id !== 0)
        .map((m) => ({ from: m.from, text: m.text }))
      const ticket = await supportService.open({
        category, subject: subject.trim(), message: details.trim(),
        booking_id: bookingId || null, transcript,
      })
      setTicketOpen(false)
      setQuestionsAfter(nextId.current)
      push({
        from: 'bot',
        text: `Done — ticket ${ticket.reference} is open. We emailed you a copy${user?.email ? ` at ${user.email}` : ''}. ` +
              'Our team will reply by email; you can follow it under My tickets.',
      })
      setBookingId('')
    } catch (e) {
      setFormError(getApiErrorMessage(e, 'The ticket could not be sent. Please try again.'))
    } finally {
      setSending(false)
    }
  }, [subject, details, messages, category, bookingId, push, user?.email])

  const openCount = useMemo(() => tickets.filter((t) => t.status === 'open').length, [tickets])

  /** A visitor can't open a ticket: take them to the contact form instead. */
  const toContactForm = useCallback(() => {
    setOpen(false)
    const el = document.getElementById('contact')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    else window.location.href = '/#contact'
  }, [])

  if (!mounted) return null
  if (!isPublic && !canTicket) return null

  // On Transit Tracking the map has its own button bottom-right on phones.
  const lift = pathname?.startsWith('/client/tracking') ? 'bottom-20 lg:bottom-5' : 'bottom-5'

  const launcher = (
    <motion.button
      type="button"
      onClick={() => setOpen((o) => !o)}
      onPointerDownCapture={markInside}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={open ? 'Close help' : inbox.totalUnread > 0 ? `Help and messages, ${inbox.totalUnread} unread` : 'Help and messages'}
      className={`fixed right-5 ${lift} z-[58] flex items-center justify-center rounded-full shadow-xl`}
      style={{ width: 52, height: 52, background: 'var(--color-cyan)', color: '#0a0a0a', boxShadow: '0 10px 30px rgba(77,249,237,0.25)' }}
    >
      {open ? <X size={22} /> : <MessageCircleQuestion size={24} />}
      {!open && inbox.totalUnread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-[#0d0d0d] bg-red-500 px-1 text-[10px] font-bold text-white">
          {inbox.totalUnread > 9 ? '9+' : inbox.totalUnread}
        </span>
      )}
    </motion.button>
  )

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Help assistant"
          onPointerDownCapture={markInside}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="ff-chat fixed inset-0 z-[59] flex flex-col overflow-hidden bg-[#0d0d0d] sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(620px,calc(100dvh-120px))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-white/[0.08] sm:shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(77,249,237,0.12)', color: 'var(--color-cyan)' }}>
                <LifeBuoy size={16} />
              </span>
              <div>
                <p className="text-sm font-bold text-white">Help &amp; support</p>
                <p className="text-[11px] text-white/40">
                  {tab === 'messages' && canTicket ? 'Your driver and our team' : 'Answers right away · our team replies by email'}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Tabs — "My tickets" only for a signed-in client */}
          {canTicket && (
          <div className="flex border-b border-white/[0.07] px-2" role="tablist">
            {([['chat', 'Assistant'], ['messages', 'Messages'], ['tickets', 'My tickets']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`relative px-3 py-2.5 text-xs font-bold transition-colors ${tab === key ? 'text-[var(--color-cyan)]' : 'text-white/50 hover:text-white/80'}`}
              >
                {label}
                {key === 'messages' && inbox.totalUnread > 0 && (
                  <span className="ml-1.5 rounded-full bg-[var(--color-cyan)] px-1.5 text-[10px] font-bold tabular-nums text-[#0a0a0a]">{inbox.totalUnread}</span>
                )}
                {key === 'tickets' && openCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums text-white/70">{openCount}</span>
                )}
                {tab === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--color-cyan)]" />}
              </button>
            ))}
          </div>
          )}

          {tab === 'messages' && canTicket && user ? (
            <ClientMessagesPanel state={inbox} userId={user.user_id} onAskAssistant={() => setTab('chat')} />
          ) : tab === 'chat' || !canTicket ? (
            <>
              <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((m) => (
                  <Fragment key={m.id}>
                  <div className={`flex ${m.from === 'client' ? 'justify-end' : 'justify-start'} gap-2`}>
                    {m.from === 'bot' && (
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-cyan)]">
                        <Bot size={13} />
                      </span>
                    )}
                    <div className={`max-w-[85%] space-y-2 ${m.from === 'client' ? 'items-end' : ''}`}>
                      <div
                        className={`whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                          m.from === 'client'
                            ? 'rounded-br-md bg-[var(--color-cyan)] text-[#0a0a0a]'
                            : 'rounded-bl-md bg-white/[0.06] text-white/90'}`}
                      >
                        {m.text}
                      </div>

                      {m.faq?.link && (canTicket || !m.faq.link.href.startsWith('/client')) && (
                        <Link
                          href={m.faq.link.href}
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-cyan)]/30 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-cyan)] hover:bg-[var(--color-cyan)]/10"
                        >
                          {m.faq.link.label} <ChevronRight size={12} />
                        </Link>
                      )}

                      {m.faq && helped[m.id] === undefined && (
                        <div className="flex items-center gap-2 text-[11px] text-white/45">
                          Did this answer it?
                          <button type="button" onClick={() => {
                            setHelped((h) => ({ ...h, [m.id]: true }))
                            setQuestionsAfter(nextId.current)
                            push({ from: 'bot', text: 'Glad that helped! Ask anything else any time.' })
                          }}
                            className="rounded-md border border-white/10 px-2 py-0.5 text-white/70 hover:bg-white/5">Yes</button>
                          <button type="button" onClick={() => {
                            setHelped((h) => ({ ...h, [m.id]: false }))
                            setQuestionsAfter(nextId.current)
                            push({
                              from: 'bot',
                              text: canTicket
                                ? 'Sorry about that. Our team can look into it: open a ticket and they will reply by email.'
                                : 'Sorry about that. Our team can help: send them a message and they will reply by email.',
                              offerTicket: true,
                            })
                          }} className="rounded-md border border-white/10 px-2 py-0.5 text-white/70 hover:bg-white/5">No</button>
                        </div>
                      )}

                      {/* The greeting's common questions, until a wrapped-up question moves them down. */}
                      {m.suggestions && m.suggestions.length > 0 && !(m.id === 0 && questionsAfter !== null) && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.suggestions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => pick(s)}
                              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-[11px] text-white/75 hover:border-[var(--color-cyan)]/40 hover:text-white"
                            >
                              {s.question}
                            </button>
                          ))}
                        </div>
                      )}

                      {m.offerTicket && !ticketOpen && (
                        <button
                          type="button"
                          onClick={canTicket ? startTicket : toContactForm}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-cyan)] px-3 py-1.5 text-[11px] font-bold text-[#0a0a0a] hover:opacity-90"
                        >
                          <Ticket size={13} /> {canTicket ? 'Talk to our team' : 'Message our team'}
                        </button>
                      )}
                    </div>
                  </div>
                    {/* The common questions, moved here when the question above was wrapped up. */}
                    {m.id === questionsAfter && (
                      <div className="flex gap-2 pt-1">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-cyan)]">
                          <MessageCircleQuestion size={13} />
                        </span>
                        <div className="max-w-[85%] space-y-1.5">
                          <p className="text-[11px] text-white/45">Have another question?</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(isPublic && !canTicket ? PUBLIC_STARTER_QUESTIONS : STARTER_QUESTIONS).map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => pick(s)}
                                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-[11px] text-white/75 hover:border-[var(--color-cyan)]/40 hover:text-white"
                              >
                                {s.question}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </Fragment>
                ))}

                {ticketOpen && (
                  <div className="space-y-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-xs font-bold text-white">Open a ticket</p>
                    <p className="text-[11px] leading-snug text-white/45">
                      Our team replies by email{user?.email ? ` to ${user.email}` : ''}. This conversation is attached so you don&apos;t have to repeat yourself.
                    </p>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-white/40">Topic</span>
                      <select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-2.5 py-2 text-xs text-white outline-none">
                        {(Object.keys(TICKET_CATEGORY_LABEL) as TicketCategory[]).map((c) => (
                          <option key={c} value={c}>{TICKET_CATEGORY_LABEL[c]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-white/40">Booking (optional)</span>
                      <select value={bookingId} onChange={(e) => setBookingId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-2.5 py-2 text-xs text-white outline-none">
                        <option value="">Not about a specific booking</option>
                        {bookings.map((b) => <option key={b.booking_id} value={b.booking_id}>{b.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-white/40">Subject</span>
                      <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-2.5 py-2 text-xs text-white outline-none focus:border-[var(--color-cyan)]/50" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold uppercase text-white/40">What happened?</span>
                      <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={4000}
                        className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-[#111] px-2.5 py-2 text-xs text-white outline-none focus:border-[var(--color-cyan)]/50" />
                    </label>
                    {formError && <p className="text-[11px] text-red-400">{formError}</p>}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setTicketOpen(false)} disabled={sending}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/5">Cancel</button>
                      <button type="button" onClick={() => void submitTicket()} disabled={sending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-cyan)] px-3 py-1.5 text-[11px] font-bold text-[#0a0a0a] disabled:opacity-50">
                        {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send ticket
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); ask(input) }}
                className="flex items-center gap-2 border-t border-white/[0.07] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your question…"
                  maxLength={300}
                  className="flex-1 rounded-xl border border-white/10 bg-[#111] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-[var(--color-cyan)]/50"
                />
                <button type="submit" disabled={!input.trim()} aria-label="Send"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-cyan)] text-[#0a0a0a] disabled:opacity-30">
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {ticketsLoading && tickets.length === 0 ? (
                <p className="flex items-center gap-2 text-xs text-white/45"><Loader2 size={13} className="animate-spin" /> Loading your tickets…</p>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Ticket size={28} className="text-white/20" />
                  <p className="text-xs text-white/45">No tickets yet. Ask the assistant first; if it can&apos;t help, it opens one for you.</p>
                  <button type="button" onClick={() => setTab('chat')} className="text-xs font-semibold text-[var(--color-cyan)]">Ask the assistant</button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {tickets.map((t) => (
                    <li key={t.ticket_id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-white/70">{t.reference}</span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
                          style={t.status === 'open'
                            ? { color: '#ffea00', borderColor: 'rgba(255,234,0,0.35)', background: 'rgba(255,234,0,0.08)' }
                            : { color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.35)', background: 'rgba(77,249,237,0.08)' }}
                        >
                          {t.status === 'open' ? 'Waiting for reply' : <><CheckCircle2 size={10} /> Resolved</>}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold text-white">{t.subject}</p>
                      <p className="text-[11px] text-white/40">
                        {TICKET_CATEGORY_LABEL[t.category]}
                        {t.bookings?.reference_number ? ` · ${t.bookings.reference_number}` : ''}
                        {' · '}{formatDateTime(t.created_at)}
                      </p>
                      {t.resolution_note && (
                        <p className="mt-2 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[11px] leading-snug text-white/70">{t.resolution_note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-[10px] leading-snug text-white/30">
                Replies come by email. To add details to a ticket, reply to its email.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )

  // No floating button in the client's Booking module: it sat over the booking
  // form. A message notification can still open the panel there (OPEN_HELP_EVENT),
  // and then the button shows so it can be closed.
  const hideLauncher = !isPublic && !!pathname?.startsWith('/client/booking') && !open

  return createPortal(<>{panel}{!hideLauncher && launcher}</>, document.body)
}

