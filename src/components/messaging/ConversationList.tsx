'use client'

import { motion } from 'framer-motion'
import { Search, SquarePen, Users } from 'lucide-react'
import type { Conversation, Group, UnifiedListItem } from '@/app/types/messaging/messaging.types'
import { formatConversationTime } from '@/app/utils/messaging.utils'

interface ConversationListProps {
  items:              UnifiedListItem[]
  selectedConvId:     string | null
  selectedGroupId:    string | null
  search:             string
  onSearchChange:     (s: string) => void
  onSelectDm:         (c: Conversation) => void
  onSelectGroup:      (g: Group) => void
  onNewConversation:  () => void
  onNewGroup:         () => void
  currentUserId:      string
  onlineUserIds?:     string[]
}

export default function ConversationList({
  items, selectedConvId, selectedGroupId, search, onSearchChange,
  onSelectDm, onSelectGroup, onNewConversation, onNewGroup,
  currentUserId, onlineUserIds = [],
}: ConversationListProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-spartan text-white text-sm tracking-[0.2em] uppercase">Messages</h2>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={onNewGroup} title="New group" className="p-1.5 rounded-lg hover:bg-white/5 text-white/35 hover:text-[var(--color-cyan)] transition-colors">
              <Users size={15} />
            </button>
            <button type="button" onClick={onNewConversation} title="New conversation" className="p-1.5 rounded-lg hover:bg-white/5 text-white/35 hover:text-[var(--color-cyan)] transition-colors">
              <SquarePen size={15} />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
          <input
            type="text" value={search} onChange={e => onSearchChange(e.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-3 py-2.5 ff-body text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--color-cyan)]/30 focus:bg-white/[0.06] transition-all"
          />
        </div>
      </div>

      <div className="sep-x-cyan mx-4 mb-2 shrink-0" />

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
            <p className="ff-body text-white/20 text-xs">{search ? 'No conversations match your search' : 'No conversations yet'}</p>
            {!search && (
              <button type="button" onClick={onNewConversation} className="ff-body text-xs px-3 py-1.5 rounded-lg text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] border border-white/[0.07] hover:border-[var(--color-cyan)]/20 transition-colors">
                Start a conversation
              </button>
            )}
          </div>
        ) : (
          items.map((item, i) =>
            item.kind === 'dm' ? (
              <DmItem
                key={`dm-${item.data.id}`}
                conv={item.data}
                index={i}
                isSelected={selectedConvId === item.data.id}
                currentUserId={currentUserId}
                onSelect={onSelectDm}
                isOnline={onlineUserIds.includes(item.data.participants[0]?.user_id)}
              />
            ) : (
              <GroupItem
                key={`group-${item.data.id}`}
                group={item.data}
                index={i}
                isSelected={selectedGroupId === item.data.id}
                onSelect={onSelectGroup}
              />
            )
          )
        )}
      </div>
    </div>
  )
}

function DmItem({ conv, index, isSelected, currentUserId, onSelect, isOnline }: {
  conv: Conversation; index: number; isSelected: boolean
  currentUserId: string; onSelect: (c: Conversation) => void; isOnline: boolean
}) {
  const p          = conv.participants[0]
  const initials   = `${p.first_name?.[0] ?? '?'}${p.last_name?.[0] ?? '?'}`.toUpperCase()
  const last       = conv.last_message
  const hasUnread  = conv.unread_count > 0
  const isMyLast   = last?.sender_id === currentUserId

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(conv)}
      className={`relative w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-0.5 text-left transition-colors cursor-pointer ${isSelected ? 'glass-surface border border-[var(--color-cyan)]/20' : 'hover:bg-white/[0.04] border border-transparent'}`}
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
          <span className="font-card text-[0.68rem] text-white/75">{initials}</span>
        </div>
        {isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--color-green)] border-2 border-[var(--color-bg)]" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`ff-body text-[13px] truncate ${hasUnread ? 'text-white' : 'text-white/75'}`}>{p.first_name} {p.last_name}</span>
          {last && <span className="ff-body text-[10px] text-white/25 shrink-0">{formatConversationTime(last.created_at)}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <p className={`ff-body text-[11px] truncate flex-1 leading-snug ${hasUnread ? 'text-white/55' : 'text-white/28'}`}>
            {isMyLast && <span className="text-[var(--color-cyan)]/50">You: </span>}
            {last?.body ?? <span className="italic">No messages yet</span>}
          </p>
          {hasUnread && (
            <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-[var(--color-cyan)] flex items-center justify-center px-1">
              <span className="ff-body text-[9px] font-bold text-[var(--color-bg)] leading-none">{conv.unread_count > 9 ? '9+' : conv.unread_count}</span>
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}

function GroupItem({ group, index, isSelected, onSelect }: {
  group: Group; index: number; isSelected: boolean; onSelect: (g: Group) => void
}) {
  const last         = group.last_message
  const hasUnread    = group.unread_count > 0
  const acceptedCount= group.members.filter(m => m.status === 'accepted').length

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(group)}
      className={`relative w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-0.5 text-left transition-colors cursor-pointer ${isSelected ? 'glass-surface border border-[var(--color-cyan)]/20' : 'hover:bg-white/[0.04] border border-transparent'}`}
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
          <Users size={15} className="text-white/50" />
        </div>
        {group.my_status === 'pending' && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-[var(--color-bg)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`ff-body text-[13px] truncate ${hasUnread ? 'text-white' : 'text-white/75'}`}>{group.name}</span>
          {last && <span className="ff-body text-[10px] text-white/25 shrink-0">{formatConversationTime(last.created_at)}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <p className={`ff-body text-[11px] truncate flex-1 leading-snug ${hasUnread ? 'text-white/55' : 'text-white/28'}`}>
            {last?.body ?? <span className="italic">{acceptedCount} member{acceptedCount !== 1 ? 's' : ''}</span>}
          </p>
          {hasUnread && (
            <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-[var(--color-cyan)] flex items-center justify-center px-1">
              <span className="ff-body text-[9px] font-bold text-[var(--color-bg)] leading-none">{group.unread_count > 9 ? '9+' : group.unread_count}</span>
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}