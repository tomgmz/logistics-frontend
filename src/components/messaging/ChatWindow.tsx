'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, MoreVertical, Phone, Video, Loader2 } from 'lucide-react'
import type { Conversation, Message } from '@/app/types/messaging/messaging.types'
import { toMessage } from '@/app/types/messaging/messaging.types'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessageRow } from '@/lib/services/messaging.service'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import { groupMessagesByDate } from '@/app/utils/messaging.utils'

interface ChatWindowProps {
  conversation: Conversation
  currentUserId: string
  onBack: () => void
  onMessageSent?: (conversationId: string, body: string, senderId: string) => void
}

export default function ChatWindow({
  conversation,
  currentUserId,
  onBack,
  onMessageSent,
}: ChatWindowProps) {
  const participant = conversation.participants[0]
  const initials = `${participant.first_name[0] ?? '?'}${participant.last_name[0] ?? '?'}`.toUpperCase()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Fetch messages ──────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const raw = await messagingService.getMessages(conversation.id)
      setMessages(raw.map(toMessage))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load messages'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [conversation.id])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // ── Realtime: incoming messages ─────────────────────────────────────────────
  useMessagingRealtime({
    currentUserId,
    conversationId: conversation.id,
    onNewMessage: (raw: MessageRow) => {
      const incoming = toMessage(raw)
      setMessages(prev => {
        if (prev.some(m => m.id === incoming.id)) return prev
        return [...prev, incoming]
      })
      // Auto mark as read since this window is open
      if (raw.sender_id !== currentUserId) {
        messagingService.markAsRead(conversation.id).catch(() => {})
      }
    },
  })

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = async (body: string) => {
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversation.id,
      sender_id: currentUserId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
    }
    setMessages(prev => [...prev, optimisticMsg])
    onMessageSent?.(conversation.id, body, currentUserId)

    try {
      setSending(true)
      const saved = await messagingService.sendMessage(conversation.id, { content: body })
      setMessages(prev =>
        prev.map(m => (m.id === optimisticMsg.id ? toMessage(saved) : m))
      )
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
    } finally {
      setSending(false)
    }
  }

  const groups = groupMessagesByDate(messages)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] bg-[var(--color-bg)]">
        <button
          type="button"
          onClick={onBack}
          className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft size={17} />
        </button>

        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
            <span className="font-card text-[0.62rem] text-white/75">{initials}</span>
          </div>
          {participant.is_online && (
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[var(--color-green)] border-2 border-[var(--color-bg)]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="ff-body text-sm text-white leading-tight truncate">
            {participant.first_name} {participant.last_name}
          </p>
          <p className="ff-body text-[11px] leading-tight">
            {participant.is_online
              ? <span className="text-[var(--color-green)]">Active now</span>
              : <span className="text-[var(--color-muted)] capitalize">{participant.role.replace(/_/g, ' ')}</span>
            }
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button type="button" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors">
            <Phone size={15} />
          </button>
          <button type="button" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors">
            <Video size={15} />
          </button>
          <button type="button" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors">
            <MoreVertical size={15} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="
        flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-1
        [&::-webkit-scrollbar]:w-[3px]
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-white/10
        [&::-webkit-scrollbar-thumb]:rounded-full
        hover:[&::-webkit-scrollbar-thumb]:bg-white/20
        bg-[var(--color-surface)]
      ">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={18} className="animate-spin text-[var(--color-cyan)]/40" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="ff-body text-white/30 text-xs">{error}</p>
            <button
              type="button"
              onClick={fetchMessages}
              className="ff-body text-xs text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
              <span className="font-card text-[0.7rem] text-white/50">{initials}</span>
            </div>
            <p className="ff-body text-white/20 text-xs">
              No messages yet. Say something to {participant.first_name}.
            </p>
          </div>
        )}

        {!loading && !error && groups.map(({ date, messages: groupMsgs }) => (
          <div key={date} className="space-y-2.5">
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-white/[0.04]" />
              <span className="ff-body text-[10px] text-white/20 uppercase tracking-widest shrink-0">{date}</span>
              <div className="flex-1 h-px bg-white/[0.04]" />
            </div>

            {groupMsgs.map((msg, i) => {
              const isMine = msg.sender_id === currentUserId
              const prevMsg = groupMsgs[i - 1]
              const showSenderName = !isMine && prevMsg?.sender_id !== msg.sender_id
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isMine={isMine}
                  sender={isMine ? undefined : participant}
                  showSenderName={showSenderName}
                />
              )
            })}
          </div>
        ))}

        <div ref={bottomRef} className="h-1" />
      </div>

      <MessageInput onSend={handleSend} disabled={sending} />
    </div>
  )
}