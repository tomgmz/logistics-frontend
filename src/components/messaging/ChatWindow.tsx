'use client'

import { useStickToBottom } from '@/lib/hooks/useStickToBottom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessageRow } from '@/lib/services/messaging.service'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import MessageBubble from './MessageBubble'
import { MessageDateDivider, TypingMessage } from './MessageItem'
import MessageInput from './MessageInput'
import { groupMessagesByDate, isReadBy } from '@/app/utils/messaging.utils'
import type {
  Conversation,
  Message,
  MessageReaction,
  MessageParticipant,
  MessagableUser,
  ReactionTogglePayload,
} from '@/app/types/messaging/messaging.types'
import { toMessage, PHOTO_PLACEHOLDER } from '@/app/types/messaging/messaging.types'
import { roleLabel, nameWithRole } from '@/lib/roles'

interface ReplyTo { messageId: string; content: string; senderName: string }

interface ChatWindowProps {
  conversation?:          Conversation
  draftUser?:             MessagableUser
  currentUserId:          string
  isParticipantOnline?:   boolean
  onBack:                 () => void
  onMessageSent?:         (conversationId: string, body: string, senderId: string) => void
  onConversationCreated?: (conversationId: string) => void
}

function applyReactionToggle(
  messages: Message[],
  payload: ReactionTogglePayload,
  currentUserId: string
): Message[] {
  return messages.map(m => {
    if (m.id !== payload.message_id) return m
    // Remove any existing reaction from this user first
    const base = m.reactions.filter(r => r.user_id !== payload.user_id)
    const reactions: MessageReaction[] = payload.action === 'added'
      ? [...base, { emoji: payload.emoji, user_id: payload.user_id }]
      : base
    return { ...m, reactions }
  })
}

function toMessage2(raw: MessageRow): Message {
  return toMessage(raw)
}

function TypingDots() {
  return (
    <span className="flex items-center gap-[3px]">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)]/60 inline-block"
          animate={{ y: [0, -4, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
      ))}
    </span>
  )
}


