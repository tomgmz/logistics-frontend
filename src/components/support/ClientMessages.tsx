'use client'

import { useStickToBottom } from '@/lib/hooks/useStickToBottom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, ImagePlus, Loader2, MessageSquare, Send, Truck, UserRound } from 'lucide-react'

import { messagingService } from '@/lib/services/messaging.service'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { getApiErrorMessage } from '@/lib/api-error'
import { roleLabel } from '@/lib/roles'
import { bookingRef } from '@/lib/booking'
import { formatConversationTime, formatMessageTime } from '@/app/utils/messaging.utils'
import type { ConversationWithDetails, MessageRow, MessagableUser } from '@/app/types/messaging/messaging.types'
import PhotoSendDialog, { MAX_PHOTO_BYTES } from '@/components/messaging/PhotoSendDialog'
import MessagePhoto from '@/components/messaging/MessagePhoto'

/**
 * The client's messages, inside the help assistant rather than the staff
 * messenger. Who can reach a client is decided by the API:
 *
 *   - the Company Administrator and the Operations Manager, any time
 *   - the driver (main or second) of an active delivery, from assignment until
 *     the client confirms completion
 *
 * The client can only write to such a driver. Staff conversations show here
 * read-only; to reach our team the client asks the assistant / opens a ticket.
 */

type Thread =
  | { kind: 'conversation'; id: string }
  | { kind: 'draft'; driver: MessagableUser }

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
  const setTotalUnread = useMessengerStore((s) => s.setTotalUnread)

  const threadRef  = useRef(thread)
  const visibleRef = useRef(visible)
  useEffect(() => { threadRef.current = thread; visibleRef.current = visible })

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [convs, ds] = await Promise.all([
        messagingService.getConversations(),
        messagingService.getMessagableUsers(),
      ])
      setConversations(convs)
      setDrivers(ds)
    } catch { /* keep the last list */ }
    finally { setLoading(false) }
  }, [userId])

  // Loaded once for the unread badge, and again whenever the tab is shown:
  // which drivers can be messaged follows the bookings' status.
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (visible) void refresh() }, [visible, refresh])

  const totalUnread = useMemo(() => conversations.reduce((n, c) => n + c.unread_count, 0), [conversations])
  useEffect(() => { setTotalUnread(totalUnread) }, [totalUnread, setTotalUnread])

  const openConversation = useCallback(async (conversationId: string) => {
    setThread({ kind: 'conversation', id: conversationId })
    setSendError(null)
    setMessages([])
    setThreadLoading(true)
    setConversations((prev) => prev.map((c) => (c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c)))
    try {
      setMessages(await messagingService.getMessages(conversationId, { limit: 50 }))
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

  const closeThread = useCallback(() => { setThread(null); setSendError(null) }, [])

  const append = useCallback((m: MessageRow) => {
    setMessages((prev) => (prev.some((x) => x.message_id === m.message_id) ? prev : [...prev, m]))
  }, [])

  const send = useCallback(async (text: string, attachmentUrl?: string): Promise<boolean> => {
    const t = threadRef.current
    const content = text.trim()
    if (!t || (!content && !attachmentUrl)) return false
    setSendError(null)
    try {
      if (t.kind === 'conversation') {
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
  }, [append, refresh])

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
  })

  return {
    conversations, drivers, loading, thread, messages, threadLoading, sendError, totalUnread,
    openConversation, openDriver, closeThread, send,
  }
}

export type ClientMessagesState = ReturnType<typeof useClientMessages>

export function ClientMessagesPanel({ state, userId, onAskAssistant }: {
  state: ClientMessagesState
  userId: string
  onAskAssistant: () => void
}) {
  const { conversations, drivers, loading, thread, messages, threadLoading, sendError } = state
  const [input,   setInput]   = useState('')
  const [sending, setSending] = useState(false)
  const [photo,   setPhoto]   = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const fileRef  = useRef<HTMLInputElement>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  useStickToBottom(bottomRef, thread?.kind === 'conversation' ? thread.id : thread ? 'draft' : null, [messages, thread])

  const driverIds = useMemo(() => new Set(drivers.map((d) => d.user_id)), [drivers])

  // ── Conversation list ──────────────────────────────────────────────────────
  if (!thread) {
    const newDrivers = drivers.filter((d) => !conversations.some((c) => c.other_user.user_id === d.user_id))
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4">
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

        {loading && conversations.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-white/45"><Loader2 size={13} className="animate-spin" /> Loading your messages…</p>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <MessageSquare size={28} className="text-white/20" />
            <p className="text-xs leading-snug text-white/45">
              No messages yet. When a driver is assigned to your delivery you can message them here,
              and messages from our team will show up here too.
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
  const other = thread.kind === 'draft' ? thread.driver : conv?.other_user
  const canSend = thread.kind === 'draft' || (!!other && other.role === 'driver' && driverIds.has(other.user_id))

  const submit = async () => {
    if (!input.trim() || sending) return
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
        {other && <Avatar role={other.role} />}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-white">{other ? fullName(other) : 'Conversation'}</span>
            {other && <BookingRefs refs={bookingRefsFor(other.user_id, drivers, conv)} />}
          </p>
          {other && <p className="text-[11px] text-white/40">{roleLabel(other.role)}</p>}
        </div>
      </div>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {threadLoading ? (
          <p className="flex items-center gap-2 text-xs text-white/45"><Loader2 size={13} className="animate-spin" /> Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/40">
            {thread.kind === 'draft' ? 'Say hello to your driver.' : 'No messages yet.'}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === userId
            return (
              <div key={m.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'} gap-2`}>
                {!mine && other && <Avatar role={other.role} small />}
                <div className={`max-w-[85%] space-y-1 ${mine ? 'text-right' : ''}`}>
                  <div
                    className={`whitespace-pre-line break-words rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed ${
                      mine ? 'rounded-br-md bg-[var(--color-cyan)] text-[#0a0a0a]' : 'rounded-bl-md bg-white/[0.06] text-white/90'}`}
                  >
                    <MessagePhoto body={m.content} attachmentUrl={m.attachment_url} stamped={m.attachment_stamped} />
                  </div>
                  <p className="px-1 text-[10px] text-white/30">{formatMessageTime(m.sent_at)}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {canSend ? (
        <form
          onSubmit={(e) => { e.preventDefault(); void submit() }}
          className="border-t border-white/[0.07] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {sendError && <p className="mb-2 text-[11px] text-red-400">{sendError}</p>}
          {photoError && <p className="mb-2 text-[11px] text-red-400">{photoError}</p>}
          <PhotoSendDialog file={photo} onCancel={() => setPhoto(null)} onSend={(url, caption) => void sendPhoto(url, caption)} />
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={sending}
              title="Send a photo (up to 10 MB)" aria-label="Send a photo"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-white/60 hover:text-white disabled:opacity-30">
              <ImagePlus size={16} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message your driver…"
              maxLength={5000}
              className="flex-1 rounded-xl border border-white/10 bg-[#111] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-[var(--color-cyan)]/50"
            />
            <button type="submit" disabled={!input.trim() || sending} aria-label="Send"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-cyan)] text-[#0a0a0a] disabled:opacity-30">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </form>
      ) : (
        <div className="border-t border-white/[0.07] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[11px] leading-snug text-white/45">
          {other?.role === 'driver'
            ? 'This delivery is complete, so this chat is closed. '
            : 'Replies to our team aren’t sent from here. '}
          <button type="button" onClick={onAskAssistant} className="font-semibold text-[var(--color-cyan)]">
            Need help? Ask the assistant
          </button>
        </div>
      )}
    </>
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
