'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, MoreVertical, Phone, Video, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessageRow } from '@/lib/services/messaging.service'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import { groupMessagesByDate } from '@/app/utils/messaging.utils'
import type {
  Conversation,
  Message,
  MessageReaction,
  ReactionTogglePayload,
} from '@/app/types/messaging/messaging.types'
import { toMessage } from '@/app/types/messaging/messaging.types'

interface ReplyTo { messageId: string; content: string; senderName: string }

interface ChatWindowProps {
  conversation:    Conversation
  currentUserId:   string
  onBack:          () => void
  onMessageSent?:  (conversationId: string, body: string, senderId: string) => void
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

export default function ChatWindow({ conversation, currentUserId, onBack, onMessageSent }: ChatWindowProps) {
  const participant = conversation.participants[0]
  const initials    = `${participant.first_name?.[0] ?? '?'}${participant.last_name?.[0] ?? '?'}`.toUpperCase()
  const bottomRef   = useRef<HTMLDivElement>(null)

  const [messages, setMessages]               = useState<Message[]>([])
  const [loading, setLoading]                 = useState(true)
  const [sending, setSending]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [isOtherTyping, setIsOtherTyping]     = useState(false)
  const [isOnline, setIsOnline]               = useState(participant.is_online ?? false)
  const [replyTo, setReplyTo]                 = useState<ReplyTo | null>(null)
  const typingTimeout                         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingIds                            = useRef<Set<string>>(new Set())

  const fetchMessages = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const raw = await messagingService.getMessages(conversation.id)
      setMessages(raw.map(toMessage2))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [conversation.id])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => { messagingService.markAsRead(conversation.id).catch(() => {}) }, [conversation.id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isOtherTyping])

  const { broadcastTyping } = useMessagingRealtime({
    currentUserId,
    conversationId: conversation.id,
    onNewMessage: (raw) => {
      const incoming = toMessage2(raw)
      setMessages(prev => {
        // Replace optimistic match if exists
        const match = [...pendingIds.current].find(id => prev.some(m => m.id === id && m.body === incoming.body))
        if (match) { pendingIds.current.delete(match); return prev.map(m => m.id === match ? incoming : m) }
        if (prev.some(m => m.id === incoming.id)) return prev
        return [...prev, incoming]
      })
      if (raw.sender_id !== currentUserId) messagingService.markAsRead(conversation.id).catch(() => {})
    },
    onReadReceipt: ({ conversation_id, read_at }) => {
      if (conversation_id !== conversation.id) return
      setMessages(prev => prev.map(m => m.sender_id === currentUserId && !m.read_at ? { ...m, read_at } : m))
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
    onPresenceChange: (ids) => setIsOnline(ids.includes(participant.user_id)),
  })

  const handleSend = async (body: string, replyToMessageId?: string) => {
    const oid = `optimistic-${Date.now()}`
    const optimistic: Message = {
      id: oid, conversation_id: conversation.id, sender_id: currentUserId,
      body, created_at: new Date().toISOString(), read_at: null,
      reply_to: replyTo ? { message_id: replyTo.messageId, content: replyTo.content, sender_id: '' } : null,
      reactions: [],
    }
    pendingIds.current.add(oid)
    setMessages(prev => [...prev, optimistic])
    setReplyTo(null)
    onMessageSent?.(conversation.id, body, currentUserId)
    try {
      setSending(true)
      const saved = await messagingService.sendMessage(conversation.id, { content: body, reply_to_message_id: replyToMessageId })
      setMessages(prev => prev.map(m => m.id === oid ? toMessage2(saved) : m))
      pendingIds.current.delete(oid)
    } catch {
      pendingIds.current.delete(oid)
      setMessages(prev => prev.filter(m => m.id !== oid))
    } finally { setSending(false) }
  }

  const handleReact = async (messageId: string, emoji: string) => {
    // Optimistic: replace or add reaction for current user
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const base      = m.reactions.filter(r => r.user_id !== currentUserId)
      const existing  = m.reactions.find(r => r.user_id === currentUserId)
      const reactions = existing?.emoji === emoji
        ? base  // toggle off
        : [...base, { emoji, user_id: currentUserId }]  // add/replace
      return { ...m, reactions }
    }))
    try { await messagingService.reactToMessage(conversation.id, messageId, emoji) }
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
          <p className="ff-body text-sm text-white leading-tight truncate">{participant.first_name} {participant.last_name}</p>
          <AnimatePresence mode="wait">
            {isOtherTyping ? (
              <motion.p key="typing" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="ff-body text-[11px] text-[var(--color-cyan)] flex items-center gap-1">
                <TypingDots />typing…
              </motion.p>
            ) : (
              <motion.p key="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="ff-body text-[11px]">
                {isOnline
                  ? <span className="text-[var(--color-green)]">Active now</span>
                  : <span className="text-[var(--color-muted)] capitalize">{participant.role.replace(/_/g, ' ')}</span>}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors"><Phone size={15} /></button>
          <button type="button" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors"><Video size={15} /></button>
          <button type="button" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors"><MoreVertical size={15} /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-1 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20 bg-[var(--color-surface)]">
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
          <div key={date} className="space-y-2.5">
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-white/[0.04]" />
              <span className="ff-body text-[10px] text-white/20 uppercase tracking-widest shrink-0">{date}</span>
              <div className="flex-1 h-px bg-white/[0.04]" />
            </div>
            {msgs.map((msg, i) => {
              const isMine    = msg.sender_id === currentUserId
              const prev      = msgs[i - 1]
              const showAvatar= !isMine && (msgs[i + 1]?.sender_id !== msg.sender_id || i === msgs.length - 1)
              const showName  = !isMine && prev?.sender_id !== msg.sender_id
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isMine={isMine}
                  currentUserId={currentUserId}
                  sender={isMine ? undefined : { ...participant, is_online: isOnline }}
                  showSenderName={showName}
                  showAvatar={showAvatar}
                  onReply={handleReply}
                  onReact={handleReact}
                  replyToSenderName={msg.reply_to
                    ? (msg.reply_to.sender_id === currentUserId ? 'You' : participant.first_name)
                    : undefined}
                />
              )
            })}
          </div>
        ))}

        {/* Typing bubble */}
        <AnimatePresence>
          {isOtherTyping && (
            <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.95 }} transition={{ duration: 0.18 }} className="flex items-end gap-2 max-w-[72%] mr-auto">
              <div className="w-7 h-7 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0 mb-1">
                <span className="font-card text-[0.55rem] text-white/70">{initials}</span>
              </div>
              <div className="glass-surface border border-white/[0.06] rounded-2xl rounded-bl-sm px-4 py-3">
                <TypingDots />
              </div>
            </motion.div>
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
      />
    </div>
  )
}