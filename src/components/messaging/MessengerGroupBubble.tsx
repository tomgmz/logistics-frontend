'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, Send, Loader2, Minus, Users } from 'lucide-react'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { useAuthStore } from '@/lib/store/auth.store'
import { messagingService } from '@/lib/services/messaging.service'
import { groupMessagesByDate, formatMessageTime } from '@/app/utils/messaging.utils'
import { toGroup, toGroupMessage } from '@/app/types/messaging/messaging.types'
import type { Group, GroupMessage, GroupMessageRaw } from '@/app/types/messaging/messaging.types'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'

const BUBBLE_WIDTH = 338
const BUBBLE_GAP = 10
const MINIMIZED_COLUMN_WIDTH = 82

type GroupMsg = GroupMessage & {
  reply_to: null
  reactions: []
}

interface MessengerGroupBubbleProps {
  groupId: string
  index: number
}

export default function MessengerGroupBubble({ groupId, index }: MessengerGroupBubbleProps) {
  const { closeChat, minimizeChat } = useMessengerStore()
  const { user } = useAuthStore()
  const currentUserId = user?.user_id ?? ''

  const rightOffset = MINIMIZED_COLUMN_WIDTH + index * (BUBBLE_WIDTH + BUBBLE_GAP)

  const [group, setGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<GroupMsg[]>([])
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingOptimisticIds = useRef<Set<string>>(new Set())

  const toGroupMsg = useCallback((r: GroupMessageRaw): GroupMsg => ({
    ...toGroupMessage(r),
    reply_to: null,
    reactions: [],
  }), [])

  useEffect(() => {
    messagingService.getGroups()
      .then(raw => {
        const found = raw.find(g => g.group_id === groupId)
        if (found) setGroup(toGroup(found))
      })
      .catch(() => {})
      .finally(() => setLoadingGroup(false))
  }, [groupId])

  const fetchMessages = useCallback(async () => {
    try {
      const raw = await messagingService.getGroupMessages(groupId)
      setMessages(raw.map(toGroupMsg))
    } catch {
      // silent
    } finally {
      setLoadingMsgs(false)
    }
  }, [groupId, toGroupMsg])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [messages])

  useEffect(() => {
    messagingService.markGroupRead(groupId, []).catch(() => {})
  }, [groupId])

  const { broadcastTyping } = useMessagingRealtime({
    currentUserId,
    conversationId: `group:${groupId}`,
    onGroupMessage: (raw: GroupMessageRaw) => {
      if (raw.group_id !== groupId) return
      const incoming = toGroupMsg(raw)
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
    },
  })

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: GroupMsg = {
      id: optimisticId,
      group_id: groupId,
      sender_id: currentUserId,
      body: trimmed,
      created_at: new Date().toISOString(),
      reply_to: null,
      reactions: [],
    }

    pendingOptimisticIds.current.add(optimisticId)
    setMessages(prev => [...prev, optimistic])
    setText('')
    inputRef.current?.focus()

    try {
      setSending(true)
      const saved = await messagingService.sendGroupMessage(groupId, { content: trimmed })
      setMessages(prev => prev.map(m => m.id === optimisticId ? toGroupMsg(saved) : m))
      pendingOptimisticIds.current.delete(optimisticId)
    } catch {
      pendingOptimisticIds.current.delete(optimisticId)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setText(trimmed)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend() }
  }

  const memberMap = Object.fromEntries(
    (group?.members ?? []).map(m => [m.user_id, m])
  )

  const dateGroups = groupMessagesByDate(messages)

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      style={{ right: rightOffset, width: BUBBLE_WIDTH, height: 455 }}
      className="fixed bottom-0 z-40 flex flex-col rounded-t-2xl overflow-hidden border border-b-0 border-white/[0.09] shadow-2xl"
    >
      {/* Header */}
      <div className="w-full flex items-center gap-2.5 px-3 py-2.5 shrink-0 bg-[var(--color-bg)] border-b border-white/[0.06]">
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
            {loadingGroup
              ? <Loader2 size={10} className="animate-spin text-white/30" />
              : <Users size={13} className="text-white/60" />
            }
          </div>
        </div>

        <div className="flex-1 min-w-0 text-left">
          {loadingGroup ? (
            <p className="ff-body text-xs text-white/30">Loading…</p>
          ) : (
            <>
              <p className="ff-body text-xs text-white truncate">{group?.name}</p>
              <p className="ff-body text-[9px] text-white/30">
                {group?.members.filter(m => m.status === 'accepted').length ?? 0} members
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => minimizeChat(groupId)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
            aria-label="Minimize"
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            onClick={() => closeChat(groupId)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-red-400 transition-colors"
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-col flex-1 overflow-hidden bg-[var(--color-surface)] min-h-0">
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          {loadingMsgs && (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={16} className="animate-spin text-[var(--color-cyan)]/30" />
            </div>
          )}

          {!loadingMsgs && dateGroups.map(({ date, messages: groupMsgs }) => (
            <div key={date} className="space-y-2">
              <p className="ff-body text-[9px] text-white/20 text-center uppercase tracking-widest">{date}</p>
              {groupMsgs.map((msg, i) => {
                const isMine = msg.sender_id === currentUserId
                const sender = memberMap[msg.sender_id]
                const prevMsg = groupMsgs[i - 1]
                const showName = !isMine && prevMsg?.sender_id !== msg.sender_id
                const senderName = sender
                  ? `${sender.first_name} ${sender.last_name}`
                  : 'Unknown'

                return (
                  <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    {showName && (
                      <span className="ff-body text-[9px] text-white/30 px-1 mb-0.5">{senderName}</span>
                    )}
                    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} w-full`}>
                      <div className="flex flex-col gap-0.5 max-w-[85%]">
                        <div className={`
                          px-3 py-1.5 rounded-2xl ff-body text-[11.5px] leading-relaxed break-words
                          ${isMine
                            ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] rounded-br-sm'
                            : 'glass-surface text-white border border-white/[0.06] rounded-bl-sm'
                          }
                        `}>
                          {msg.body}
                        </div>
                        <div className={`flex items-center gap-1 ${isMine ? 'justify-end' : ''}`}>
                          <span className="ff-body text-[9px] text-white/20">
                            {formatMessageTime(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-2.5 py-2 border-t border-white/[0.06] bg-[var(--color-bg)] flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Aa"
            disabled={sending}
            className="flex-1 bg-white/[0.05] border border-white/[0.07] rounded-full px-3 py-1.5 ff-body text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--color-cyan)]/30 transition-colors disabled:opacity-50"
          />
          <motion.button
            type="button"
            whileHover={text.trim() ? { scale: 1.1 } : {}}
            whileTap={text.trim() ? { scale: 0.92 } : {}}
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              text.trim() && !sending
                ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] glow-cyan'
                : 'bg-white/[0.05] text-white/20 cursor-not-allowed'
            }`}
          >
            {sending ? <Loader2 size={10} className="animate-spin" /> : <Send size={11} />}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}