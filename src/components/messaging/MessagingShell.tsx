'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, Loader2 } from 'lucide-react'
import type { Conversation } from '@/app/types/messaging/messaging.types'
import { toConversation } from '@/app/types/messaging/messaging.types'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessageRow } from '@/lib/services/messaging.service'
import { useAuthStore } from '@/lib/store/auth.store'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import ConversationList from './ConversationList'
import ChatWindow from './ChatWindow'
import NewConversationModal from './NewConversationModal'

export default function MessagingShell() {
  const { user } = useAuthStore()
  const currentUserId = user?.user_id ?? ''

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)

  // ── Load conversations ──────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    try {
      setError(null)
      const raw = await messagingService.getConversations()
      setConversations(raw.map(toConversation))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load conversations'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // ── Realtime: update conversation list on new messages ──────────────────────
  useMessagingRealtime({
    currentUserId,
    onNewMessage: (raw: MessageRow) => {
      setConversations(prev =>
        prev.map(c => {
          if (c.id !== raw.conversation_id) return c
          const isOpen = c.id === selectedConvId
          return {
            ...c,
            last_message: {
              message_id: raw.message_id,
              body: raw.content,
              created_at: raw.sent_at,
              sender_id: raw.sender_id,
            },
            // Only bump unread count if this conversation isn't currently open
            unread_count: isOpen ? c.unread_count : c.unread_count + 1,
          }
        })
      )
    },
  })

  // ── Derived state ───────────────────────────────────────────────────────────
  const selectedConv = conversations.find(c => c.id === selectedConvId) ?? null

  const filteredConvs = conversations.filter(c => {
    const p = c.participants[0]
    const name = `${p.first_name} ${p.last_name}`.toLowerCase()
    const role = p.role.toLowerCase()
    const q = search.toLowerCase()
    return name.includes(q) || role.includes(q)
  })

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSelectConv = async (conv: Conversation) => {
    setSelectedConvId(conv.id)
    setConversations(prev =>
      prev.map(c => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
    )
    messagingService.markAsRead(conv.id).catch(() => {})
  }

  const handleBack = () => setSelectedConvId(null)

  const handleMessageSent = (conversationId: string, body: string, senderId: string) => {
    setConversations(prev =>
      prev.map(c =>
        c.id === conversationId
          ? {
              ...c,
              last_message: {
                message_id: `local-${Date.now()}`,
                body,
                created_at: new Date().toISOString(),
                sender_id: senderId,
              },
            }
          : c
      )
    )
  }

  const handleConversationReady = async (conversationId: string) => {
    setShowNewModal(false)
    await fetchConversations()
    setSelectedConvId(conversationId)
    messagingService.markAsRead(conversationId).catch(() => {})
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[var(--color-cyan)]/40" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="ff-body text-white/30 text-xs">{error}</p>
        <button
          type="button"
          onClick={fetchConversations}
          className="ff-body text-xs text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-1 min-h-0 h-full overflow-hidden">
        {/* Sidebar */}
        <div className={`
          shrink-0 border-r border-white/[0.07] bg-[var(--color-bg)] flex flex-col
          w-full lg:w-[300px]
          ${selectedConvId ? 'hidden lg:flex' : 'flex'}
        `}>
          <ConversationList
            conversations={filteredConvs}
            selectedId={selectedConvId}
            search={search}
            onSearchChange={setSearch}
            onSelect={handleSelectConv}
            onNewConversation={() => setShowNewModal(true)}
            currentUserId={currentUserId}
          />
        </div>

        {/* Chat area */}
        <div className={`
          flex-1 min-w-0 flex flex-col
          ${selectedConvId ? 'flex' : 'hidden lg:flex'}
          bg-[var(--color-surface)]
        `}>
          {selectedConv ? (
            <ChatWindow
              key={selectedConv.id}
              conversation={selectedConv}
              currentUserId={currentUserId}
              onBack={handleBack}
              onMessageSent={handleMessageSent}
            />
          ) : (
            <EmptyState onNewConversation={() => setShowNewModal(true)} />
          )}
        </div>
      </div>

      {showNewModal && (
        <NewConversationModal
          onClose={() => setShowNewModal(false)}
          onConversationReady={handleConversationReady}
        />
      )}
    </>
  )
}

function EmptyState({ onNewConversation }: { onNewConversation: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
      <div className="w-14 h-14 rounded-full glass border border-white/10 flex items-center justify-center">
        <MessageCircle size={24} className="text-[var(--color-cyan)]/40" />
      </div>
      <div className="space-y-1">
        <p className="font-spartan text-white/50 text-xs tracking-[0.2em] uppercase">
          Select a conversation
        </p>
        <p className="ff-body text-white/20 text-xs">
          Choose from your list or start a new one
        </p>
      </div>
      <button
        type="button"
        onClick={onNewConversation}
        className="
          ff-body text-xs px-4 py-2 rounded-xl
          bg-[var(--color-cyan)]/10 text-[var(--color-cyan)]
          border border-[var(--color-cyan)]/20
          hover:bg-[var(--color-cyan)]/15 transition-colors
        "
      >
        New conversation
      </button>
    </div>
  )
}