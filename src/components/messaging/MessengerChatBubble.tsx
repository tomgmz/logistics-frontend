'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Minus, Check, CheckCheck, CornerUpLeft } from 'lucide-react'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { useAuthStore } from '@/lib/store/auth.store'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessageRow } from '@/lib/services/messaging.service'
import { groupMessagesByDate, formatMessageTime } from '@/app/utils/messaging.utils'
import { toConversation, toMessage } from '@/app/types/messaging/messaging.types'
import type { Message, Conversation, MessageReaction, MessageReplyTo } from '@/app/types/messaging/messaging.types'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import { QuickReactBar } from './EmojiPicker'
import MessageInput from './MessageInput'

const BUBBLE_WIDTH            = 338
const BUBBLE_GAP              = 10
const MINIMIZED_COLUMN_WIDTH  = 82

type MessageRowExtended = MessageRow & {
  reply_to?: MessageReplyTo | null
  reactions?: MessageReaction[]
}

type RichMessage = Message & {
  reply_to: MessageReplyTo | null
  reactions: MessageReaction[]
}

interface ReplyTo {
  messageId: string
  content: string
  senderName: string
}

interface MessengerChatBubbleProps {
  conversationId: string
  index: number
}

export default function MessengerChatBubble({ conversationId, index }: MessengerChatBubbleProps) {
  const { closeChat, minimizeChat } = useMessengerStore()
  const { user }                    = useAuthStore()
  const currentUserId               = user?.user_id ?? ''

  const rightOffset = MINIMIZED_COLUMN_WIDTH + index * (BUBBLE_WIDTH + BUBBLE_GAP)

  const [conv, setConv]                   = useState<Conversation | null>(null)
  const [messages, setMessages]           = useState<RichMessage[]>([])
  const [loadingConv, setLoadingConv]     = useState(true)
  const [loadingMsgs, setLoadingMsgs]     = useState(true)
  const [sending, setSending]             = useState(false)
  const [isOtherTyping, setIsOtherTyping] = useState(false)
  const [isOnline, setIsOnline]           = useState(false)
  const [replyTo, setReplyTo]             = useState<ReplyTo | null>(null)
  const [hoveredMsgId, setHoveredMsgId]   = useState<string | null>(null)

  const bottomRef            = useRef<HTMLDivElement>(null)
  const hoverTimeout         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingTimeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingOptimisticIds = useRef<Set<string>>(new Set())

  const toRichMessage = (r: MessageRowExtended): RichMessage => ({
    ...toMessage(r),
    reply_to: r.reply_to ?? null,
    reactions: r.reactions ?? [],
  })

  // Load conversation metadata
  useEffect(() => {
    messagingService.getConversations()
      .then(raw => {
        const found = raw.find(c => c.conversation_id === conversationId)
        if (found) setConv(toConversation(found))
      })
      .catch(() => {})
      .finally(() => setLoadingConv(false))
  }, [conversationId])

  const fetchMessages = useCallback(async () => {
    try {
      const raw = await messagingService.getMessages(conversationId)
      setMessages((raw as MessageRowExtended[]).map(toRichMessage))
    } catch { /* silent */ }
    finally { setLoadingMsgs(false) }
  }, [conversationId])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => { messagingService.markAsRead(conversationId).catch(() => {}) }, [conversationId])
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [messages, isOtherTyping])

  const participant = conv?.participants[0]

  const { broadcastTyping } = useMessagingRealtime({
    currentUserId,
    conversationId,
    onNewMessage: (raw: MessageRow) => {
      const incoming = toRichMessage(raw as MessageRowExtended)
      setMessages(prev => {
        const matchedId = [...pendingOptimisticIds.current].find(id =>
          prev.some(m => m.id === id && m.body === incoming.body)
        )
        if (matchedId) {
          pendingOptimisticIds.current.delete(matchedId)
          return prev.map(m => m.id === matchedId ? incoming : m)
        }
        if (prev.some(m => m.id === incoming.id)) return prev
        return [...prev, incoming]
      })
      if (raw.sender_id !== currentUserId) {
        messagingService.markAsRead(conversationId).catch(() => {})
      }
    },
    onReadReceipt: ({ conversation_id, read_at }) => {
      if (conversation_id !== conversationId) return
      setMessages(prev => prev.map(m =>
        m.sender_id === currentUserId && !m.read_at ? { ...m, read_at } : m
      ))
    },
    onTyping: (userId, isTyping) => {
      if (userId === participant?.user_id) {
        setIsOtherTyping(isTyping)
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        if (isTyping) typingTimeoutRef.current = setTimeout(() => setIsOtherTyping(false), 3000)
      }
    },
    onPresenceChange: (onlineIds) => {
      if (participant) setIsOnline(onlineIds.includes(participant.user_id))
    },
  })

  const handleSend = async (body: string, replyToMessageId?: string) => {
    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: RichMessage = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      reply_to: replyTo
        ? { message_id: replyTo.messageId, content: replyTo.content, sender_id: currentUserId }
        : null,
      reactions: [],
    }
    pendingOptimisticIds.current.add(optimisticId)
    setMessages(prev => [...prev, optimistic])
    setReplyTo(null)
    try {
      setSending(true)
      const saved = await messagingService.sendMessage(conversationId, { content: body, reply_to_message_id: replyToMessageId })
      setMessages(prev => prev.map(m => m.id === optimisticId ? toRichMessage(saved as MessageRowExtended) : m))
      pendingOptimisticIds.current.delete(optimisticId)
    } catch {
      pendingOptimisticIds.current.delete(optimisticId)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
    } finally {
      setSending(false)
    }
  }

  const handleReact = async (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const hasSame  = m.reactions.some(r => r.user_id === currentUserId && r.emoji === emoji)
      const hasOther = m.reactions.some(r => r.user_id === currentUserId && r.emoji !== emoji)
      let newReactions: MessageReaction[]
      if (hasSame) {
        newReactions = m.reactions.filter(r => !(r.user_id === currentUserId && r.emoji === emoji))
      } else if (hasOther) {
        newReactions = [...m.reactions.filter(r => r.user_id !== currentUserId), { emoji, user_id: currentUserId }]
      } else {
        newReactions = [...m.reactions, { emoji, user_id: currentUserId }]
      }
      return { ...m, reactions: newReactions }
    }))
    try {
      await messagingService.reactToMessage(conversationId, messageId, emoji)
    } catch {
      fetchMessages()
    }
  }

  const initials = participant
    ? `${participant.first_name?.[0] ?? '?'}${participant.last_name?.[0] ?? '?'}`.toUpperCase()
    : '??'

  const groups = groupMessagesByDate(messages)

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      style={{ right: rightOffset, width: BUBBLE_WIDTH, height: 455 }}
      className="fixed bottom-0 z-40 flex flex-col rounded-t-2xl overflow-hidden border border-b-0 border-white/[0.09] shadow-2xl"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="w-full flex items-center gap-2.5 px-3 py-2.5 shrink-0 bg-[var(--color-bg)] border-b border-white/[0.06]">
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
            {loadingConv
              ? <Loader2 size={10} className="animate-spin text-white/30" />
              : <span className="font-card text-[0.56rem] text-white/75">{initials}</span>
            }
          </div>
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[var(--color-green)] border-[1.5px] border-[var(--color-bg)]" />
          )}
        </div>

        <div className="flex-1 min-w-0 text-left">
          {loadingConv ? (
            <p className="ff-body text-xs text-white/30">Loading…</p>
          ) : (
            <>
              <p className="ff-body text-xs text-white truncate">{participant?.first_name} {participant?.last_name}</p>
              <AnimatePresence mode="wait">
                {isOtherTyping ? (
                  <motion.p key="typing" initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="ff-body text-[9px] text-[var(--color-cyan)] flex items-center gap-0.5">
                    <TypingDots />typing…
                  </motion.p>
                ) : (
                  <motion.p key="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`ff-body text-[9px] ${isOnline ? 'text-[var(--color-green)]' : 'text-white/30'}`}>
                    {isOnline ? 'Active now' : participant?.role.replace(/_/g, ' ') ?? ''}
                  </motion.p>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => minimizeChat(conversationId)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors" aria-label="Minimize">
            <Minus size={12} />
          </button>
          <button type="button" onClick={() => closeChat(conversationId)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-red-400 transition-colors" aria-label="Close">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden bg-[var(--color-surface)] min-h-0">
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 min-h-0 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          {loadingMsgs && (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={16} className="animate-spin text-[var(--color-cyan)]/30" />
            </div>
          )}

          {!loadingMsgs && groups.map(({ date, messages: groupMsgs }) => (
            <div key={date} className="space-y-1.5">
              <p className="ff-body text-[9px] text-white/20 text-center uppercase tracking-widest py-1">{date}</p>

              {groupMsgs.map((msg) => {
                const isMine       = msg.sender_id === currentUserId
                const isOptimistic = msg.id.startsWith('optimistic-')
                const grouped      = [...new Map(msg.reactions.map(r => [r.emoji, null])).keys()].map(emoji => ({
                  emoji,
                  count: msg.reactions.filter(r => r.emoji === emoji).length,
                  reacted: msg.reactions.some(r => r.emoji === emoji && r.user_id === currentUserId),
                }))

                const replyToSenderName = msg.reply_to
                  ? (msg.reply_to.sender_id === currentUserId ? 'You' : participant?.first_name ?? 'Someone')
                  : undefined

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); hoverTimeout.current = setTimeout(() => setHoveredMsgId(msg.id), 60) }}
                    onMouseLeave={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); setHoveredMsgId(null) }}
                  >
                    <div className={`relative flex flex-col gap-0.5 max-w-[85%] ${isMine ? 'items-end' : 'items-start'}`}>

                      {/* Quick react bar */}
                      <AnimatePresence>
                        {hoveredMsgId === msg.id && !isOptimistic && (
                          <QuickReactBar
                            isMine={isMine}
                            currentUserReaction={grouped.find(r => r.reacted)?.emoji}
                            onReact={emoji => { handleReact(msg.id, emoji); setHoveredMsgId(null) }}
                          />
                        )}
                      </AnimatePresence>

                      {/* Reply preview */}
                      {msg.reply_to && (
                        <div className={`flex items-start gap-1 px-2 py-1 rounded-lg mb-0.5 max-w-full border-l-2 ${isMine ? 'bg-white/[0.06] border-white/20' : 'bg-white/[0.04] border-[var(--color-cyan)]/40'}`}>
                          <CornerUpLeft size={9} className="text-white/30 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            {replyToSenderName && <p className="ff-body text-[9px] text-[var(--color-cyan)]/70 truncate">{replyToSenderName}</p>}
                            <p className="ff-body text-[10px] text-white/40 truncate">{msg.reply_to.content}</p>
                          </div>
                        </div>
                      )}

                      {/* Bubble + reply button */}
                      <div className="flex items-center gap-1">
                        {isMine && hoveredMsgId === msg.id && !isOptimistic && (
                          <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} type="button"
                            onClick={() => setReplyTo({ messageId: msg.id, content: msg.body, senderName: 'You' })}
                            className="p-1 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors"
                          ><CornerUpLeft size={11} /></motion.button>
                        )}

                        <div className={`px-3 py-1.5 rounded-2xl ff-body text-[11.5px] leading-relaxed break-words ${isMine ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] rounded-br-sm' : 'glass-surface text-white border border-white/[0.06] rounded-bl-sm'} ${isOptimistic ? 'opacity-60' : ''}`}>
                          {msg.body}
                        </div>

                        {!isMine && hoveredMsgId === msg.id && !isOptimistic && (
                          <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} type="button"
                            onClick={() => setReplyTo({ messageId: msg.id, content: msg.body, senderName: participant?.first_name ?? 'Them' })}
                            className="p-1 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors"
                          ><CornerUpLeft size={11} /></motion.button>
                        )}
                      </div>

                      {/* Time + read receipt */}
                      <div className={`flex items-center gap-1 ${isMine ? 'flex-row-reverse' : ''}`}>
                        <span className="ff-body text-[9px] text-white/20">{formatMessageTime(msg.created_at)}</span>
                        {isMine && (
                          msg.read_at
                            ? <CheckCheck size={9} className="text-[var(--color-cyan)]" />
                            : <Check size={9} className="text-white/20" />
                        )}
                      </div>

                      {/* Reactions */}
                      {grouped.length > 0 && (
                        <div className={`flex flex-wrap gap-1 ${isMine ? 'justify-end' : ''}`}>
                          {grouped.map(r => (
                            <button key={r.emoji} type="button" onClick={() => handleReact(msg.id, r.emoji)}
                              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border transition-all ${r.reacted ? 'bg-[var(--color-cyan)]/15 border-[var(--color-cyan)]/30' : 'bg-white/[0.05] border-white/10 hover:bg-white/10'}`}
                            >
                              <span className="text-[12px] leading-none">{r.emoji}</span>
                              {r.count > 1 && <span className="ff-body text-[9px] text-white/50">{r.count}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {/* Typing indicator */}
          <AnimatePresence>
            {isOtherTyping && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-end gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0">
                  <span className="font-card text-[0.4rem] text-white/70">{initials}</span>
                </div>
                <div className="glass-surface border border-white/[0.06] rounded-2xl rounded-bl-sm px-3 py-2">
                  <TypingDots />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>

        {/* ── Input ──────────────────────────────────────────────────────────── */}
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

function TypingDots() {
  return (
    <span className="flex items-center gap-[3px]">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-1 h-1 rounded-full bg-[var(--color-cyan)]/60 inline-block"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}