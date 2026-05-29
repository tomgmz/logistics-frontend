'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Minus, CornerUpLeft } from 'lucide-react'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { useAuthStore } from '@/lib/store/auth.store'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessageRow } from '@/lib/services/messaging.service'
import { groupMessagesByDate } from '@/app/utils/messaging.utils'
import { toConversation, toMessage } from '@/app/types/messaging/messaging.types'
import type {
  Conversation,
  Message,
  MessageReaction,
  ReactionTogglePayload,
} from '@/app/types/messaging/messaging.types'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import { QuickReactBar } from './EmojiPicker'
import MessageInput from './MessageInput'
import MessageBubble from './MessageBubble'

const BUBBLE_W   = 338
const BUBBLE_GAP = 10
const MIN_COL_W  = 82

interface Props { conversationId: string; index: number }

function TypingDots() {
  return (
    <span className="flex items-center gap-[3px]">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-1 h-1 rounded-full bg-[var(--color-cyan)]/60 inline-block"
          animate={{ y: [0, -3, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
      ))}
    </span>
  )
}

function applyReactionToggle(msgs: Message[], payload: ReactionTogglePayload): Message[] {
  return msgs.map(m => {
    if (m.id !== payload.message_id) return m
    const base: MessageReaction[] = m.reactions.filter(r => r.user_id !== payload.user_id)
    return { ...m, reactions: payload.action === 'added' ? [...base, { emoji: payload.emoji, user_id: payload.user_id }] : base }
  })
}

