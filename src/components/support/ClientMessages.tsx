'use client'

import { useStickToBottom } from '@/lib/hooks/useStickToBottom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, ImagePlus, Loader2, MessageSquare, Send, Truck, UserRound, Users, X } from 'lucide-react'

import { messagingService } from '@/lib/services/messaging.service'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { getApiErrorMessage } from '@/lib/api-error'
import { nameWithRole, roleLabel } from '@/lib/roles'
import { bookingRef } from '@/lib/booking'
import { formatConversationTime, groupEventText } from '@/app/utils/messaging.utils'
import { toGroup, toGroupMessage } from '@/app/types/messaging/messaging.types'
import type { ConversationWithDetails, MessageRow, MessagableUser, Group, GroupMessage } from '@/app/types/messaging/messaging.types'
import PhotoSendDialog, { MAX_PHOTO_BYTES } from '@/components/messaging/PhotoSendDialog'
import MessageItem from '@/components/messaging/MessageItem'
import { BookingMentionMenu, useBookingMentionPicker } from '@/components/messaging/BookingMention'
import JumpToLatest from '@/components/messaging/JumpToLatest'
import { cachedData, cachedFetch } from '@/lib/query/useApiQuery'
import { useCatchUp } from '@/lib/hooks/useLiveTable'
import { Tip } from '@/components/ui/tooltip'

/**
 * The client's messages, inside the help assistant rather than the staff
 * messenger. Who can reach a client is decided by the API:
 *
 *   - the Company Administrator and the Operations Manager, any time
 *   - never a driver (driver <-> client chat turned off 2026-10-27; the API
 *     returns no drivers, so the driver list and composer stay hidden)
 *
 * Staff conversations show here read-only; to reach our team the client asks
 * the assistant / opens a ticket.
 */

type Thread =
  | { kind: 'conversation'; id: string }
  | { kind: 'draft'; driver: MessagableUser }
  /** The client's "8338 Team" chat (2026-11-22): every Operations Manager and Company Administrator. */
  | { kind: 'team' }

/** Shown for the team chat in place of a person. */
export const TEAM_NAME = '8338 Team'

const fullName = (u: { first_name: string | null; last_name: string | null }) =>
  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown'

/**
 * The booking numbers to show beside a name: a driver's current deliveries for
 * this client when they have any, else the booking the chat was started for.
 */
function bookingRefsFor(
  userId: string,
  drivers: MessagableUser[],
  conv?: ConversationWithDetails | null,
): string[] {
  const live = drivers.find((d) => d.user_id === userId)?.bookings ?? []
  const rows = live.length > 0 ? live : conv?.booking ? [conv.booking] : []
  return [...new Set(rows.map((b) => bookingRef(b)).filter(Boolean))]
}

function BookingRefs({ refs }: { refs: string[] }) {
  if (refs.length === 0) return null
  return (
    <>
      {refs.map((r) => (
        <span key={r} className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-px font-mono text-[10px] text-white/60">
          {r}
        </span>
      ))}
    </>
  )
}

