'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft, ArrowUp, Bot, CheckCircle2, ChevronRight, Home, ImagePlus, Inbox, Mail, MessageCircleQuestion,
  MessageSquare, Search, Send, Ticket, UserRound, Users, X, Loader2,
} from 'lucide-react'
import { ASSETS } from '@/lib/data'
import { roleLabel } from '@/lib/roles'
import { formatConversationTime } from '@/app/utils/messaging.utils'
import SearchClearButton from '@/components/ui/SearchClearButton'
import { useClientMessages, ClientMessagesPanel } from './ClientMessages'

import { useAuthStore } from '@/lib/store/auth.store'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { getApiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/app/utils/timeFormat'
import { FAQ, matchFaq, smallTalk, STARTER_QUESTIONS, PUBLIC_STARTER_QUESTIONS, type FaqEntry, type FaqMatch } from '@/lib/support/faq'
import {
  supportService, TICKET_CATEGORY_LABEL, OPEN_HELP_EVENT, openedByStaff,
  type HelpTab, type SupportTicket,
} from '@/lib/services/support.service'
import {
  supportChatService, CHAT_STATUS_LABEL, canStillReopen,
  type ChatConversation, type ChatDetail, type ChatMessage, type ChatStatus,
} from '@/lib/services/support-chat.service'
import { useSupportConversationChannel, useSupportUserChannel } from '@/lib/hooks/useSupportChat'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { useTurnstile } from '@/lib/hooks/useTurnstile'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import PhotoSendDialog, { MAX_PHOTO_BYTES } from '@/components/messaging/PhotoSendDialog'
import MessagePhoto from '@/components/messaging/MessagePhoto'

/**
 * The help assistant and the client's support conversations (Intercom model).
 *
 *   audience="client"  the client portal: the assistant answers first; "Talk to
 *                      our team" hands the SAME conversation to the Operations
 *                      Managers and Company Administrators (staff inbox =
 *                      Conversations tab on Tickets). Their replies come here,
 *                      and by email when the client is away (replying to that
 *                      email adds to the conversation). Saved on the server.
 *   audience="public"  the landing page: assistant answers for anyone, not
 *                      saved; when it can't help, a visitor is sent to the
 *                      contact form (a signed-in client still hands over).
 *
 * Layout (user 2026-11-21, after Onfleet's Intercom messenger): 400 x up to
 * 704 px on desktop, full screen on phones. Home (greeting, recent message,
 * "Ask a question", search for help) and, for clients, a bottom bar Home /
 * Messages / Tickets. A conversation opens over them with a back arrow.
 *
 * Messages lists the conversations (2026-11-22). Older one-to-one messages a
 * staff member sent the client (ClientMessages) stay under "Earlier messages",
 * read-only.
 */

interface Msg {
  id:    number
  from:  'client' | 'bot' | 'staff' | 'system'
  text:  string
  /** The FAQ answer this message is, for its link and the "did this help?" buttons. */
  faq?:  FaqEntry
  /** Suggested questions, offered as buttons. */
  suggestions?: FaqEntry[]
  /** Offer the "talk to our team" button under this message. */
  offerTicket?: boolean
  /** Written by the AI (Gemini) from the FAQ, not one of our own answers word for word. */
  ai?: boolean
  /** Loaded from the server: no Yes/No, no question buttons. */
  history?: boolean
  /** The server row, once saved (dedupes live messages). */
  serverId?: string
  /** Staff: "Maria Santos · Operations Manager". */
  name?: string
  attachmentUrl?: string | null
  stamped?: boolean
  via?: 'chat' | 'email'
}

const noopSubscribe = () => () => {}

/**
 * How long the "typing…" bubble shows before a reply: a little longer for a
 * longer answer, but never long enough to feel slow (chat widgets keep it
 * around a second).
 */
function typingDelay(text: string): number {
  return Math.min(1600, Math.max(700, 400 + text.length * 6))
}

/** Three bouncing dots in a bot bubble, shown while the assistant "types". */
function TypingBubble({ label = 'The assistant is typing' }: { label?: string }) {
  const reduce = useReducedMotion()
  return (
    <div className="flex justify-start gap-2" role="status" aria-label={label}>
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-cyan)]">
        <Bot size={13} />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.06] px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-white/60"
            animate={reduce ? { opacity: [0.35, 1, 0.35] } : { y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  )
}

const GREETING =
  'Hi! I\'m the 8338 help assistant. Ask me about bookings, tracking, deliveries or your account, ' +
  'or pick a common question below. If I can\'t help, I\'ll pass you to our team.'

/** A card on the Home screen. */
const CARD = 'rounded-2xl border border-white/[0.08] bg-[#161616] shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-colors'

const PUBLIC_GREETING =
  'Hi! I\'m the 8338 help assistant. Ask me about our delivery service, how to become a client, or how ' +
  'booking and tracking work. If I can\'t help, I\'ll point you to our team.'

/** Status chip colours (fixed palette). */
const STATUS_STYLE: Record<ChatStatus, { color: string; border: string; bg: string }> = {
  assistant: { color: 'rgba(255,255,255,0.6)', border: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.04)' },
  waiting:   { color: '#FFEA00', border: 'rgba(255,234,0,0.35)', bg: 'rgba(255,234,0,0.08)' },
  replied:   { color: '#4DF9ED', border: 'rgba(77,249,237,0.35)', bg: 'rgba(77,249,237,0.08)' },
  resolved:  { color: '#3AF626', border: 'rgba(58,246,38,0.35)', bg: 'rgba(58,246,38,0.08)' },
}

function StatusChip({ status }: { status: ChatStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[12px] font-bold"
      style={{ color: s.color, borderColor: s.border, background: s.bg }}>
      {CHAT_STATUS_LABEL[status]}
    </span>
  )
}

