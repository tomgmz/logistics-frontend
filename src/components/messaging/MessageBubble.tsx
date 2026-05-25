'use client'

import { motion } from 'framer-motion'
import { Check, CheckCheck } from 'lucide-react'
import type { Message, MessageParticipant } from '@/app/types/messaging/messaging.types'
import { formatMessageTime } from '@/app/utils/messaging.utils'

interface MessageBubbleProps {
  message: Message
  isMine: boolean
  sender?: MessageParticipant
  showSenderName?: boolean
}

export default function MessageBubble({ message, isMine, sender, showSenderName }: MessageBubbleProps) {
  const initials = sender
    ? `${sender.first_name[0]}${sender.last_name[0]}`.toUpperCase()
    : '??'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex items-end gap-2 max-w-[72%] ${isMine ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
    >
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0 mb-1">
          <span className="font-card text-[0.55rem] text-white/70">{initials}</span>
        </div>
      )}

      <div className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && showSenderName && sender && (
          <span className="font-body text-[11px] text-[var(--color-cyan)] px-1">
            {sender.first_name} {sender.last_name}
          </span>
        )}

        <div
          className={`
            px-3.5 py-2.5 font-body text-[13px] leading-relaxed break-words
            ${isMine
              ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] rounded-2xl rounded-br-sm'
              : 'glass-surface text-white border border-white/[0.06] rounded-2xl rounded-bl-sm'
            }
          `}
        >
          {message.body}
        </div>

        <div className={`flex items-center gap-1 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
          <span className="font-body text-[10px] text-white/25">
            {formatMessageTime(message.created_at)}
          </span>
          {isMine && (
            message.read_at
              ? <CheckCheck size={11} className="text-[var(--color-cyan)]" />
              : <Check size={11} className="text-white/25" />
          )}
        </div>
      </div>
    </motion.div>
  )
}