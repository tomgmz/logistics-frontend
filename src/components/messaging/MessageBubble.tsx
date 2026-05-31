'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, CheckCheck, Reply, CornerUpLeft, Trash2 } from 'lucide-react'
import { formatMessageTime } from '@/app/utils/messaging.utils'
import { QuickReactBar } from './EmojiPicker'
import type { Message, MessageReaction, MessageParticipant } from '@/app/types/messaging/messaging.types'

interface ReactionGroup { emoji: string; count: number; reacted: boolean }

function groupReactions(reactions: MessageReaction[], userId: string): ReactionGroup[] {
  const map = new Map<string, { count: number; reacted: boolean }>()
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, reacted: false }
    map.set(r.emoji, { count: cur.count + 1, reacted: cur.reacted || r.user_id === userId })
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, ...v }))
}

interface MessageBubbleProps {
  message:          Message
  isMine:           boolean
  currentUserId:    string
  sender?:          MessageParticipant & { is_online?: boolean }
  showSenderName?:  boolean
  showAvatar?:      boolean
  showSeen?:        boolean
  onReply?:         (msg: Message) => void
  onReact?:         (messageId: string, emoji: string) => void
  onDelete?:        (messageId: string) => void
  replyToSenderName?: string
}

export default function MessageBubble({
  message,
  isMine,
  currentUserId,
  sender,
  showSenderName = false,
  showAvatar     = true,
  showSeen       = false,
  onReply,
  onReact,
  onDelete,
  replyToSenderName,
}: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false)
  const hoverTimeout          = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initials              = sender
    ? `${sender.first_name?.[0] ?? '?'}${sender.last_name?.[0] ?? '?'}`.toUpperCase()
    : '??'
  const grouped = groupReactions(message.reactions, currentUserId)

  const onEnter = () => { hoverTimeout.current = setTimeout(() => setHovered(true), 60) }
  const onLeave = () => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); setHovered(false) }
  
  const actions = (onReply || onDelete) ? (
    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-0.5 shrink-0">
      {onReply && (
        <button type="button" onClick={() => onReply(message)} title="Reply"
          className="p-1.5 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors">
          <Reply size={13} />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={() => onDelete(message.id)} title="Delete for me"
          className="p-1.5 rounded-lg hover:bg-white/5 text-white/25 hover:text-[var(--color-red,#f87171)] transition-colors">
          <Trash2 size={13} />
        </button>
      )}
    </motion.div>
  ) : null

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
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {!isMine && showSenderName && sender && (
          <span className="ff-body text-[10px] text-white/40 px-1">{sender.first_name} {sender.last_name}</span>
        )}

        {/* Quick react bar */}
        <AnimatePresence>
          {hovered && onReact && (
            <QuickReactBar
              isMine={isMine}
              currentUserReaction={grouped.find(r => r.reacted)?.emoji ?? null}
              onReact={emoji => { onReact(message.id, emoji); setHovered(false) }}
            />
          )}
        </AnimatePresence>

        {/* Reply preview */}
        {message.reply_to && (
          <div className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-xl mb-0.5 max-w-full border-l-2 ${isMine ? 'bg-white/[0.06] border-white/20' : 'bg-white/[0.04] border-[var(--color-cyan)]/40'}`}>
            <CornerUpLeft size={10} className="text-white/30 shrink-0 mt-0.5" />
            <div className="min-w-0">
              {replyToSenderName && <p className="ff-body text-[10px] text-[var(--color-cyan)]/70 truncate">{replyToSenderName}</p>}
              <p className="ff-body text-[11px] text-white/40 truncate">{message.reply_to.content}</p>
            </div>
          </div>
        )}

        {/* Bubble row */}
        <div className="flex items-center gap-1">
          {isMine && hovered && actions}

          <div className={`px-3.5 py-2.5 ff-body text-[13px] leading-relaxed break-words max-w-full ${
            isMine
              ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] rounded-2xl rounded-br-sm'
              : 'glass-surface text-white border border-white/[0.06] rounded-2xl rounded-bl-sm'
          }`}>
            {message.body}
          </div>

          {!isMine && hovered && actions}
        </div>

        {/* Time + read receipt */}
        <div className={`flex items-center gap-1 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
          <span className="ff-body text-[10px] text-white/25">{formatMessageTime(message.created_at)}</span>
          {isMine && (
            showSeen
              ? <CheckCheck size={11} className="text-[var(--color-cyan)]" />
              : <Check size={11} className="text-white/25" />
          )}
        </div>

        {/* Reactions */}
        {grouped.length > 0 && (
          <div className={`flex flex-wrap gap-1 px-1 ${isMine ? 'justify-end' : ''}`}>
            {grouped.map(r => (
              <button
                key={r.emoji} type="button"
                onClick={() => onReact?.(message.id, r.emoji)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border transition-all ${
                  r.reacted
                    ? 'bg-[var(--color-cyan)]/15 border-[var(--color-cyan)]/30'
                    : 'bg-white/[0.05] border-white/10 hover:bg-white/10'
                }`}
              >
                <span className="text-[13px] leading-none">{r.emoji}</span>
                {r.count > 1 && <span className="ff-body text-[10px] text-white/50">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}