export default function ChatWindow({ conversation, draftUser, currentUserId, isParticipantOnline = false, onBack, onMessageSent, onConversationCreated }: ChatWindowProps) {
  const isDraft     = !conversation
  const convId      = conversation?.id ?? ''
  const participant: MessageParticipant = conversation
    ? conversation.participants[0]
    : {
        user_id:    draftUser!.user_id,
        first_name: draftUser!.first_name ?? '',
        last_name:  draftUser!.last_name  ?? '',
        role:       draftUser!.role,
        email:      draftUser!.email,
        is_online:  false,
      }
  const realtimeConvId = convId || `draft:${participant.user_id}`
  const initials    = `${participant.first_name?.[0] ?? '?'}${participant.last_name?.[0] ?? '?'}`.toUpperCase()
  const bottomRef   = useRef<HTMLDivElement>(null)

  const [messages, setMessages]               = useState<Message[]>([])
  const [loading, setLoading]                 = useState(true)
  const [sending, setSending]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [isOtherTyping, setIsOtherTyping]     = useState(false)

  const isOnline                              = isParticipantOnline
  const [replyTo, setReplyTo]                 = useState<ReplyTo | null>(null)
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(() => {
    if (!conversation) return null
    return conversation.participant_a_id === currentUserId
      ? conversation.participant_b_last_read_at
      : conversation.participant_a_last_read_at
  })
  const typingTimeout                         = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Every message of yours up to the other person's last read has been seen.
  const isSeen = (m: Message) => !m.id.startsWith('optimistic-') && isReadBy(otherLastReadAt, m.created_at)
  const pendingIds                            = useRef<Set<string>>(new Set())

  const fetchMessages = useCallback(async () => {
    // A draft has no conversation yet — nothing to load.
    if (!convId) { setMessages([]); setLoading(false); return }
    try {
      setError(null)
      setLoading(true)
      const raw = await messagingService.getMessages(convId)
      setMessages(raw.map(toMessage2))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [convId])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => { if (convId) messagingService.markAsRead(convId).catch(() => {}) }, [convId])
  // Opens on your first unread message; after that follows only while you're at the bottom.
  const myLastReadAt = conversation
    ? (conversation.participant_a_id === currentUserId ? conversation.participant_a_last_read_at : conversation.participant_b_last_read_at)
    : null
  const { scrollToLatest, atLatest } = useStickToBottom(bottomRef, realtimeConvId, [messages, isOtherTyping], {
    ready: !loading, messages, currentUserId, lastReadAt: myLastReadAt,
  })

  const { broadcastTyping } = useMessagingRealtime({
    currentUserId,
    onMessageUnsent: ({ message_id }) => setMessages(prev => prev.filter(m => m.id !== message_id)),
    conversationId: realtimeConvId,
    onNewMessage: (raw) => {
      const incoming = toMessage2(raw)
      setMessages(prev => {
        const match = [...pendingIds.current].find(id => prev.some(m => m.id === id && m.body === incoming.body))
        if (match) { pendingIds.current.delete(match); return prev.map(m => m.id === match ? incoming : m) }
        if (prev.some(m => m.id === incoming.id)) return prev
        return [...prev, incoming]
      })
      if (raw.sender_id !== currentUserId && convId) messagingService.markAsRead(convId).catch(() => {})
    },
    onReadReceipt: ({ conversation_id, reader_id, last_read_at }) => {
      if (conversation_id !== convId) return
      if (reader_id !== currentUserId) setOtherLastReadAt(last_read_at)
    },
    onReactionToggle: (payload) => {
      setMessages(prev => applyReactionToggle(prev, payload, currentUserId))
    },
    onTyping: (userId, isTypingNow) => {
      if (userId !== participant.user_id) return
      setIsOtherTyping(isTypingNow)
      if (typingTimeout.current) clearTimeout(typingTimeout.current)
      if (isTypingNow) typingTimeout.current = setTimeout(() => setIsOtherTyping(false), 3000)
    },
  })

  const handleSend = async (text: string, replyToMessageId?: string, attachmentUrl?: string) => {
    scrollToLatest()
    // A photo without a caption is stored with the placeholder text; matching
    // it here lets the live echo replace the optimistic bubble.
    const body = attachmentUrl && !text ? PHOTO_PLACEHOLDER : text
    if (isDraft) {
      setReplyTo(null)
      try {
        setSending(true)
        const saved = await messagingService.sendDirectMessage({
          target_user_id:      participant.user_id,
          content:             text,
          attachment_url:      attachmentUrl,
          reply_to_message_id: replyToMessageId,
          booking_id:          draftUser?.booking_id,
        })
        onConversationCreated?.(saved.conversation_id)
      } catch {
        setError('Failed to send message')
      } finally { setSending(false) }
      return
    }

    const oid = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: Message = {
      id: oid, conversation_id: convId, sender_id: currentUserId,
      body, created_at: new Date().toISOString(),
      reply_to: replyTo ? { message_id: replyTo.messageId, content: replyTo.content, sender_id: '' } : null,
      reactions: [],
      attachment_url: attachmentUrl ?? null,
    }
    pendingIds.current.add(oid)
    setMessages(prev => [...prev, optimistic])
    setReplyTo(null)
    onMessageSent?.(convId, body, currentUserId)
    try {
      setSending(true)
      const saved = await messagingService.sendMessage(convId, { content: text, attachment_url: attachmentUrl, reply_to_message_id: replyToMessageId })
      setMessages(prev => prev.map(m => m.id === oid ? toMessage2(saved) : m))
      pendingIds.current.delete(oid)
    } catch {
      pendingIds.current.delete(oid)
      setMessages(prev => prev.filter(m => m.id !== oid))
    } finally { setSending(false) }
  }

  const handleReact = async (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const base      = m.reactions.filter(r => r.user_id !== currentUserId)
      const existing  = m.reactions.find(r => r.user_id === currentUserId)
      const reactions = existing?.emoji === emoji
        ? base
        : [...base, { emoji, user_id: currentUserId }]
      return { ...m, reactions }
    }))
    try { await messagingService.reactToMessage(convId, messageId, emoji) }
    catch { fetchMessages() }
  }

  const handleDelete = async (messageId: string, scope: 'me' | 'everyone' = 'me') => {
    if (messageId.startsWith('optimistic-')) return
    setMessages(prev => prev.filter(m => m.id !== messageId))
    try { await messagingService.deleteMessage(messageId, scope) }
    catch { fetchMessages() }
  }

  const handleReply = (msg: Message) => setReplyTo({
    messageId:  msg.id,
    content:    msg.body,
    senderName: msg.sender_id === currentUserId ? 'You' : `${participant.first_name} ${participant.last_name}`,
  })

  const dateGroups = groupMessagesByDate(messages)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] bg-[var(--color-bg)]">
        <button type="button" onClick={onBack} className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={17} />
        </button>
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
            <span className="font-card text-[0.62rem] text-white/75">{initials}</span>
          </div>
          {isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--color-green)] border-2 border-[var(--color-bg)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="ff-body text-sm text-white leading-tight truncate">{nameWithRole(participant.first_name, participant.last_name, participant.role)}</p>
          <AnimatePresence mode="wait">
            {isOtherTyping ? (
              <motion.p key="typing" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="ff-body text-[11px] text-[var(--color-cyan)] flex items-center gap-1">
                <TypingDots />typing…
              </motion.p>
            ) : (
              <motion.p key="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="ff-body text-[11px]">
                {isOnline
                  ? <span className="text-[var(--color-green)]">Active now</span>
                  : <span className="text-[var(--color-muted)] capitalize">{roleLabel(participant.role)}</span>}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20 bg-[var(--color-surface)]">
        {loading && <div className="flex items-center justify-center h-full"><Loader2 size={18} className="animate-spin text-[var(--color-cyan)]/40" /></div>}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="ff-body text-white/30 text-xs">{error}</p>
            <button type="button" onClick={fetchMessages} className="ff-body text-xs text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] transition-colors">Retry</button>
          </div>
        )}
        {!loading && !error && dateGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
              <span className="font-card text-[0.7rem] text-white/50">{initials}</span>
            </div>
            <p className="ff-body text-white/20 text-xs">No messages yet. Say something to {participant.first_name}.</p>
          </div>
        )}
        {!loading && !error && dateGroups.map(({ date, messages: msgs }) => (
            <div key={date}>
              <MessageDateDivider label={date} />
              <ul className="flex flex-col gap-3">
                {msgs.map((msg, i) => {
                  const isMine    = msg.sender_id === currentUserId
                  return (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isMine={isMine}
                      currentUserId={currentUserId}
                      sender={isMine ? undefined : { ...participant, is_online: isOnline }}
                      showSenderName={msgs[i + 1]?.sender_id !== msg.sender_id}
                      showSeen={isSeen(msg)}
                      onReply={handleReply}
                      onReact={handleReact}
                      onDelete={handleDelete}
                      replyToSenderName={msg.reply_to
                        ? (msg.reply_to.sender_id === currentUserId ? 'You' : participant.first_name)
                        : undefined}
                    />
                  )
                })}
              </ul>
            </div>
          ))}

        {/* Typing bubble */}
        <AnimatePresence>
          {isOtherTyping && (
            <div className="mt-4">
              <TypingMessage
                name={nameWithRole(participant.first_name, participant.last_name, participant.role)}
                initials={initials}
              />
            </div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} className="h-1" />
      </div>

      <MessageInput
        onSend={handleSend}
        onTypingChange={broadcastTyping}
        disabled={sending}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      showJumpToLatest={!atLatest} onJumpToLatest={scrollToLatest} />
    </div>
  )
}