export default function HelpAssistant({ audience = 'client' }: { audience?: 'client' | 'public' }) {
  const user      = useAuthStore((s) => s.user)
  const pathname  = usePathname()
  const mounted   = useSyncExternalStore(noopSubscribe, () => true, () => false)
  // Conversations with the team need a client account; a visitor is pointed to the contact form.
  const canTicket = user?.role === 'client'
  const isPublic  = audience === 'public'
  const saves     = canTicket // signed-in clients' conversations are kept on the server

  const [open, setOpen] = useState(false)
  const [tab,  setTab]  = useState<HelpTab>('home')
  // Where the chat's back arrow returns to.
  const [chatFrom, setChatFrom] = useState<Exclude<HelpTab, 'chat'>>('home')
  // The Home screen's "Search for help" box.
  const [helpQuery, setHelpQuery] = useState('')
  // Messages: the older one-to-one staff messages, opened from their row.
  const [showEarlier, setShowEarlier] = useState(false)
  // Below `sm` the panel is full-screen; keep the page under it still (iOS).
  const isMobile = useIsMobile()
  useBodyScrollLock(open && isMobile)
  const inbox = useClientMessages(!isPublic && canTicket ? user?.user_id : undefined, open && tab === 'messages' && showEarlier)
  const { openConversation } = inbox

  const nextId = useRef(1)
  const freshGreeting = useCallback((): Msg[] => [
    isPublic && !canTicket
      ? { id: 0, from: 'bot', text: PUBLIC_GREETING, suggestions: PUBLIC_STARTER_QUESTIONS }
      : { id: 0, from: 'bot', text: GREETING, suggestions: STARTER_QUESTIONS },
  ], [isPublic, canTicket])
  const [messages, setMessages] = useState<Msg[]>(freshGreeting)
  const [input, setInput] = useState('')
  const [helped, setHelped] = useState<Record<number, boolean>>({})
  // Where the common questions are offered: under the greeting (null) until the
  // client answers "Did this answer it?" (Yes or No). Each time they move to
  // just below that message, the bottom of the chat at that moment.
  const [questionsAfter, setQuestionsAfter] = useState<number | null>(null)

  // ── The open conversation (server) ──
  const [convId,     setConvId]     = useState<string | null>(null)
  const [conv,       setConv]       = useState<ChatConversation | null>(null)
  const [authors,    setAuthors]    = useState<ChatDetail['authors']>({})
  const [convLoading, setConvLoading] = useState(false)
  const [sendError,  setSendError]  = useState<string | null>(null)
  const [sending,    setSending]    = useState(false)
  const [handing,    setHanding]    = useState(false)
  const [photo,      setPhoto]      = useState<File | null>(null)
  const [staffTyping, setStaffTyping] = useState<string | null>(null)
  const status: ChatStatus = conv?.status ?? 'assistant'
  // With the team once handed over; an assistant-only chat that closed after
  // 24 quiet hours carries on with the assistant.
  const withTeam = status !== 'assistant' && !(status === 'resolved' && !conv?.handed_over_at)
  const fileRef  = useRef<HTMLInputElement>(null)

  // ── The client's conversations ──
  const [chats, setChats] = useState<ChatConversation[]>([])
  const [chatsLoading, setChatsLoading] = useState(false)
  const loadChats = useCallback(async () => {
    if (!saves || isPublic) return
    setChatsLoading(true)
    try { setChats(await supportChatService.mine()) } catch { /* keep the last list */ }
    finally { setChatsLoading(false) }
  }, [saves, isPublic])

  const [tickets,        setTickets]        = useState<SupportTicket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)

  const scroller = useRef<HTMLDivElement>(null)

  // ── Saving the assistant part: each question + answer, in order ──
  const convIdRef = useRef<string | null>(null)
  useEffect(() => { convIdRef.current = convId }, [convId])
  const statusRef = useRef<ChatStatus>('assistant')
  useEffect(() => { statusRef.current = status }, [status])
  const queue = useRef<Promise<void>>(Promise.resolve())
  // Which chat lines reached the server, so a handover sends any that didn't.
  const savedIds = useRef<Set<number>>(new Set())

  /** Make the conversation on the server (first question), once. */
  const ensureConv = useCallback(async (title: string): Promise<string | null> => {
    if (!saves || isPublic) return null
    if (convIdRef.current) return convIdRef.current
    const c = await supportChatService.start(title)
    convIdRef.current = c.conversation_id
    setConvId(c.conversation_id)
    setConv(c)
    return c.conversation_id
  }, [saves, isPublic])

  /** A chat line as the server stores it. */
  const lineOf = (m: Pick<Msg, 'from' | 'text' | 'ai' | 'faq'>) => ({
    author: (m.from === 'client' ? 'client' : 'assistant') as 'client' | 'assistant',
    text:   m.text,
    meta:   m.from === 'bot' ? { ai: !!m.ai, ...(m.faq ? { faq_id: m.faq.id } : {}) } : null,
  })

  /** Queue one line of the assistant part for the server (fire and forget, in order). */
  const save = useCallback((msgId: number, line: { author: 'client' | 'assistant'; text: string; meta?: { ai?: boolean; faq_id?: string } | null }) => {
    if (!saves || isPublic) return
    queue.current = queue.current.then(async () => {
      // Only while the assistant is the one answering (a new chat always is).
      if (convIdRef.current && statusRef.current !== 'assistant') return
      try {
        const id = await ensureConv(line.author === 'client' ? line.text : 'Question for the assistant')
        if (id) { await supportChatService.lines(id, [line]); savedIds.current.add(msgId) }
      } catch { /* sent again at handover */ }
    })
  }, [saves, isPublic, ensureConv])

  const push = useCallback((m: Omit<Msg, 'id'>) => {
    const id = nextId.current++
    setMessages((prev) => [...prev, { ...m, id }])
    if (m.from === 'client' || m.from === 'bot') save(id, lineOf(m))
  }, [save])

  // A bot reply to something the client asked or tapped: "typing…" first, then
  // the message. While it types, new questions wait (the send button and the
  // question buttons do nothing), so replies never arrive out of order.
  const [typing, setTyping] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (typingTimer.current) clearTimeout(typingTimer.current) }, [])
  const reply = useCallback((m: Omit<Msg, 'id'>) => {
    if (typingTimer.current) clearTimeout(typingTimer.current)
    setTyping(true)
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null
      setTyping(false)
      push(m)
    }, typingDelay(m.text))
  }, [push])

  /** A server message as a chat line. */
  const toMsg = useCallback((m: ChatMessage, who: ChatDetail['authors']): Msg => {
    const a = m.author_id ? who[m.author_id] : undefined
    return {
      id: nextId.current++,
      serverId: m.message_id,
      from: m.author === 'client' ? 'client' : m.author === 'assistant' ? 'bot' : m.author,
      text: m.content,
      history: true,
      ai: !!m.meta?.ai,
      faq: m.meta?.faq_id ? FAQ.find((f) => f.id === m.meta?.faq_id) : undefined,
      name: m.author === 'staff' ? (a ? `${a.name} · ${roleLabel(a.role)}` : 'Our team') : undefined,
      attachmentUrl: m.attachment_url,
      stamped: m.attachment_stamped,
      via: m.via,
    }
  }, [])

  /** Open one of the client's conversations from the list (or a notification). */
  const openChatConversation = useCallback(async (id: string, from: Exclude<HelpTab, 'chat'> = 'messages') => {
    setChatFrom(from)
    setTab('chat')
    setConvLoading(true)
    setSendError(null)
    setQuestionsAfter(null)
    setHelped({})
    // Point at this conversation at once (not after it loads), and show none
    // of the previous chat: anything typed meanwhile belongs here, never to a
    // new conversation (found by CHAT-002, 2026-11-22). The box stays disabled
    // until it has loaded.
    queue.current = Promise.resolve()
    convIdRef.current = id
    setConvId(id)
    setConv(null)
    setMessages([])
    try {
      const d = await supportChatService.get(id)
      convIdRef.current = d.conversation_id
      statusRef.current = d.status
      savedIds.current = new Set()
      setConvId(d.conversation_id)
      setConv(d)
      setAuthors(d.authors)
      setMessages(d.messages.map((m) => toMsg(m, d.authors)))
      void supportChatService.read(id).catch(() => {})
      setChats((prev) => prev.map((c) => (c.conversation_id === id ? { ...c, unread_count: 0 } : c)))
    } catch (e) {
      setSendError(getApiErrorMessage(e, 'This conversation could not be opened.'))
    } finally {
      setConvLoading(false)
    }
  }, [toMsg])

  /** A new conversation: the assistant's greeting, nothing saved until the first question. */
  const newChat = useCallback((from: Exclude<HelpTab, 'chat'>) => {
    queue.current = Promise.resolve()
    savedIds.current = new Set()
    convIdRef.current = null
    statusRef.current = 'assistant'
    setConvId(null)
    setConv(null)
    setAuthors({})
    setMessages(freshGreeting())
    setHelped({})
    setQuestionsAfter(null)
    setSendError(null)
    setInput('')
    setChatFrom(from)
    setTab('chat')
  }, [freshGreeting])

  // Live: new messages in the open conversation (the team's replies, system
  // lines) and "… is typing". A photo's link is made for each reader by the
  // server, so a live photo reloads the conversation.
  const { sendTyping } = useSupportConversationChannel({
    conversationId: open && tab === 'chat' && withTeam ? convId : null,
    userId: user?.user_id,
    onMessage: (m) => {
      if (m.attachment_url) { if (convId) void openChatConversation(convId, chatFrom); return }
      setStaffTyping(null)
      setMessages((prev) => (prev.some((x) => x.serverId === m.message_id) ? prev : [...prev, toMsg(m, authors)]))
      if (m.author === 'staff' && !authors[m.author_id ?? '']) {
        // A colleague who hadn't written before: fetch names once.
        if (convId) void supportChatService.get(convId).then((d) => setAuthors(d.authors)).catch(() => {})
      }
      if (m.author === 'staff' && convId) void supportChatService.read(convId).catch(() => {})
      if (m.author === 'system' || m.author === 'staff') {
        setConv((c) => (c ? { ...c, status: m.author === 'staff' ? 'replied' : c.status } : c))
      }
    },
    onTyping: (who, isTyping) => {
      const a = authors[who]
      setStaffTyping(isTyping ? (a?.name?.split(' ')[0] ?? 'Our team') : null)
    },
  })
  useSupportUserChannel(!isPublic && saves ? user?.user_id : undefined, (id) => {
    void loadChats()
    // Resolved / reopened while open: pick up the new status.
    if (id === convIdRef.current && open && tab === 'chat') {
      void supportChatService.get(id).then((d) => setConv(d)).catch(() => {})
    }
  })

  // Opened from elsewhere in the portal (the dashboard's help card).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: HelpTab; conversationId?: string }>).detail
      setOpen(true)
      setTab(detail?.tab ?? 'home')
      setChatFrom('home')
      if (detail?.conversationId) { setShowEarlier(true); void openConversation(detail.conversationId) }
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
    if (conversationId) { setShowEarlier(true); void openConversation(conversationId) }
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
  }, [messages, typing, staffTyping])

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true)
    try { setTickets(await supportService.mine()) } catch { /* keep the last list */ }
    finally { setTicketsLoading(false) }
  }, [])

  // Loaded when the panel opens (not only on their tab) so the bottom bar's
  // badges and Home's "Recent message" are right straight away.
  useEffect(() => { if (open && canTicket) { void loadTickets(); void loadChats() } }, [open, canTicket, loadTickets, loadChats])
  // Also once on load, for the launcher's unread badge.
  useEffect(() => { void loadChats() }, [loadChats])
  useLiveTable(['live:support_tickets'], () => { void loadTickets() }, { enabled: open && canTicket })

  /** No confident answer: offer the near matches, else the team. */
  const noAnswer = useCallback((matches: FaqMatch[]): Omit<Msg, 'id'> => (
    matches.length > 0
      ? {
          from: 'bot',
          text: 'I\'m not completely sure what you mean. Is it one of these?',
          suggestions: matches.map((m) => m.entry),
          offerTicket: true,
        }
      : {
          from: 'bot',
          text: canTicket
            ? 'Sorry, I don\'t have an answer for that. Our team can help: tap "Talk to our team" and they will reply here.'
            : 'Sorry, I don\'t have an answer for that. Our team can help: send them a message and they will reply by email.',
          offerTicket: true,
        }
  ), [canTicket])

  // A visitor's AI questions carry an invisible Cloudflare check (one per
  // question); a signed-in client's go with their session instead.
  const captcha = useTurnstile('assistant')
  const visitor = !canTicket

  /**
   * Ask the AI: an answer written from the knowledge and citing it, "off
   * topic", or nothing (then the keyword fallback). The typing bubble shows
   * while it thinks, at least as long as for a keyword answer.
   */
  const askAi = useCallback(async (q: string, earlier: string[], matches: FaqMatch[]) => {
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null }
    setTyping(true)
    const started = Date.now()
    const res     = visitor
      ? await supportService.askPublic(q, earlier, await captcha.getToken().catch(() => undefined))
      : await supportService.ask(q, earlier)
    const wait    = 700 - (Date.now() - started)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    setTyping(false)

    if (res.status === 'answered') {
      const source = FAQ.find((f) => f.id === res.source_ids[0])
      push({ from: 'bot', text: res.answer, faq: source, ai: true })
    } else if (res.status === 'off_topic') {
      push({
        from: 'bot',
        text: visitor
          ? 'I can only help with questions about 8338 Logistics and our delivery service. Pick a common ' +
            'question below, or send our team a message.'
          : 'I can only help with questions about your bookings, deliveries, tracking and your 8338 account. ' +
            'Pick a common question below, or ask our team.',
        suggestions: visitor ? PUBLIC_STARTER_QUESTIONS : STARTER_QUESTIONS,
        offerTicket: true,
      })
    } else {
      push(noAnswer(matches))
    }
  }, [push, noAnswer, visitor, captcha])

  const ask = useCallback((text: string) => {
    const q = text.trim()
    if (!q || typing) return
    // Earlier questions in this chat, so a follow-up ("what about Sundays?") makes sense.
    const earlier = messages.filter((m) => m.from === 'client').map((m) => m.text).slice(-3)
    push({ from: 'client', text: q })
    setInput('')

    // Hi / thanks / bye: answered at once, never "no answer" and never the AI.
    const talk = smallTalk(q)
    if (talk) {
      const starters = isPublic && !canTicket ? PUBLIC_STARTER_QUESTIONS : STARTER_QUESTIONS
      reply(talk === 'greeting'
        ? { from: 'bot', text: 'Hi! What can I help you with? Ask about bookings, tracking, deliveries or your account, or pick a common question.', suggestions: starters }
        : talk === 'thanks'
          ? { from: 'bot', text: 'You\'re welcome! Ask anything else any time.' }
          : { from: 'bot', text: 'Goodbye! I\'m here whenever you need help.' })
      return
    }

    // Every typed question goes to the AI, which reads the whole FAQ and
    // understands Filipino / Taglish and rewording. The keyword matches are
    // only the fallback ("Is it one of these?") when the AI can't answer.
    const matches = matchFaq(q, 3, !canTicket)
    void askAi(q, earlier, matches)
  }, [push, reply, askAi, canTicket, isPublic, typing, messages])

  const pick = useCallback((entry: FaqEntry) => {
    if (typing) return
    push({ from: 'client', text: entry.question })
    reply({ from: 'bot', text: entry.answer, faq: entry })
  }, [push, reply, typing])

  /** "Talk to our team": the same conversation goes to the staff inbox. */
  const handOver = useCallback(async () => {
    if (handing) return
    setHanding(true)
    setSendError(null)
    try {
      await queue.current
      const lastQuestion = [...messages].reverse().find((m) => m.from === 'client')?.text
      const firstQuestion = messages.find((m) => m.from === 'client')?.text
      const id = await ensureConv(firstQuestion ?? lastQuestion ?? 'Question for our team')
      if (!id) return
      // Anything the queue couldn't save goes now, in order, so the team sees it all.
      const missing = messages.filter((m) => m.id !== 0 && !m.history && (m.from === 'client' || m.from === 'bot') && !savedIds.current.has(m.id))
      for (let i = 0; i < missing.length; i += 10) {
        await supportChatService.lines(id, missing.slice(i, i + 10).map(lineOf))
      }
      missing.forEach((m) => savedIds.current.add(m.id))
      await supportChatService.handOver(id)
      await openChatConversation(id, chatFrom)
      void loadChats()
    } catch (e) {
      setSendError(getApiErrorMessage(e, 'Could not reach our team. Please try again.'))
    } finally {
      setHanding(false)
    }
  }, [handing, messages, ensureConv, openChatConversation, chatFrom, loadChats])

  /** After the handover: a message (or photo) to the team. */
  const sendToTeam = useCallback(async (content: string, attachmentUrl?: string) => {
    if (!convId || sending) return
    setSending(true)
    setSendError(null)
    try {
      const m = await supportChatService.send(convId, { content, ...(attachmentUrl ? { attachment_url: attachmentUrl } : {}) })
      sendTyping(false)
      if (attachmentUrl) await openChatConversation(convId, chatFrom)
      else setMessages((prev) => (prev.some((x) => x.serverId === m.message_id) ? prev : [...prev, toMsg(m, authors)]))
      setInput('')
      setConv((c) => (c ? { ...c, status: 'waiting', resolved_at: null } : c))
      void loadChats()
    } catch (e) {
      setSendError(getApiErrorMessage(e, 'The message could not be sent. Please try again.'))
    } finally {
      setSending(false)
    }
  }, [convId, sending, sendTyping, openChatConversation, chatFrom, toMsg, authors, loadChats])

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setSendError('Only photos can be sent'); return }
    if (file.size > MAX_PHOTO_BYTES) { setSendError('Photos can be up to 10 MB'); return }
    setSendError(null)
    setPhoto(file)
  }

  const openCount = useMemo(() => tickets.filter((t) => t.status === 'open').length, [tickets])
  const chatUnread = useMemo(() => chats.reduce((n, c) => n + (c.unread_count ?? 0), 0), [chats])
  const totalUnread = inbox.totalUnread + chatUnread

  /** A visitor can't hand over: take them to the contact form instead. */
  const toContactForm = useCallback(() => {
    setOpen(false)
    const el = document.getElementById('contact')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    else window.location.href = '/#contact'
  }, [])

  /** Home's "Ask a question": carry on with an unfinished question, else a new one. */
  const askFromHome = useCallback(() => {
    if (convId && status === 'assistant') { setChatFrom('home'); setTab('chat'); return }
    if (!convId && messages.length > 1) { setChatFrom('home'); setTab('chat'); return }
    newChat('home')
  }, [convId, status, messages.length, newChat])

  // Home's "Search for help": the common questions, or the FAQ entries that
  // match what's typed.
  const helpMatches = useMemo(() => {
    const q = helpQuery.trim()
    if (q.length < 2) return (isPublic && !canTicket ? PUBLIC_STARTER_QUESTIONS : STARTER_QUESTIONS).slice(0, 5)
    return matchFaq(q, 5, !canTicket).map((m) => m.entry)
  }, [helpQuery, isPublic, canTicket])

  // Home's "Recent message": the newest conversation that reached the team.
  const recent = useMemo(() => chats.find((c) => c.status !== 'assistant') ?? null, [chats])
  const earlierCount = inbox.conversations.length

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
      aria-label={open ? 'Close help' : totalUnread > 0 ? `Help and messages, ${totalUnread} unread` : 'Help and messages'}
      className={`fixed right-5 ${lift} z-[58] flex items-center justify-center rounded-full shadow-xl`}
      style={{ width: 52, height: 52, background: 'var(--color-cyan)', color: '#0a0a0a', boxShadow: '0 10px 30px rgba(77,249,237,0.25)' }}
    >
      {open ? <X size={22} /> : <MessageCircleQuestion size={24} />}
      {!open && totalUnread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-[#0d0d0d] bg-red-500 px-1 text-[12px] font-bold text-white">
          {totalUnread > 9 ? '9+' : totalUnread}
        </span>
      )}
    </motion.button>
  )

  const closeButton = (
    <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white">
      <X size={18} />
    </button>
  )

  const titleBar = (title: string) => (
    <div className="relative flex shrink-0 items-center justify-center border-b border-white/[0.07] px-12 py-3.5">
      <p className="text-[15px] font-bold text-white">{title}</p>
      <div className="absolute right-2 top-1/2 -translate-y-1/2">{closeButton}</div>
    </div>
  )

  // Floating at the bottom of Messages and Tickets, as Intercom's "Send us a message": a new conversation.
  const askPill = (from: Exclude<HelpTab, 'chat'>) => (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
      <button
        type="button"
        onClick={() => newChat(from)}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-[var(--color-cyan)] px-4 py-2.5 text-[15px] font-bold text-[#0a0a0a] shadow-[0_8px_24px_rgba(0,0,0,0.45)] hover:brightness-110"
      >
        Ask a question <Send size={14} />
      </button>
    </div>
  )

  /** One conversation row (Messages, Home's recent card). */
  const chatRow = (c: ChatConversation) => (
    <span className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(77,249,237,0.12)', color: 'var(--color-cyan)' }}>
        {c.status === 'assistant' ? <Bot size={18} /> : <Users size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-[15px] ${(c.unread_count ?? 0) > 0 ? 'font-bold text-white' : 'font-semibold text-white/90'}`}>
            {c.title || 'Question'}
          </span>
          <span className="shrink-0 text-[13px] text-white/40">{formatConversationTime(c.last_message_at)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[14px] ${(c.unread_count ?? 0) > 0 ? 'text-white' : 'text-white/55'}`}>
            {c.last_message
              ? `${c.last_message.author === 'client' ? 'You: ' : ''}${c.last_message.content}`
              : 'No messages yet'}
          </span>
          {(c.unread_count ?? 0) > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-cyan)]" aria-label="Unread" />}
        </span>
        <span className="mt-1 block"><StatusChip status={c.status} /></span>
      </span>
    </span>
  )

  // What the composer does now.
  const closedForGood = withTeam && conv ? !canStillReopen(conv) : false
  const teamName = staffTyping

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
          className="ff-darker fixed inset-0 font-medium z-[59] flex flex-col overflow-hidden bg-[#0d0d0d] sm:inset-auto sm:bottom-[88px] sm:right-5 sm:h-[min(704px,calc(100dvh-112px))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-white/[0.08] sm:shadow-2xl"
        >
          {tab === 'home' || (tab !== 'chat' && !canTicket) ? (
            // ── Home ─────────────────────────────────────────────────────────
            <div className="relative min-h-0 flex-1 overflow-y-auto">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-80"
                style={{ background: 'linear-gradient(180deg, rgba(77,249,237,0.22) 0%, rgba(77,249,237,0.08) 45%, rgba(13,13,13,0) 100%)' }}
              />
              <div className="relative px-4 pb-5 pt-4">
                <div className="flex items-center justify-between">
                  <Image src={ASSETS.logo} alt="8338 Logistics" width={110} height={28} className="h-7 w-auto object-contain" />
                  {closeButton}
                </div>
                <h2 className="mt-10 text-[30px] font-bold leading-[1.1] text-white">
                  <span className="block text-white/60">Hi {user?.first_name?.trim() || 'there'},</span>
                  How can we help?
                </h2>

                <div className="mt-6 space-y-3">
                  {/* Recent message: the newest conversation with the team. */}
                  {canTicket && recent && (
                    <button
                      type="button"
                      onClick={() => void openChatConversation(recent.conversation_id, 'home')}
                      className={`${CARD} block w-full p-4 text-left hover:border-white/[0.14]`}
                    >
                      <span className="mb-3 block text-[15px] font-bold text-white">Recent message</span>
                      {chatRow(recent)}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={askFromHome}
                    className={`${CARD} flex w-full items-center gap-3 p-4 text-left hover:border-white/[0.14]`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold text-white">
                        {(convId && status === 'assistant') || (!convId && messages.length > 1) ? 'Continue your question' : 'Ask a question'}
                      </span>
                      <span className="block text-[14px] text-white/50">
                        {canTicket ? 'Instant answers · our team takes over if needed' : 'Instant answers about our service'}
                      </span>
                    </span>
                    <Send size={17} className="shrink-0 text-[var(--color-cyan)]" />
                  </button>

                  {/* Search for help: live FAQ matches; Enter asks the assistant. */}
                  <div className={`${CARD} p-2`}>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const q = helpQuery.trim()
                        if (!q || typing) return
                        newChat('home')
                        // The new chat's state lands first; ask on the next tick.
                        setTimeout(() => ask(q), 0)
                        setHelpQuery('')
                      }}
                      className="relative"
                    >
                      <input
                        id="help-search"
                        name="help-search"
                        value={helpQuery}
                        onChange={(e) => setHelpQuery(e.target.value)}
                        placeholder="Search for help"
                        aria-label="Search for help"
                        maxLength={300}
                        className="w-full rounded-xl bg-white/[0.06] py-3 pl-3.5 pr-16 text-[15px] text-white outline-none placeholder:text-white/75 focus:ring-1 focus:ring-[var(--color-cyan)]/40"
                      />
                      <SearchClearButton value={helpQuery} onClear={() => setHelpQuery('')} className="right-8" />
                      <button type="submit" aria-label="Ask the assistant" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--color-cyan)]">
                        <Search size={16} />
                      </button>
                    </form>
                    <ul className="mt-1">
                      {helpMatches.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => { if (typing) return; newChat('home'); setTimeout(() => pick(s), 0); setHelpQuery('') }}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-white/75 hover:bg-white/[0.04] hover:text-white"
                          >
                            <span className="min-w-0 flex-1">{s.question}</span>
                            <ChevronRight size={15} className="shrink-0 text-[var(--color-cyan)]" />
                          </button>
                        </li>
                      ))}
                      {helpMatches.length === 0 && (
                        <li className="px-3 py-2.5 text-[14px] leading-snug text-white/45">
                          No matching help article. Press Enter to ask the assistant.
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : tab === 'messages' && canTicket && user ? (
            // ── Messages ─────────────────────────────────────────────────────
            showEarlier ? (
              inbox.thread ? (
                <ClientMessagesPanel state={inbox} userId={user.user_id} onAskAssistant={() => newChat('messages')} onClose={() => setOpen(false)} />
              ) : (
                <>
                  <div className="relative flex shrink-0 items-center justify-center border-b border-white/[0.07] px-12 py-3.5">
                    <button type="button" onClick={() => setShowEarlier(false)} aria-label="Back to messages"
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/60 hover:bg-white/5 hover:text-white">
                      <ArrowLeft size={18} />
                    </button>
                    <p className="text-[15px] font-bold text-white">Earlier messages</p>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">{closeButton}</div>
                  </div>
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    <ClientMessagesPanel state={inbox} userId={user.user_id} onAskAssistant={() => newChat('messages')} />
                  </div>
                </>
              )
            ) : (
              <>
                {titleBar('Messages')}
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-20 pt-2">
                    {chatsLoading && chats.length === 0 ? (
                      <p className="flex items-center gap-2 py-4 text-[14px] text-white/45"><Loader2 size={13} className="animate-spin" /> Loading your messages…</p>
                    ) : chats.length === 0 && earlierCount === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-10 text-center">
                        <MessageSquare size={28} className="text-white/20" />
                        <p className="text-[14px] leading-snug text-white/45">
                          No messages yet. Ask a question: the assistant answers right away, and our team takes over when it can&apos;t.
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/[0.07]">
                        {chats.map((c) => (
                          <li key={c.conversation_id}>
                            <button type="button" onClick={() => void openChatConversation(c.conversation_id, 'messages')}
                              className="block w-full py-3 text-left hover:bg-white/[0.02]">
                              {chatRow(c)}
                            </button>
                          </li>
                        ))}
                        {earlierCount > 0 && (
                          <li>
                            <button type="button" onClick={() => setShowEarlier(true)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-white/[0.02]">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/60"><UserRound size={18} /></span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-semibold text-white/90">Earlier messages</span>
                                <span className="block text-[14px] text-white/50">
                                  {earlierCount} message{earlierCount !== 1 ? 's' : ''} our team sent you before conversations
                                </span>
                              </span>
                              {inbox.totalUnread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-cyan)]" aria-label="Unread" />}
                              <ChevronRight size={15} className="text-white/40" />
                            </button>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  {askPill('messages')}
                </div>
              </>
            )
          ) : tab === 'chat' ? (
            // ── A conversation: the assistant, then our team ─────────────────
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-2 py-2.5">
                <button type="button" onClick={() => setTab(chatFrom)} aria-label="Back"
                  className="rounded-lg p-1.5 text-white/60 hover:bg-white/5 hover:text-white">
                  <ArrowLeft size={18} />
                </button>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(77,249,237,0.12)', color: 'var(--color-cyan)' }}>
                  {withTeam ? <Users size={16} /> : <Bot size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold text-white">{withTeam ? '8338 Team' : '8338 Help Assistant'}</p>
                  <p className="truncate text-[13px] text-white/40">
                    {withTeam
                      ? (teamName ? `${teamName} is typing…` : `${CHAT_STATUS_LABEL[status]} · Mon–Sat 8 AM–5 PM`)
                      : canTicket ? 'Instant answers · our team takes over if needed' : 'Instant answers about our service'}
                  </p>
                </div>
                {closeButton}
              </div>
              <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {convLoading && (
                  <p className="flex items-center gap-2 text-[14px] text-white/45"><Loader2 size={13} className="animate-spin" /> Loading the conversation…</p>
                )}
                {messages.map((m) => (
                  m.from === 'system' ? (
                    <p key={m.id} className="mx-auto max-w-[92%] rounded-lg bg-white/[0.04] px-3 py-2 text-center text-[13px] leading-snug text-white/55">
                      {m.text}
                    </p>
                  ) : (
                  <Fragment key={m.id}>
                  <div className={`flex ${m.from === 'client' ? 'justify-end' : 'justify-start'} gap-2`}>
                    {m.from !== 'client' && (
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-cyan)]">
                        {m.from === 'staff' ? <UserRound size={13} /> : <Bot size={13} />}
                      </span>
                    )}
                    <div className={`max-w-[85%] space-y-2 ${m.from === 'client' ? 'items-end' : ''}`}>
                      {m.from === 'staff' && m.name && <p className="text-[12px] text-white/45">{m.name}</p>}
                      <div
                        className={`whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
                          m.from === 'client'
                            ? 'rounded-br-md bg-[var(--color-cyan)] text-[#0a0a0a]'
                            : 'rounded-bl-md bg-white/[0.06] text-white/90'}`}
                      >
                        {m.attachmentUrl || m.from === 'staff' || (m.from === 'client' && m.history)
                          ? <MessagePhoto body={m.text} attachmentUrl={m.attachmentUrl} stamped={m.stamped} />
                          : m.text}
                      </div>
                      {m.via === 'email' && (
                        <p className={`flex items-center gap-1 text-[12px] text-white/35 ${m.from === 'client' ? 'justify-end' : ''}`}><Mail size={11} /> Sent by email</p>
                      )}

                      {m.ai && (
                        <p className="text-[12px] leading-snug text-white/35">
                          AI answer based on our help articles. If something looks wrong, ask our team.
                        </p>
                      )}

                      {m.faq?.link && (canTicket || !m.faq.link.href.startsWith('/client')) && (
                        <Link
                          href={m.faq.link.href}
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-cyan)]/30 px-2.5 py-1.5 text-[13px] font-semibold text-[var(--color-cyan)] hover:bg-[var(--color-cyan)]/10"
                        >
                          {m.faq.link.label} <ChevronRight size={12} />
                        </Link>
                      )}

                      {!m.history && !withTeam && (m.faq || m.ai) && helped[m.id] === undefined && (
                        <div className="flex items-center gap-2 text-[13px] text-white/45">
                          Did this answer it?
                          <button type="button" onClick={() => {
                            setHelped((h) => ({ ...h, [m.id]: true }))
                            setQuestionsAfter(nextId.current)
                            reply({ from: 'bot', text: 'Glad that helped! Ask anything else any time.' })
                          }}
                            disabled={typing}
                            className="rounded-md border border-white/10 px-2 py-0.5 text-white/70 hover:bg-white/5 disabled:opacity-40">Yes</button>
                          <button type="button" onClick={() => {
                            setHelped((h) => ({ ...h, [m.id]: false }))
                            setQuestionsAfter(nextId.current)
                            reply({
                              from: 'bot',
                              text: canTicket
                                ? 'Sorry about that. Our team can look into it: tap "Talk to our team" and they will reply here.'
                                : 'Sorry about that. Our team can help: send them a message and they will reply by email.',
                              offerTicket: true,
                            })
                          }} disabled={typing} className="rounded-md border border-white/10 px-2 py-0.5 text-white/70 hover:bg-white/5 disabled:opacity-40">No</button>
                        </div>
                      )}

                      {/* The greeting's common questions, until a wrapped-up question moves them down. */}
                      {!m.history && !withTeam && m.suggestions && m.suggestions.length > 0 && !(m.id === 0 && questionsAfter !== null) && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.suggestions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => pick(s)}
                              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-[13px] text-white/75 hover:border-[var(--color-cyan)]/40 hover:text-white"
                            >
                              {s.question}
                            </button>
                          ))}
                        </div>
                      )}

                      {!m.history && !withTeam && m.offerTicket && (
                        <button
                          type="button"
                          onClick={canTicket ? () => void handOver() : toContactForm}
                          disabled={handing}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-cyan)] px-3 py-1.5 text-[13px] font-bold text-[#0a0a0a] hover:opacity-90 disabled:opacity-50"
                        >
                          {handing ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
                          {canTicket ? 'Talk to our team' : 'Message our team'}
                        </button>
                      )}
                    </div>
                  </div>
                    {/* The common questions, moved here when the question above was wrapped up. */}
                    {!withTeam && m.id === questionsAfter && (
                      <div className="flex gap-2 pt-1">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-cyan)]">
                          <MessageCircleQuestion size={13} />
                        </span>
                        <div className="max-w-[85%] space-y-1.5">
                          <p className="text-[13px] text-white/45">Have another question?</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(isPublic && !canTicket ? PUBLIC_STARTER_QUESTIONS : STARTER_QUESTIONS).map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => pick(s)}
                                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-[13px] text-white/75 hover:border-[var(--color-cyan)]/40 hover:text-white"
                              >
                                {s.question}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </Fragment>
                  )
                ))}

                {typing && <TypingBubble />}
                {withTeam && staffTyping && <TypingBubble label={`${staffTyping} is typing`} />}

                {/* Still with the assistant: a way to the team at any time. */}
                {canTicket && !withTeam && !convLoading && messages.some((m) => m.from === 'client') && (
                  <div className="flex justify-center pt-1">
                    <button type="button" onClick={() => void handOver()} disabled={handing || typing}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[13px] text-white/70 hover:border-[var(--color-cyan)]/40 hover:text-white disabled:opacity-40">
                      <Users size={13} /> Talk to our team
                    </button>
                  </div>
                )}
              </div>

              {/* Invisible unless Cloudflare asks this visitor for a tick. */}
              {visitor && <div className="relative px-3">{captcha.element}</div>}

              {sendError && <p className="px-4 pb-1 text-[13px] text-red-400">{sendError}</p>}
              <PhotoSendDialog file={photo} onCancel={() => setPhoto(null)} onSend={(url, caption) => { setPhoto(null); void sendToTeam(caption, url) }} />

              {closedForGood ? (
                <div className="shrink-0 border-t border-white/[0.07] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[13px] text-white/50">
                  This conversation is closed.{' '}
                  <button type="button" onClick={() => newChat(chatFrom)} className="font-semibold text-[var(--color-cyan)]">Start a new one</button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (convLoading) return
                    if (withTeam) { if (input.trim()) void sendToTeam(input.trim()) }
                    else ask(input)
                  }}
                  className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
                >
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111] py-1.5 pl-3.5 pr-1.5 transition-colors focus-within:border-[var(--color-cyan)]/60">
                    <input
                      id="help-question"
                      name="question"
                      value={input}
                      onChange={(e) => { setInput(e.target.value); if (withTeam) sendTyping(e.target.value.length > 0) }}
                      disabled={convLoading}
                      placeholder={withTeam ? 'Message our team…' : 'Ask a question…'}
                      aria-label={withTeam ? 'Message our team' : 'Your question'}
                      maxLength={withTeam ? 4000 : 300}
                      className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-white outline-none placeholder:text-white/30"
                    />
                    {withTeam && (
                      <>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                        <button type="button" onClick={() => fileRef.current?.click()} disabled={sending} aria-label="Send a photo"
                          className="shrink-0 rounded-md p-1.5 text-white/40 hover:bg-white/5 hover:text-white/75 disabled:opacity-30">
                          <ImagePlus size={17} />
                        </button>
                      </>
                    )}
                    <button type="submit" disabled={!input.trim() || typing || sending} aria-label="Send"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-cyan)] text-[#0a0a0a] transition-colors disabled:bg-white/[0.06] disabled:text-white/30">
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} />}
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            // ── Tickets (Intercom's Tickets space, in place of Help) ─────────
            <>
            {titleBar('Tickets')}
            <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-20 pt-4">
              {ticketsLoading && tickets.length === 0 ? (
                <p className="flex items-center gap-2 text-[14px] text-white/45"><Loader2 size={13} className="animate-spin" /> Loading your tickets…</p>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Inbox size={28} className="text-white/20" />
                  <p className="text-[14px] text-white/45">No tickets. When something needs a formal follow-up, our team opens a ticket for you and it shows here.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {tickets.map((t) => (
                    <li key={t.ticket_id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[13px] font-bold text-white/70">{t.reference}</span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-bold"
                          style={t.status === 'open'
                            ? { color: '#ffea00', borderColor: 'rgba(255,234,0,0.35)', background: 'rgba(255,234,0,0.08)' }
                            : { color: 'var(--color-cyan)', borderColor: 'rgba(77,249,237,0.35)', background: 'rgba(77,249,237,0.08)' }}
                        >
                          {t.status === 'open' ? 'Waiting for reply' : <><CheckCircle2 size={10} /> Resolved</>}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[15px] font-semibold text-white">{t.subject}</p>
                      <p className="text-[13px] text-white/40">
                        {TICKET_CATEGORY_LABEL[t.category]}
                        {t.bookings?.reference_number ? ` · ${t.bookings.reference_number}` : ''}
                        {' · '}{formatDateTime(t.created_at)}
                        {openedByStaff(t) ? ' · Opened by our team' : ''}
                      </p>
                      {t.resolution_note && (
                        <p className="mt-2 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[13px] leading-snug text-white/70">{t.resolution_note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-[12px] leading-snug text-white/30">
                Ticket replies come by email. To add details to a ticket, reply to its email.
              </p>
            </div>
            {askPill('tickets')}
            </div>
            </>
          )}

          {/* Bottom bar: clients only, hidden in a conversation. */}
          {canTicket && tab !== 'chat' && !(tab === 'messages' && showEarlier && inbox.thread) && (
            <nav className="grid shrink-0 grid-cols-3 border-t border-white/[0.07] bg-[#0d0d0d] pb-[env(safe-area-inset-bottom)]" role="tablist" aria-label="Help sections">
              {([['home', 'Home', Home], ['messages', 'Messages', MessageSquare], ['tickets', 'Tickets', Ticket]] as const).map(([key, label, Icon]) => {
                const badge = key === 'messages' ? totalUnread : key === 'tickets' ? openCount : 0
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => { setTab(key); if (key === 'messages') setShowEarlier(false) }}
                    className={`flex flex-col items-center gap-1 py-2.5 text-[14px] font-bold transition-colors ${tab === key ? 'text-[var(--color-cyan)]' : 'text-white/50 hover:text-white/80'}`}
                  >
                    <span className="relative">
                      <Icon size={20} />
                      {badge > 0 && (
                        <span className={`absolute -right-3 -top-1.5 min-w-[18px] rounded-full px-1 text-center text-[12px] font-bold leading-[18px] tabular-nums ${key === 'messages' ? 'bg-[var(--color-cyan)] text-[#0a0a0a]' : 'bg-white/15 text-white/80'}`}>
                          {badge > 9 ? '9+' : badge}
                        </span>
                      )}
                    </span>
                    {label}
                  </button>
                )
              })}
            </nav>
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