export function useClientMessages(userId: string | undefined, visible: boolean) {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([])
  const [drivers,       setDrivers]       = useState<MessagableUser[]>([])
  const [loading,       setLoading]       = useState(false)
  const [thread,        setThread]        = useState<Thread | null>(null)
  const [messages,      setMessages]      = useState<MessageRow[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [sendError,     setSendError]     = useState<string | null>(null)
  // The "8338 Team" chat: a group the server keeps (client + the team).
  const [team,          setTeam]          = useState<Group | null>(null)
  const [teamMessages,  setTeamMessages]  = useState<GroupMessage[]>([])
  const [teamTyping,    setTeamTyping]    = useState<Record<string, true>>({})
  const setTotalUnread = useMessengerStore((s) => s.setTotalUnread)

  const threadRef  = useRef(thread)
  const visibleRef = useRef(visible)
  useEffect(() => { threadRef.current = thread; visibleRef.current = visible })

  const refresh = useCallback(async () => {
    if (!userId) return
    // Seen before: the lists show at once (cache), then refresh.
    const apply = ([convs, ds]: [
      Awaited<ReturnType<typeof messagingService.getConversations>>,
      Awaited<ReturnType<typeof messagingService.getMessagableUsers>>,
    ]) => { setConversations(convs); setDrivers(ds) }
    const key    = ['messaging', 'client-inbox'] as const
    const cached = cachedData<Parameters<typeof apply>[0]>(key)
    if (cached) apply(cached); else setLoading(true)
    try {
      const fresh = await cachedFetch(key, () => Promise.all([
        messagingService.getConversations(),
        messagingService.getMessagableUsers(),
      ]))
      apply(fresh)
    } catch { /* keep the last list */ }
    finally { setLoading(false) }
    // The team chat (made by the server on the first load).
    try {
      const groups = await messagingService.getGroups()
      const raw = groups.find((g) => g.client_id)
      setTeam(raw ? toGroup(raw) : null)
    } catch { /* keep the last one */ }
  }, [userId])

  // Loaded once for the unread badge, and again whenever the tab is shown:
  // which drivers can be messaged follows the bookings' status.
  useEffect(() => { void refresh() }, [refresh])
  // Back from a hidden tab or offline: changes made meanwhile never arrived live.
  useCatchUp(() => { void refresh() })
  useEffect(() => { if (visible) void refresh() }, [visible, refresh])

  const totalUnread = useMemo(
    () => conversations.reduce((n, c) => n + c.unread_count, 0) + (team?.unread_count ?? 0),
    [conversations, team?.unread_count],
  )
  useEffect(() => { setTotalUnread(totalUnread) }, [totalUnread, setTotalUnread])

  const openConversation = useCallback(async (conversationId: string) => {
    setThread({ kind: 'conversation', id: conversationId })
    setSendError(null)
    const key    = ['messaging', 'client-thread', conversationId] as const
    const cached = cachedData<Awaited<ReturnType<typeof messagingService.getMessages>>>(key)
    setMessages(cached ?? [])
    setThreadLoading(!cached)
    setConversations((prev) => prev.map((c) => (c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c)))
    try {
      setMessages(await cachedFetch(key, () => messagingService.getMessages(conversationId, { limit: 50 })))
      void messagingService.markAsRead(conversationId).catch(() => {})
    } catch { /* the thread shows empty */ }
    finally { setThreadLoading(false) }
  }, [])

  const openDriver = useCallback((driver: MessagableUser) => {
    const existing = conversations.find((c) => c.other_user.user_id === driver.user_id)
    if (existing) { void openConversation(existing.conversation_id); return }
    setSendError(null)
    setMessages([])
    setThread({ kind: 'draft', driver })
  }, [conversations, openConversation])

  const closeThread = useCallback(() => { setThread(null); setSendError(null); setTeamTyping({}) }, [])

  const openTeam = useCallback(async () => {
    if (!team) return
    setThread({ kind: 'team' })
    setSendError(null)
    const key    = ['messaging', 'client-team', team.id] as const
    const cached = cachedData<GroupMessage[]>(key)
    setTeamMessages(cached ?? [])
    setThreadLoading(!cached)
    setTeam((t) => (t ? { ...t, unread_count: 0 } : t))
    try {
      setTeamMessages(await cachedFetch(key, async () =>
        (await messagingService.getGroupMessages(team.id, { limit: 50 })).map(toGroupMessage)))
      void messagingService.markGroupRead(team.id).catch(() => {})
    } catch { /* the thread shows empty */ }
    finally { setThreadLoading(false) }
  }, [team])

  const append = useCallback((m: MessageRow) => {
    setMessages((prev) => (prev.some((x) => x.message_id === m.message_id) ? prev : [...prev, m]))
  }, [])

  const send = useCallback(async (text: string, attachmentUrl?: string): Promise<boolean> => {
    const t = threadRef.current
    const content = text.trim()
    if (!t || (!content && !attachmentUrl)) return false
    setSendError(null)
    try {
      if (t.kind === 'team') {
        if (!team) return false
        const raw = await messagingService.sendGroupMessage(team.id, { content, attachment_url: attachmentUrl })
        const m = toGroupMessage(raw)
        setTeamMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      } else if (t.kind === 'conversation') {
        append(await messagingService.sendMessage(t.id, { content, attachment_url: attachmentUrl }))
      } else {
        const msg = await messagingService.sendDirectMessage({
          target_user_id: t.driver.user_id, content, attachment_url: attachmentUrl, booking_id: t.driver.booking_id,
        })
        append(msg)
        setThread({ kind: 'conversation', id: msg.conversation_id })
        void refresh()
      }
      return true
    } catch (e) {
      setSendError(getApiErrorMessage(e, 'The message could not be sent. Please try again.'))
      return false
    }
  }, [append, refresh, team])

  useMessagingRealtime({
    currentUserId: userId ?? '',
    onNewMessage: (raw) => {
      const t      = threadRef.current
      const isOpen = visibleRef.current && t?.kind === 'conversation' && t.id === raw.conversation_id
      if (isOpen) {
        append(raw)
        if (raw.sender_id !== userId) void messagingService.markAsRead(raw.conversation_id).catch(() => {})
      }
      let known = false
      setConversations((prev) => prev.map((c) => {
        if (c.conversation_id !== raw.conversation_id) return c
        known = true
        return {
          ...c,
          last_message: { message_id: raw.message_id, content: raw.content, sent_at: raw.sent_at, sender_id: raw.sender_id },
          last_message_at: raw.sent_at,
          unread_count: raw.sender_id === userId || isOpen ? 0 : c.unread_count + 1,
        }
      }).sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')))
      if (!known) void refresh()
    },
    // The team chat's messages reach the client's own channel too.
    onGroupMessage: (raw) => {
      if (!team || raw.group_id !== team.id) { if (!team) void refresh(); return }
      const m      = toGroupMessage(raw)
      const isOpen = visibleRef.current && threadRef.current?.kind === 'team'
      if (isOpen) {
        setTeamMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        if (raw.sender_id !== userId) void messagingService.markGroupRead(team.id).catch(() => {})
      }
      setTeamTyping((p) => { const n = { ...p }; delete n[raw.sender_id]; return n })
      setTeam((t) => t && ({
        ...t,
        last_message: { message_id: m.id, body: m.body, created_at: m.created_at, sender_id: m.sender_id },
        unread_count: raw.sender_id === userId || isOpen || m.kind === 'system' ? t.unread_count : t.unread_count + 1,
      }))
    },
  })

  // "Maria is typing…" in the open team chat, and ours for the team to see.
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const { broadcastTyping } = useMessagingRealtime({
    currentUserId: thread?.kind === 'team' && team ? (userId ?? '') : '',
    conversationId: team ? `group:${team.id}` : undefined,
    onTyping: (who, isTyping) => {
      if (typingTimers.current[who]) clearTimeout(typingTimers.current[who])
      setTeamTyping((p) => { const n = { ...p }; if (isTyping) n[who] = true; else delete n[who]; return n })
      if (isTyping) typingTimers.current[who] = setTimeout(() => setTeamTyping((p) => { const n = { ...p }; delete n[who]; return n }), 3000)
    },
  })

  return {
    conversations, drivers, loading, thread, messages, threadLoading, sendError, totalUnread,
    openConversation, openDriver, closeThread, send,
    team, teamMessages, teamTyping, openTeam, broadcastTyping,
  }
}

export type ClientMessagesState = ReturnType<typeof useClientMessages>

export function ClientMessagesPanel({ state, userId, onAskAssistant, onClose }: {
  state: ClientMessagesState
  userId: string
  onAskAssistant: () => void
  /** Shows a close (X) in a conversation's header (the help panel hides its own header there). */
  onClose?: () => void
}) {
  const { conversations, drivers, loading, thread, messages, threadLoading, sendError, team, teamMessages } = state
  const [input,   setInput]   = useState('')
  const [sending, setSending] = useState(false)
  const [photo,   setPhoto]   = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const fileRef  = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // "@" opens the client's own bookings; picking one writes its number in.
  const mention  = useBookingMentionPicker(input, setInput, inputRef)

  const bottomRef = useRef<HTMLDivElement>(null)
  // Opens on your first unread message; after that follows only while you're at the bottom.
  const openConv = thread?.kind === 'conversation' ? conversations.find((c) => c.conversation_id === thread.id) : null
  const isTeam   = thread?.kind === 'team'
  const chatMessages = useMemo(
    () => isTeam
      ? teamMessages.map((m) => ({ id: m.id, sender_id: m.sender_id, created_at: m.created_at }))
      : messages.map((m) => ({ id: m.message_id, sender_id: m.sender_id, created_at: m.sent_at })),
    [isTeam, teamMessages, messages],
  )
  const threadKey = thread?.kind === 'conversation' ? thread.id : thread?.kind === 'team' ? 'team' : thread ? 'draft' : null
  const { scrollToLatest, atLatest } = useStickToBottom(bottomRef, threadKey, [messages, teamMessages, thread, state.teamTyping], {
    ready: !threadLoading,
    messages: chatMessages,
    currentUserId: userId,
    lastReadAt: openConv
      ? (openConv.participant_a_id === userId ? openConv.participant_a_last_read_at : openConv.participant_b_last_read_at)
      : null,
  })

  // The team members, for names on their messages and the typing line.
  const teamMember = (id: string) => team?.members.find((m) => m.user_id === id)
  const typingNames = Object.keys(state.teamTyping)
    .map((id) => teamMember(id)?.first_name)
    .filter((n): n is string => !!n)

  const driverIds = useMemo(() => new Set(drivers.map((d) => d.user_id)), [drivers])

  // ── Conversation list ──────────────────────────────────────────────────────
  if (!thread) {
    const newDrivers = drivers.filter((d) => !conversations.some((c) => c.other_user.user_id === d.user_id))
    return (
      // Bottom room for the help panel's floating "Ask a question" button.
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-20 pt-4">
        {drivers.length > 0 && (
          <div className="mb-4 space-y-1.5">
            <p className="text-[10px] font-bold uppercase text-white/40">Your drivers</p>
            {drivers.map((d) => (
              <button
                key={d.user_id}
                type="button"
                onClick={() => state.openDriver(d)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--color-cyan)]/25 bg-[var(--color-cyan)]/[0.05] px-3 py-2.5 text-left hover:bg-[var(--color-cyan)]/10"
              >
                <Avatar role="driver" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-white">{fullName(d)}</span>
                    <BookingRefs refs={bookingRefsFor(d.user_id, drivers)} />
                  </span>
                  <span className="block text-[11px] text-white/45">Driver on your active delivery</span>
                </span>
                <span className="text-[11px] font-semibold text-[var(--color-cyan)]">
                  {newDrivers.includes(d) ? 'Message' : 'Open'}
                </span>
                <ChevronRight size={14} className="text-[var(--color-cyan)]" />
              </button>
            ))}
          </div>
        )}

        {/* The "8338 Team" chat: always first; the client writes to the whole team here. */}
        {team && (
          <button
            type="button"
            onClick={() => void state.openTeam()}
            className="mb-4 flex w-full items-center gap-2.5 rounded-xl border border-[var(--color-cyan)]/25 bg-[var(--color-cyan)]/[0.05] px-3 py-2.5 text-left hover:bg-[var(--color-cyan)]/10"
          >
            <TeamAvatar />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-white">{TEAM_NAME}</span>
                {team.last_message && <span className="shrink-0 text-[10px] text-white/35">{formatConversationTime(team.last_message.created_at)}</span>}
              </span>
              <span className={`block truncate text-[12px] ${team.unread_count > 0 ? 'font-semibold text-white' : 'text-white/55'}`}>
                {team.last_message
                  ? `${team.last_message.sender_id === userId ? 'You: ' : ''}${team.last_message.body || 'Photo'}`
                  : 'Message our Operations Managers and Company Administrators'}
              </span>
            </span>
            {team.unread_count > 0 ? (
              <span className="min-w-[18px] rounded-full bg-[var(--color-cyan)] px-1.5 text-center text-[10px] font-bold leading-[18px] text-[#0a0a0a]">
                {team.unread_count > 9 ? '9+' : team.unread_count}
              </span>
            ) : <ChevronRight size={14} className="text-[var(--color-cyan)]" />}
          </button>
        )}

        {loading && conversations.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-white/45"><Loader2 size={13} className="animate-spin" /> Loading your messages…</p>
        ) : conversations.length === 0 ? (
          team ? null :
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <MessageSquare size={28} className="text-white/20" />
            <p className="text-xs leading-snug text-white/45">
              No messages yet. Messages from our team will show up here.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-1.5 text-[10px] font-bold uppercase text-white/40">Conversations</p>
            <ul className="space-y-1.5">
              {conversations.map((c) => {
                const other = c.other_user
                const last  = c.last_message
                return (
                  <li key={c.conversation_id}>
                    <button
                      type="button"
                      onClick={() => void state.openConversation(c.conversation_id)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-left hover:bg-white/[0.05]"
                    >
                      <Avatar role={other.role} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-white">{fullName(other)}</span>
                            <BookingRefs refs={bookingRefsFor(other.user_id, drivers, c)} />
                          </span>
                          {last && <span className="shrink-0 text-[10px] text-white/35">{formatConversationTime(last.sent_at)}</span>}
                        </span>
                        <span className="block text-[11px] text-white/40">{roleLabel(other.role)}</span>
                        {last && (
                          <span className={`block truncate text-[12px] ${c.unread_count > 0 ? 'font-semibold text-white' : 'text-white/55'}`}>
                            {last.sender_id === userId ? 'You: ' : ''}{last.content}
                          </span>
                        )}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="min-w-[18px] rounded-full bg-[var(--color-cyan)] px-1.5 text-center text-[10px] font-bold leading-[18px] text-[#0a0a0a]">
                          {c.unread_count > 9 ? '9+' : c.unread_count}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    )
  }

  // ── One thread ─────────────────────────────────────────────────────────────
  const conv  = thread.kind === 'conversation' ? conversations.find((c) => c.conversation_id === thread.id) : null
  const other = thread.kind === 'draft' ? thread.driver : thread.kind === 'team' ? undefined : conv?.other_user
  const canSend = isTeam || thread.kind === 'draft' || (!!other && other.role === 'driver' && driverIds.has(other.user_id))

  const submit = async () => {
    if (!input.trim() || sending) return
    scrollToLatest()
    setSending(true)
    const ok = await state.send(input)
    setSending(false)
    if (ok) setInput('')
  }

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setPhotoError('Only photos can be sent'); return }
    if (file.size > MAX_PHOTO_BYTES) { setPhotoError('Photos can be up to 10 MB'); return }
    setPhotoError(null)
    setPhoto(file)
  }

  const sendPhoto = async (attachmentUrl: string, caption: string) => {
    scrollToLatest()
    setPhoto(null)
    setSending(true)
    await state.send(caption, attachmentUrl)
    setSending(false)
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <button type="button" onClick={state.closeThread} aria-label="Back to messages"
          className="rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        {isTeam ? <TeamAvatar /> : other && <Avatar role={other.role} />}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-white">{isTeam ? TEAM_NAME : other ? fullName(other) : 'Conversation'}</span>
            {other && <BookingRefs refs={bookingRefsFor(other.user_id, drivers, conv)} />}
          </p>
          {isTeam ? (
            <p className="truncate text-[11px] text-white/40">
              {typingNames.length === 1 ? `${typingNames[0]} is typing…`
                : typingNames.length > 1 ? 'Our team is typing…'
                : 'Operations Managers and Company Administrators · Mon–Sat 8 AM–5 PM'}
            </p>
          ) : other && <p className="text-[11px] text-white/40">{roleLabel(other.role)}</p>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isTeam ? (
          threadLoading ? (
            <p className="flex items-center gap-2 text-xs text-white/45"><Loader2 size={13} className="animate-spin" /> Loading messages…</p>
          ) : teamMessages.length === 0 ? (
            <p className="py-6 text-center text-xs leading-snug text-white/40">
              Write to our Operations Managers and Company Administrators. Anyone on the team can answer, and you&apos;ll see who did.
              Booking changes are made in Booking, not here.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {teamMessages.map((m, i) => {
                if (m.kind === 'system') {
                  return (
                    <li key={m.id} className="mx-auto max-w-[90%] rounded-lg bg-white/[0.04] px-3 py-2 text-center text-[11px] leading-snug text-white/55">
                      {groupEventText(m, userId, (id) => teamMember(id)?.first_name)}
                    </li>
                  )
                }
                const mine   = m.sender_id === userId
                const sender = teamMember(m.sender_id)
                const name   = mine ? 'You' : sender ? nameWithRole(sender.first_name, sender.last_name, sender.role) : TEAM_NAME
                const next   = teamMessages[i + 1]
                return (
                  <MessageItem
                    key={m.id}
                    messageId={m.id}
                    isMine={mine}
                    currentUserId={userId}
                    senderName={name}
                    showName={!next || next.sender_id !== m.sender_id || next.kind === 'system'}
                    initials={(sender ? `${sender.first_name[0] ?? ''}${sender.last_name[0] ?? ''}` : '8').toUpperCase() || '?'}
                    createdAt={m.created_at}
                    body={m.body}
                    attachmentUrl={m.attachment_url}
                    stamped={m.attachment_stamped}
                  />
                )
              })}
            </ul>
          )
        ) : threadLoading ? (
          <p className="flex items-center gap-2 text-xs text-white/45"><Loader2 size={13} className="animate-spin" /> Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/40">
            {thread.kind === 'draft' ? 'Say hello to your driver.' : 'No messages yet.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => {
              const mine = m.sender_id === userId
              const name = other ? fullName(other) : 'Unknown'
              return (
                <MessageItem
                  key={m.message_id}
                  messageId={m.message_id}
                  isMine={mine}
                  currentUserId={userId}
                  senderName={name}
                  showName={messages[i + 1]?.sender_id !== m.sender_id}
                  initials={name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?'}
                  createdAt={m.sent_at}
                  body={m.content}
                  attachmentUrl={m.attachment_url}
                  stamped={m.attachment_stamped}
                />
              )
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {canSend ? (
        <form
          onSubmit={(e) => { e.preventDefault(); void submit() }}
          className="relative border-t border-white/[0.07] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <JumpToLatest show={!atLatest && !mention.open} onClick={scrollToLatest} />
          {sendError && <p className="mb-2 text-[11px] text-red-400">{sendError}</p>}
          {photoError && <p className="mb-2 text-[11px] text-red-400">{photoError}</p>}
          <PhotoSendDialog file={photo} onCancel={() => setPhoto(null)} onSend={(url, caption) => void sendPhoto(url, caption)} />
          {/* Untitled UI's minimal message composer, with our photo button. */}
          <div className="flex items-center gap-2">
            <div className="relative flex min-w-0 flex-1 items-center rounded-lg bg-white/[0.03] shadow-xs ring-1 ring-white/10 ring-inset transition-shadow duration-100 focus-within:ring-[var(--color-cyan)]/40">
              <BookingMentionMenu picker={mention} />
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); mention.sync(); if (isTeam) state.broadcastTyping(e.target.value.length > 0) }}
                onKeyDown={(e) => { mention.onKeyDown(e) }}
                onSelect={mention.sync}
                onBlur={() => setTimeout(mention.close, 150)}
                placeholder={isTeam ? 'Message our team…' : 'Message your driver…'}
                aria-label="Message"
                maxLength={5000}
                className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/30"
              />
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
              <Tip label="Send a photo (up to 10 MB)"><button type="button" onClick={() => fileRef.current?.click()} disabled={sending} aria-label="Send a photo"
                className="mr-1.5 shrink-0 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/75 disabled:opacity-30">
                <ImagePlus size={16} />
              </button></Tip>
            </div>
            <button type="submit" disabled={!input.trim() || sending} aria-label="Send"
              className="flex shrink-0 items-center justify-center rounded-lg bg-[var(--color-cyan)] p-3 text-[#0a0a0a] shadow-xs transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/[0.05] disabled:text-white/25">
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </form>
      ) : (
        <div className="border-t border-white/[0.07] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[11px] leading-snug text-white/45">
          {other?.role === 'driver'
            ? 'Messaging drivers is no longer available. '
            : 'Replies to our team aren’t sent from here. '}
          <button type="button" onClick={onAskAssistant} className="font-semibold text-[var(--color-cyan)]">
            Need help? Ask the assistant
          </button>
        </div>
      )}
    </>
  )
}

function TeamAvatar() {
  return (
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cyan)]/15 text-[var(--color-cyan)]">
      <Users size={15} />
    </span>
  )
}

function Avatar({ role, small }: { role: string; small?: boolean }) {
  const size = small ? 'h-6 w-6' : 'h-8 w-8'
  return (
    <span className={`mt-0.5 flex ${size} shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-cyan)]`}>
      {role === 'driver' ? <Truck size={small ? 12 : 15} /> : <UserRound size={small ? 12 : 15} />}
    </span>
  )
}
