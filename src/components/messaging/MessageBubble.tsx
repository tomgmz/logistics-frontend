'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, CheckCheck, Reply, CornerUpLeft } from 'lucide-react'
import { formatMessageTime } from '@/app/utils/messaging.utils'
import { QuickReactBar } from './EmojiPicker'
import type { Message, MessageParticipant } from '@/app/types/messaging/messaging.types'

interface ReactionCount {
  emoji: string
  count: number
  reacted: boolean // current user reacted
}

interface MessageBubbleProps {
  message: Message & {
    reply_to?: { message_id: string; content: string; sender_id: string } | null
    reactions?: { emoji: string; user_id: string }[]
  }
  isMine: boolean
  currentUserId: string
  sender?: MessageParticipant & { is_online?: boolean }
  showSenderName?: boolean
  showAvatar?: boolean
  onReply?: (message: Message) => void
  onReact?: (messageId: string, emoji: string) => void
  replyToSenderName?: string
}

function groupReactions(reactions: { emoji: string; user_id: string }[], userId: string): ReactionCount[] {
  const map = new Map<string, { count: number; reacted: boolean }>()
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, reacted: false }
    map.set(r.emoji, { count: cur.count + 1, reacted: cur.reacted || r.user_id === userId })
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, ...v }))
}

export default function MessageBubble({
  message,
  isMine,
  currentUserId,
  sender,
  showSenderName,
  showAvatar = true,
  onReply,
  onReact,
  replyToSenderName,
}: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initials = sender
    ? `${sender.first_name?.[0] ?? '?'}${sender.last_name?.[0] ?? '?'}`.toUpperCase()
    : '??'

  const grouped = groupReactions(message.reactions ?? [], currentUserId)

  const handleMouseEnter = () => {
    hoverTimeout.current = setTimeout(() => setHovered(true), 60)
  }
  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setHovered(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse ml-auto' : 'mr-auto'} max-w-[72%]`}
    >
      {/* Avatar */}
      {!isMine && (
        <div className="shrink-0 self-end mb-1 w-7">
          {showAvatar ? (
            <div className="relative">
              <div className="w-7 h-7 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
                <span className="font-card text-[0.5rem] text-white/70">{initials}</span>
              </div>
              {/* 🟢 Online dot */}
              {sender?.is_online && (
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[var(--color-green)] border-[1.5px] border-[var(--color-bg)]" />
              )}
            </div>
          ) : (
            <div className="w-7" />
          )}
        </div>
      )}

      <div
        className={`relative flex flex-col gap-0.5 ${isMine ? 'items-end' : 'items-start'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Sender name */}
        {!isMine && showSenderName && sender && (
          <span className="ff-body text-[10px] text-white/40 px-1">
            {sender.first_name} {sender.last_name}
          </span>
        )}

        {/* Quick react bar on hover */}
        <AnimatePresence>
          {hovered && onReact && (
            <QuickReactBar
              isMine={isMine}
              currentUserReaction={grouped.find(r => r.reacted)?.emoji}
              onReact={emoji => {
                onReact(message.id, emoji)
                setHovered(false)
              }}
            />
          )}
        </AnimatePresence>

        {/* Reply-to preview */}
        {message.reply_to && (
          <div className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-xl mb-0.5 max-w-full border-l-2 ${isMine ? 'bg-white/[0.06] border-white/20' : 'bg-white/[0.04] border-[var(--color-cyan)]/40'}`}>
            <CornerUpLeft size={10} className="text-white/30 shrink-0 mt-0.5" />
            <div className="min-w-0">
              {replyToSenderName && (
                <p className="ff-body text-[10px] text-[var(--color-cyan)]/70 truncate">{replyToSenderName}</p>
              )}
              <p className="ff-body text-[11px] text-white/40 truncate">{message.reply_to.content}</p>
            </div>
          </div>
        )}

        {/* Bubble + reply button */}
        <div className="flex items-center gap-1">
          {isMine && onReply && hovered && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              type="button"
              onClick={() => onReply(message)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors"
            >
              <Reply size={13} />
            </motion.button>
          )}

          <div
            className={`px-3.5 py-2.5 ff-body text-[13px] leading-relaxed break-words max-w-full ${
              isMine
                ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] rounded-2xl rounded-br-sm'
                : 'glass-surface text-white border border-white/[0.06] rounded-2xl rounded-bl-sm'
            }`}
          >
            {message.body}
          </div>

          {!isMine && onReply && hovered && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              type="button"
              onClick={() => onReply(message)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors"
            >
              <Reply size={13} />
            </motion.button>
          )}
        </div>

        {/* Time + read receipt */}
        <div className={`flex items-center gap-1 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
          <span className="ff-body text-[10px] text-white/25">{formatMessageTime(message.created_at)}</span>
          {isMine && (
            message.read_at
              ? <CheckCheck size={11} className="text-[var(--color-cyan)]" />
              : <Check size={11} className="text-white/25" />
          )}
        </div>

        {/* Reactions */}
        {grouped.length > 0 && (
          <div className={`flex flex-wrap gap-1 px-1 ${isMine ? 'justify-end' : ''}`}>
            {grouped.map(r => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact?.(message.id, r.emoji)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border transition-all ${
                  r.reacted
                    ? 'bg-[var(--color-cyan)]/15 border-[var(--color-cyan)]/30'
                    : 'bg-white/[0.05] border-white/10 hover:bg-white/10'
                }`}
              >
                <span className="text-[13px] leading-none" style={{ fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif' }}>{r.emoji}</span>
                {r.count > 1 && <span className="ff-body text-[10px] text-white/50">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}