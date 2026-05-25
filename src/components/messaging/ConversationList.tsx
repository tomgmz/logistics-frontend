'use client'

import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import type { Conversation } from '@/app/types/messaging/messaging.types'
import { formatConversationTime } from '@/app/utils/messaging.utils'

interface ConversationListProps {
  conversations: Conversation[]
  selectedId: string | null
  search: string
  onSearchChange: (s: string) => void
  onSelect: (c: Conversation) => void
  currentUserId: string
}

export default function ConversationList({
  conversations,
  selectedId,
  search,
  onSearchChange,
  onSelect,
  currentUserId,
}: ConversationListProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-5 pb-3 shrink-0">
        <h2 className="font-spartan text-white text-sm tracking-[0.2em] uppercase mb-3">
          Messages
        </h2>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search conversations…"
            className="
              w-full bg-white/[0.04] border border-white/[0.07] rounded-xl
              pl-9 pr-3 py-2.5 ff-body text-sm text-white placeholder:text-white/20
              focus:outline-none focus:border-[var(--color-cyan)]/30 focus:bg-white/[0.06]
              transition-all
            "
          />
        </div>
      </div>

      <div className="sep-x-cyan mx-4 mb-2 shrink-0" />

      <div className="
        flex-1 min-h-0 overflow-y-auto px-2 pb-4
        [&::-webkit-scrollbar]:w-[3px]
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-white/10
        [&::-webkit-scrollbar-thumb]:rounded-full
        hover:[&::-webkit-scrollbar-thumb]:bg-white/20
      ">
        {conversations.length === 0 ? (
          <p className="ff-body text-white/20 text-xs text-center py-10">No conversations found</p>
        ) : (
          conversations.map((conv, i) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              index={i}
              isSelected={selectedId === conv.id}
              currentUserId={currentUserId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface ConversationItemProps {
  conv: Conversation
  index: number
  isSelected: boolean
  currentUserId: string
  onSelect: (c: Conversation) => void
}

function ConversationItem({ conv, index, isSelected, currentUserId, onSelect }: ConversationItemProps) {
  const participant = conv.participants[0]
  const initials = `${participant.first_name[0]}${participant.last_name[0]}`.toUpperCase()
  const lastMsg = conv.last_message
  const hasUnread = conv.unread_count > 0
  const isMyLastMsg = lastMsg?.sender_id === currentUserId

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.22 }}
      whileHover={{ x: isSelected ? 0 : 2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(conv)}
      className={`
        relative w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-0.5
        text-left transition-colors cursor-pointer
        ${isSelected
          ? 'glass-surface border border-[var(--color-cyan)]/20'
          : 'hover:bg-white/[0.04] border border-transparent'
        }
      `}
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
          <span className="font-card text-[0.68rem] text-white/75">{initials}</span>
        </div>
        {participant.is_online && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--color-green)] border-2 border-[var(--color-bg)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`ff-body text-[13px] truncate ${hasUnread ? 'text-white' : 'text-white/75'}`}>
            {participant.first_name} {participant.last_name}
          </span>
          {lastMsg && (
            <span className="ff-body text-[10px] text-white/25 shrink-0">
              {formatConversationTime(lastMsg.created_at)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <p className={`ff-body text-[11px] truncate flex-1 leading-snug ${hasUnread ? 'text-white/55' : 'text-white/28'}`}>
            {isMyLastMsg && (
              <span className="text-[var(--color-cyan)]/50">You: </span>
            )}
            {lastMsg?.body ?? 'No messages yet'}
          </p>
          {hasUnread && (
            <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-[var(--color-cyan)] flex items-center justify-center px-1">
              <span className="ff-body text-[9px] font-bold text-[var(--color-bg)] leading-none">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </span>
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}