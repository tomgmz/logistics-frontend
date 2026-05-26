'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Edit, Search, Loader2, Users, Expand } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { useAuthStore } from '@/lib/store/auth.store'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessageRow } from '@/lib/services/messaging.service'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import { toConversation, toGroup } from '@/app/types/messaging/messaging.types'
import { formatConversationTime } from '@/app/utils/messaging.utils'
import type { Conversation, Group } from '@/app/types/messaging/messaging.types'

type TabFilter = 'All' | 'Unread'

// Unified item for the panel list
type PanelItem =
  | { kind: 'dm'; data: Conversation; lastAt: string }
  | { kind: 'group'; data: Group; lastAt: string }

export default function MessengerFloatingPanel() {
  const { isPanelOpen, closePanel, openChat, openGroupChat, setTotalUnread, incrementUnread } = useMessengerStore()
  const { user } = useAuthStore()
  const currentUserId = user?.user_id ?? ''
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabFilter>('All')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [rawConvs, rawGroups] = await Promise.all([
        messagingService.getConversations(),
        messagingService.getGroups(),
      ])
      const mappedConvs = rawConvs.map(toConversation)
      const mappedGroups = rawGroups.map(toGroup)
      setConversations(mappedConvs)
      setGroups(mappedGroups)
      const total =
        mappedConvs.reduce((s, c) => s + c.unread_count, 0) +
        mappedGroups.reduce((s, g) => s + g.unread_count, 0)
      setTotalUnread(total)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [setTotalUnread])

  useEffect(() => {
    if (isPanelOpen) fetchAll()
  }, [isPanelOpen, fetchAll])

  // Realtime: update DM previews + unread
  useMessagingRealtime({
    currentUserId,
    onNewMessage: (raw: MessageRow) => {
      setConversations(prev =>
        prev.map(c => {
          if (c.id !== raw.conversation_id) return c
          return {
            ...c,
            last_message: {
              message_id: raw.message_id,
              body: raw.content,
              created_at: raw.sent_at,
              sender_id: raw.sender_id,
            },
            unread_count: c.unread_count + 1,
          }
        })
      )
      incrementUnread()
    },
    onGroupMessage: (raw) => {
      setGroups(prev =>
        prev.map(g => {
          if (g.id !== raw.group_id) return g
          return {
            ...g,
            last_message: {
              message_id: raw.message_id,
              body: raw.content,
              created_at: raw.sent_at,
              sender_id: raw.sender_id,
            },
            unread_count: g.unread_count + 1,
          }
        })
      )
      incrementUnread()
    },
  })

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) closePanel()
    }
    if (isPanelOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isPanelOpen, closePanel])

  const handleOpenFullMessenger = () => {
    closePanel()
    router.push('/messages')
  }

  // Merge + sort by last message time
  const unified: PanelItem[] = [
    ...conversations.map(c => ({
      kind: 'dm' as const,
      data: c,
      lastAt: c.last_message?.created_at ?? '',
    })),
    ...groups.map(g => ({
      kind: 'group' as const,
      data: g,
      lastAt: g.last_message?.created_at ?? g.created_at,
    })),
  ].sort((a, b) => b.lastAt.localeCompare(a.lastAt))

  const filtered = unified.filter(item => {
    const q = search.toLowerCase()
    const name =
      item.kind === 'dm'
        ? `${item.data.participants[0].first_name} ${item.data.participants[0].last_name}`.toLowerCase()
        : item.data.name.toLowerCase()
    const matchesSearch = name.includes(q)
    const matchesTab = tab === 'All' || (tab === 'Unread' && item.data.unread_count > 0)
    return matchesSearch && matchesTab
  })

  return (
    <AnimatePresence>
      {isPanelOpen && (
        <motion.div
          ref={panelRef}
          key="messenger-panel"
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="
            fixed top-[88px] right-4 z-50
            w-[340px] max-h-[520px]
            bg-[var(--color-bg)] border border-white/[0.08]
            rounded-2xl shadow-2xl overflow-hidden
            flex flex-col
          "
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
            <h3 className="font-spartan text-white text-sm tracking-[0.15em] uppercase">Chats</h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleOpenFullMessenger}
                title="Open full Messenger"
                className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
              >
                <Expand size={14} />
              </button>
              <button
                type="button"
                onClick={closePanel}
                className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 pb-2 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search"
                className="
                  w-full bg-white/[0.04] border border-white/[0.07] rounded-xl
                  pl-9 pr-3 py-2 ff-body text-xs text-white placeholder:text-white/20
                  focus:outline-none focus:border-[var(--color-cyan)]/30 transition-colors
                "
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="px-3 pb-2 flex items-center gap-1.5 shrink-0">
            {(['All', 'Unread'] as TabFilter[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`
                  ff-body text-xs px-3 py-1 rounded-full transition-colors
                  ${tab === t
                    ? 'bg-[var(--color-cyan)]/12 text-[var(--color-cyan)] border border-[var(--color-cyan)]/20'
                    : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                  }
                `}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="sep-x-cyan mx-3 mb-1 shrink-0" />

          {/* List */}
          <div className="
            flex-1 overflow-y-auto px-2 pb-2
            [&::-webkit-scrollbar]:w-[3px]
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:bg-white/10
            [&::-webkit-scrollbar-thumb]:rounded-full
            hover:[&::-webkit-scrollbar-thumb]:bg-white/20
          ">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={16} className="animate-spin text-[var(--color-cyan)]/40" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="ff-body text-white/20 text-xs text-center py-10">
                {search ? 'No results found' : 'No conversations yet'}
              </p>
            ) : (
              filtered.map(item =>
                item.kind === 'dm' ? (
                  <PanelDmItem
                    key={`dm-${item.data.id}`}
                    conv={item.data}
                    currentUserId={currentUserId}
                    onSelect={() => {
                      openChat(item.data.id, item.data.unread_count)
                      closePanel()
                    }}
                  />
                ) : (
                  <PanelGroupItem
                    key={`group-${item.data.id}`}
                    group={item.data}
                    onSelect={() => {
                      // Groups open in the full messenger for now
                      closePanel()
                      openGroupChat(item.data.id, item.data.unread_count) 
                    }}
                  />
                )
              )
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-white/[0.05] shrink-0">
            <button
              type="button"
              onClick={handleOpenFullMessenger}
              className="ff-body text-[11px] text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] transition-colors"
            >
              See all →
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── DM item ─────────────────────────────────────────────────────────────────

function PanelDmItem({
  conv,
  currentUserId,
  onSelect,
}: {
  conv: Conversation
  currentUserId: string
  onSelect: () => void
}) {
  const participant = conv.participants[0]
  const initials = `${participant.first_name[0] ?? '?'}${participant.last_name[0] ?? '?'}`.toUpperCase()
  const lastMsg = conv.last_message
  const hasUnread = conv.unread_count > 0
  const isMyLastMsg = lastMsg?.sender_id === currentUserId

  return (
    <motion.button
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
          <span className="font-card text-[0.65rem] text-white/75">{initials}</span>
        </div>
        {participant.is_online && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[var(--color-green)] border-2 border-[var(--color-bg)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`ff-body text-[13px] truncate ${hasUnread ? 'text-white' : 'text-white/65'}`}>
            {participant.first_name} {participant.last_name}
          </span>
          {lastMsg && (
            <span className="ff-body text-[10px] text-white/22 shrink-0">
              {formatConversationTime(lastMsg.created_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <p className={`ff-body text-[11px] truncate flex-1 ${hasUnread ? 'text-white/55' : 'text-white/22'}`}>
            {isMyLastMsg && <span className="text-[var(--color-cyan)]/50">You: </span>}
            {lastMsg?.body ?? ''}
          </p>
          {hasUnread && (
            <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--color-cyan)] flex items-center justify-center">
              <span className="ff-body text-[9px] font-bold text-[var(--color-bg)]">
                {conv.unread_count > 9 ? '9+' : conv.unread_count}
              </span>
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}

// ─── Group item ───────────────────────────────────────────────────────────────

function PanelGroupItem({
  group,
  onSelect,
}: {
  group: Group
  onSelect: () => void
}) {
  const lastMsg = group.last_message
  const hasUnread = group.unread_count > 0
  const isPending = group.my_status === 'pending'

  return (
    <motion.button
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
          <Users size={15} className="text-white/50" />
        </div>
        {isPending && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-[var(--color-bg)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`ff-body text-[13px] truncate ${hasUnread ? 'text-white' : 'text-white/65'}`}>
            {group.name}
          </span>
          {lastMsg && (
            <span className="ff-body text-[10px] text-white/22 shrink-0">
              {formatConversationTime(lastMsg.created_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <p className={`ff-body text-[11px] truncate flex-1 ${hasUnread ? 'text-white/55' : 'text-white/22'}`}>
            {isPending
              ? <span className="text-amber-400/70">Invite pending</span>
              : lastMsg?.body ?? <span className="text-white/20 italic">{group.members.filter(m => m.status === 'accepted').length} members</span>
            }
          </p>
          {hasUnread && (
            <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--color-cyan)] flex items-center justify-center">
              <span className="ff-body text-[9px] font-bold text-[var(--color-bg)]">
                {group.unread_count > 9 ? '9+' : group.unread_count}
              </span>
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}