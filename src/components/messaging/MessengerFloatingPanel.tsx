'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Edit, Search, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { messagingService } from '@/lib/services/messaging.service'
import { toConversation } from '@/app/types/messaging/messaging.types'
import { formatConversationTime } from '@/app/utils/messaging.utils'
import type { Conversation } from '@/app/types/messaging/messaging.types'

type TabFilter = 'All' | 'Unread'

export default function MessengerFloatingPanel() {
  const { isPanelOpen, closePanel, openChat } = useMessengerStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabFilter>('All')

  // ── Fetch conversations whenever panel opens ─────────────────────────────
  // useCallback keeps the function stable so the effect dep array is satisfied.
  // Moving setLoading inside the async body avoids synchronous setState-in-effect.
  const fetchConversations = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await messagingService.getConversations()
      setConversations(raw.map(toConversation))
    } catch {
      // silently fail; user can reopen panel to retry
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isPanelOpen) fetchConversations()
  }, [isPanelOpen, fetchConversations])

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel()
      }
    }
    if (isPanelOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isPanelOpen, closePanel])

  const handleOpenFullMessenger = () => {
    closePanel()
    router.push('/messages')
  }

  // ── Filter ───────────────────────────────────────────────────────────────
  const filtered = conversations.filter(c => {
    const p = c.participants[0]
    const name = `${p.first_name} ${p.last_name}`.toLowerCase()
    const matchesSearch = name.includes(search.toLowerCase())
    const matchesTab = tab === 'All' || (tab === 'Unread' && c.unread_count > 0)
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
            <h3 className="font-spartan text-white text-sm tracking-[0.15em] uppercase">
              Chats
            </h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleOpenFullMessenger}
                title="Open full Messenger"
                className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
              >
                <Edit size={14} />
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
                  focus:outline-none focus:border-[var(--color-cyan)]/30
                  transition-colors
                "
              />
            </div>
          </div>

          {/* Tabs — `i` removed, key={t} is sufficient */}
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
              filtered.map(conv => (
                <PanelConversationItem
                  key={conv.id}
                  conv={conv}
                  onSelect={() => {
                    openChat(conv.id)
                    closePanel()
                  }}
                />
              ))
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

function PanelConversationItem({
  conv,
  onSelect,
}: {
  conv: Conversation
  onSelect: () => void
}) {
  const participant = conv.participants[0]
  const initials = `${participant.first_name[0] ?? '?'}${participant.last_name[0] ?? '?'}`.toUpperCase()
  const lastMsg = conv.last_message
  const hasUnread = conv.unread_count > 0

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