export default function MessengerChatBubble({ conversationId, index }: Props) {
  const { closeChat, minimizeChat } = useMessengerStore()
  const { user }                    = useAuthStore()
  const currentUserId               = user?.user_id ?? ''
  const rightOffset                 = MIN_COL_W + index * (BUBBLE_W + BUBBLE_GAP)

  const [conv, setConv]           = useState<Conversation | null>(null)
  const [messages, setMessages]   = useState<Message[]>([])
  const [loadingConv, setLConv]   = useState(true)
  const [loadingMsgs, setLMsgs]   = useState(true)
  const [sending, setSending]     = useState(false)
  const [isTyping, setIsTyping]   = useState(false)
  const [isOnline, setIsOnline]   = useState(false)
  const [replyTo, setReplyTo]     = useState<{ messageId: string; content: string; senderName: string } | null>(null)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingIds   = useRef<Set<string>>(new Set())

  // Load conversation metadata
  useEffect(() => {
    messagingService.getConversations()
      .then(raw => { const f = raw.find(c => c.conversation_id === conversationId); if (f) setConv(toConversation(f)) })
      .catch(() => {})
      .finally(() => setLConv(false))
  }, [conversationId])

  const fetchMessages = useCallback(async () => {
    try {
      const raw = await messagingService.getMessages(conversationId)
      setMessages(raw.map(toMessage))
    } catch { /* silent */ }
    finally { setLMsgs(false) }
  }, [conversationId])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => { messagingService.markAsRead(conversationId).catch(() => {}) }, [conversationId])
  useEffect(() => { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50) }, [messages, isTyping])

  const participant = conv?.participants[0]

  const { broadcastTyping } = useMessagingRealtime({
    currentUserId,
    conversationId,
    onNewMessage: (raw: MessageRow) => {
      const inc = toMessage(raw)
      setMessages(prev => {
        const match = [...pendingIds.current].find(id => prev.some(m => m.id === id && m.body === inc.body))
        if (match) { pendingIds.current.delete(match); return prev.map(m => m.id === match ? inc : m) }
        if (prev.some(m => m.id === inc.id)) return prev
        return [...prev, inc]
      })
      if (raw.sender_id !== currentUserId) messagingService.markAsRead(conversationId).catch(() => {})
    },
    onReadReceipt: ({ conversation_id, read_at }) => {
      if (conversation_id !== conversationId) return
      setMessages(prev => prev.map(m => m.sender_id === currentUserId && !m.read_at ? { ...m, read_at } : m))
    },
    onReactionToggle: payload => setMessages(prev => applyReactionToggle(prev, payload)),
    onTyping: (uid, t) => {
      if (uid !== participant?.user_id) return
      setIsTyping(t)
      if (typingTimer.current) clearTimeout(typingTimer.current)
      if (t) typingTimer.current = setTimeout(() => setIsTyping(false), 3000)
    },
    onPresenceChange: ids => { if (participant) setIsOnline(ids.includes(participant.user_id)) },
  })

  const handleSend = async (body: string, replyToMessageId?: string) => {
    const oid = `optimistic-${Date.now()}`
    pendingIds.current.add(oid)
    setMessages(prev => [...prev, {
      id: oid, conversation_id: conversationId, sender_id: currentUserId,
      body, created_at: new Date().toISOString(), read_at: null,
      reply_to: replyTo ? { message_id: replyTo.messageId, content: replyTo.content, sender_id: '' } : null,
      reactions: [],
    }])
    setReplyTo(null)
    try {
      setSending(true)
      const saved = await messagingService.sendMessage(conversationId, { content: body, reply_to_message_id: replyToMessageId })
      setMessages(prev => prev.map(m => m.id === oid ? toMessage(saved) : m))
      pendingIds.current.delete(oid)
    } catch { pendingIds.current.delete(oid); setMessages(prev => prev.filter(m => m.id !== oid)) }
    finally { setSending(false) }
  }

  const handleReact = async (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const base = m.reactions.filter(r => r.user_id !== currentUserId)
      const cur  = m.reactions.find(r => r.user_id === currentUserId)
      return { ...m, reactions: cur?.emoji === emoji ? base : [...base, { emoji, user_id: currentUserId }] }
    }))
    try { await messagingService.reactToMessage(conversationId, messageId, emoji) }
    catch { fetchMessages() }
  }

  const initials = participant
    ? `${participant.first_name?.[0] ?? '?'}${participant.last_name?.[0] ?? '?'}`.toUpperCase()
    : '??'

  const dateGroups = groupMessagesByDate(messages)

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      style={{ right: rightOffset, width: BUBBLE_W, height: 490 }}
      className="fixed bottom-0 z-40 flex flex-col rounded-t-2xl overflow-hidden border border-b-0 border-white/[0.09] shadow-2xl"
    >
      {/* Header */}
      <div className="w-full flex items-center gap-2.5 px-3 py-2.5 shrink-0 bg-[var(--color-bg)] border-b border-white/[0.06]">
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
            {loadingConv ? <Loader2 size={10} className="animate-spin text-white/30" /> : <span className="font-card text-[0.56rem] text-white/75">{initials}</span>}
          </div>
          {isOnline && <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[var(--color-green)] border-[1.5px] border-[var(--color-bg)]" />}
        </div>

        <div className="flex-1 min-w-0">
          {loadingConv ? (
            <p className="ff-body text-xs text-white/30">Loading…</p>
          ) : (
            <>
              <p className="ff-body text-xs text-white truncate">{participant?.first_name} {participant?.last_name}</p>
              <AnimatePresence mode="wait">
                {isTyping ? (
                  <motion.p key="t" initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="ff-body text-[9px] text-[var(--color-cyan)] flex items-center gap-0.5">
                    <TypingDots />typing…
                  </motion.p>
                ) : (
                  <motion.p key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`ff-body text-[9px] ${isOnline ? 'text-[var(--color-green)]' : 'text-white/30'}`}>
                    {isOnline ? 'Active now' : (participant?.role ?? '').replace(/_/g, ' ')}
                  </motion.p>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => minimizeChat(conversationId)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors" aria-label="Minimize"><Minus size={12} /></button>
          <button type="button" onClick={() => closeChat(conversationId)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-red-400 transition-colors" aria-label="Close"><X size={12} /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-col flex-1 overflow-hidden bg-[var(--color-surface)] min-h-0">
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1 min-h-0 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          {loadingMsgs && (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={16} className="animate-spin text-[var(--color-cyan)]/30" />
            </div>
          )}

          {!loadingMsgs && dateGroups.map(({ date, messages: msgs }) => (
            <div key={date} className="space-y-1">
              <p className="ff-body text-[9px] text-white/20 text-center uppercase tracking-widest py-1">{date}</p>
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
                    sender={isMine ? undefined : { ...participant!, is_online: isOnline }}
                    showSenderName={showName}
                    showAvatar={showAvatar}
                    onReply={m => setReplyTo({ messageId: m.id, content: m.body, senderName: m.sender_id === currentUserId ? 'You' : participant?.first_name ?? 'Them' })}
                    onReact={handleReact}
                    replyToSenderName={msg.reply_to ? (msg.reply_to.sender_id === currentUserId ? 'You' : participant?.first_name ?? 'Them') : undefined}
                  />
                )
              })}
            </div>
          ))}

          <AnimatePresence>
            {isTyping && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-end gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0">
                  <span className="font-card text-[0.4rem] text-white/70">{initials}</span>
                </div>
                <div className="glass-surface border border-white/[0.06] rounded-2xl rounded-bl-sm px-3 py-2"><TypingDots /></div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        <MessageInput
          onSend={handleSend}
          onTypingChange={broadcastTyping}
          disabled={sending}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          compact
        />
      </div>
    </motion.div>
  )
}