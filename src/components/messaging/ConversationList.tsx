'use client'

import { nameWithRole } from '@/lib/roles'

import { motion } from 'framer-motion'
import { ArrowLeft, MessageCirclePlus, Search, Users } from 'lucide-react'
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
  /** The green back arrow beside MESSAGES (Figma); hidden when not given. */
  onBack?:            () => void
}

export default function ConversationList({
  items, selectedConvId, selectedGroupId, search, onSearchChange,
  onSelectDm, onSelectGroup, onNewConversation, onNewGroup,
  currentUserId, onlineUserIds = [], onBack,
}: ConversationListProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Figma (Web Messaging.png): back arrow, MESSAGES, new message / new group. */}
      <div className="px-5 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {onBack && (
              <button type="button" onClick={onBack} aria-label="Back"
                className="w-7 h-7 rounded-full border border-[var(--color-green)] flex items-center justify-center text-[var(--color-green)] hover:bg-[var(--color-green)]/10 transition-colors shrink-0">
                <ArrowLeft size={15} />
              </button>
            )}
            <h2 className="ff-keep-sc text-white text-[1.35rem] font-bold leading-none">Messages</h2>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onNewConversation} title="New message" aria-label="New message"
              className="p-1.5 rounded-lg text-[var(--color-cyan)] hover:bg-white/5 transition-colors">
              <MessageCirclePlus size={16} />
            </button>
            <button type="button" onClick={onNewGroup} title="New group" aria-label="New group"
              className="p-1.5 rounded-lg text-[var(--color-cyan)] hover:bg-white/5 transition-colors">
              <Users size={16} />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
          <input
            type="text" value={search} onChange={e => onSearchChange(e.target.value)}
            placeholder="Search people, conversation, etc."
            className="w-full h-12 bg-[#262626] rounded-lg pl-9 pr-3 text-[15px] font-medium text-white placeholder:text-white/55 focus:outline-none focus:ring-1 focus:ring-[var(--color-cyan)]/40 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-4 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
            <p className="text-white/40 text-[15px] font-medium">{search ? 'No conversations match your search' : 'No conversations yet'}</p>
            {!search && (
              <button type="button" onClick={onNewConversation} className="text-[15px] font-semibold px-3 py-1.5 rounded-lg text-[var(--color-cyan)]/80 hover:text-[var(--color-cyan)] border border-white/[0.1] hover:border-[var(--color-cyan)]/30 transition-colors">
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
                currentUserId={currentUserId}
              />
            )
          )
        )}
      </div>
    </div>
  )
}

/** Row per the Figma: ringed initials (cyan when unread), name (cyan bold when
 *  unread), the last message ("Name: …" bold when unread, "You: …" grey), time. */
function Row({ initials, name, preview, time, unread, pending, selected, online, index, onClick }: {
  initials: string; name: string; preview: React.ReactNode; time?: string
  unread: boolean; pending?: boolean; selected: boolean; online?: boolean; index: number; onClick: () => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      data-testid="conversation-item"
      className={`relative w-full flex items-center gap-2.5 px-5 py-1.5 min-h-14 text-left transition-colors cursor-pointer ${selected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'}`}
    >
      <div className="relative shrink-0">
        <div className={`w-[42px] h-[42px] rounded-full bg-[#111212] flex items-center justify-center ${unread || pending ? 'border-2 border-[var(--color-cyan)]' : 'border border-white/80'}`}>
          <span className="text-[17px] font-medium text-white">{initials}</span>
        </div>
        {online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--color-green)] border-2 border-[var(--color-bg)]" />}
        {pending && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#ff7a30] border-2 border-[var(--color-bg)]" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className={`text-[17px] leading-tight truncate ${unread ? 'text-[var(--color-cyan)] font-bold' : 'text-white font-medium'}`}>{name}</span>
          {time && <span className="text-[12px] font-medium text-white/45 shrink-0 leading-tight">{time}</span>}
        </div>
        <p className={`text-[13px] leading-snug truncate ${unread ? 'text-white font-bold' : 'text-white/45 font-medium'}`}>{preview}</p>
      </div>
    </motion.button>
  )
}

function initialsOf(text: string): string {
  return text.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?'
}

function DmItem({ conv, index, isSelected, currentUserId, onSelect, isOnline }: {
  conv: Conversation; index: number; isSelected: boolean
  currentUserId: string; onSelect: (c: Conversation) => void; isOnline: boolean
}) {
  const p         = conv.participants[0]
  const last      = conv.last_message
  const hasUnread = conv.unread_count > 0
  const isMyLast  = last?.sender_id === currentUserId
  const preview   = !last ? 'No messages yet'
    : isMyLast ? `You: ${last.body}`
    : hasUnread ? `${p.first_name ?? ''}: ${last.body}`
    : last.body
  return (
    <Row
      initials={`${p.first_name?.[0] ?? '?'}${p.last_name?.[0] ?? ''}`.toUpperCase()}
      name={nameWithRole(p.first_name, p.last_name, p.role)}
      preview={preview}
      time={last ? formatConversationTime(last.created_at) : undefined}
      unread={hasUnread}
      selected={isSelected}
      online={isOnline}
      index={index}
      onClick={() => onSelect(conv)}
    />
  )
}

function GroupItem({ group, index, isSelected, onSelect, currentUserId }: {
  group: Group; index: number; isSelected: boolean; onSelect: (g: Group) => void; currentUserId: string
}) {
  const last          = group.last_message
  const hasUnread     = group.unread_count > 0
  const pending       = group.my_status === 'pending'
  const acceptedCount = group.members.filter(m => m.status === 'accepted').length
  const preview = pending
    ? <span className="text-[#ff7a30]">Invite pending</span>
    : !last ? `${acceptedCount} member${acceptedCount !== 1 ? 's' : ''}`
    : last.sender_id === currentUserId ? `You: ${last.body}`
    : last.body
  return (
    <Row
      initials={initialsOf(group.name)}
      name={group.name}
      preview={preview}
      time={last ? formatConversationTime(last.created_at) : undefined}
      unread={hasUnread}
      pending={pending}
      selected={isSelected}
      index={index}
      onClick={() => onSelect(group)}
    />
  )
}
