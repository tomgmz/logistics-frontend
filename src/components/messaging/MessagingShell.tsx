'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, Loader2 } from 'lucide-react'
import { messagingService } from '@/lib/services/messaging.service'
import { useAuthStore } from '@/lib/store/auth.store'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import { useGlobalPresence } from '@/lib/hooks/useGlobalPresence'
import {
  toConversation,
  toGroup,
} from '@/app/types/messaging/messaging.types'
import type {
  Conversation,
  Group,
  UnifiedListItem,
  MessageRow,
  MessagableUser,
} from '@/app/types/messaging/messaging.types'
import ConversationList  from './ConversationList'
import ChatWindow        from './ChatWindow'
import GroupChatWindow   from './GroupChatWindow'
import NewConversationModal from './NewConversationModal'
import NewGroupModal     from './NewGroupModal'

export default function MessagingShell() {
  const { user }        = useAuthStore()
  const currentUserId   = user?.user_id ?? ''

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [groups, setGroups]               = useState<Group[]>([])
  const [selectedConvId, setSelectedConvId]   = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup]     = useState<Group | null>(null)
  const [draftUser, setDraftUser]             = useState<MessagableUser | null>(null)
  const [search, setSearch]               = useState('')
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [showNewDm, setShowNewDm]         = useState(false)
  const [showNewGroup, setShowNewGroup]   = useState(false)

  // App-wide online presence (shared channel) — drives online dots + chat header status.
  const onlineUserIds = useGlobalPresence(currentUserId)

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      const [rawConvs, rawGroups] = await Promise.all([
        messagingService.getConversations(),
        messagingService.getGroups(),
      ])
      setConversations(rawConvs.map(toConversation))
      setGroups(rawGroups.map(toGroup))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Global user channel — keeps sidebar in sync across tabs / devices
  useMessagingRealtime({
    currentUserId,
    onNewMessage: (raw: MessageRow) => {
      // Unknown conversation (e.g. a brand-new DM whose first message just arrived):
      // pull the full list so it appears without a manual reload.
      let known = false
      setConversations(prev => {
        known = prev.some(c => c.id === raw.conversation_id)
        return prev.map(c => {
          if (c.id !== raw.conversation_id) return c
          return {
            ...c,
            last_message: { message_id: raw.message_id, body: raw.content, created_at: raw.sent_at, sender_id: raw.sender_id },
            unread_count: raw.sender_id === currentUserId
              ? 0
              : selectedConvId !== c.id ? c.unread_count + 1 : c.unread_count,
          }
        })
      })
      if (!known) fetchAll()
    },
    onGroupMessage: (raw) => {
      let known = false
      setGroups(prev => {
        known = prev.some(g => g.id === raw.group_id)
        return prev.map(g => {
          if (g.id !== raw.group_id) return g
          return {
            ...g,
            last_message: { message_id: raw.message_id, body: raw.content, created_at: raw.sent_at, sender_id: raw.sender_id },
            unread_count: raw.sender_id === currentUserId
              ? 0
              : selectedGroup?.id !== g.id ? g.unread_count + 1 : g.unread_count,
          }
        })
      })
      if (!known) fetchAll()
    },
    onGroupInvite: () => fetchAll(),
  })

  const unified: UnifiedListItem[] = [
    ...conversations.map(c => ({ kind: 'dm'    as const, data: c })),
    ...groups.map(g       => ({ kind: 'group'  as const, data: g })),
  ].sort((a, b) => {
    const aT = a.data.last_message?.created_at ?? (a.kind === 'group' ? (a.data as Group).created_at : '')
    const bT = b.data.last_message?.created_at ?? (b.kind === 'group' ? (b.data as Group).created_at : '')
    return bT.localeCompare(aT)
  })

  const filtered = unified.filter(item => {
    const q = search.toLowerCase()
    return item.kind === 'dm'
      ? `${item.data.participants[0].first_name} ${item.data.participants[0].last_name}`.toLowerCase().includes(q)
      : item.data.name.toLowerCase().includes(q)
  })

  const selectDm = (conv: Conversation) => {
    setSelectedConvId(conv.id)
    setSelectedGroup(null)
    setDraftUser(null)
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
    messagingService.markAsRead(conv.id).catch(() => {})
  }

  const selectGroup = (g: Group) => {
    setSelectedGroup(g)
    setSelectedConvId(null)
    setDraftUser(null)
    setGroups(prev => prev.map(gr => gr.id === g.id ? { ...gr, unread_count: 0 } : gr))
  }

  const handleBack = () => { setSelectedConvId(null); setSelectedGroup(null); setDraftUser(null) }

  const handleDraftCreated = async (conversationId: string) => {
    setDraftUser(null)
    await fetchAll()
    setSelectedConvId(conversationId)
    setSelectedGroup(null)
    messagingService.markAsRead(conversationId).catch(() => {})
  }

  const handleInviteResponded = (groupId: string, accepted: boolean) => {
    if (!accepted) {
      setGroups(prev => prev.filter(g => g.id !== groupId))
      setSelectedGroup(null)
    } else {
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, my_status: 'accepted' } : g))
      setSelectedGroup(prev => prev?.id === groupId ? { ...prev, my_status: 'accepted' } : prev)
    }
  }

  const handleConvReady = async (conversationId: string) => {
    setShowNewDm(false)
    setDraftUser(null)
    await fetchAll()
    setSelectedConvId(conversationId)
    setSelectedGroup(null)
    messagingService.markAsRead(conversationId).catch(() => {})
  }

  const handleDraftReady = (user: MessagableUser) => {
    setShowNewDm(false)
    setSelectedConvId(null)
    setSelectedGroup(null)
    setDraftUser(user)
  }

  const handleGroupCreated = async (groupId: string) => {
    setShowNewGroup(false)
    const rawGroups  = await messagingService.getGroups().catch(() => [])
    const mapped     = rawGroups.map(toGroup)
    setGroups(mapped)
    const found      = mapped.find(g => g.id === groupId) ?? null
    setSelectedGroup(found)
    setSelectedConvId(null)
  }

  const selectedConv   = conversations.find(c => c.id === selectedConvId) ?? null
  const hasActiveChat  = !!selectedConvId || !!selectedGroup || !!draftUser

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
        <button type="button" onClick={fetchAll} className="ff-body text-xs text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] transition-colors">Try again</button>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-1 min-h-0 h-full overflow-hidden">
        {/* Sidebar */}
        <div className={`shrink-0 border-r border-white/[0.07] bg-[var(--color-bg)] flex flex-col w-full lg:w-[300px] ${hasActiveChat ? 'hidden lg:flex' : 'flex'}`}>
          <ConversationList
            items={filtered}
            selectedConvId={selectedConvId}
            selectedGroupId={selectedGroup?.id ?? null}
            search={search}
            onSearchChange={setSearch}
            onSelectDm={selectDm}
            onSelectGroup={selectGroup}
            onNewConversation={() => setShowNewDm(true)}
            onNewGroup={() => setShowNewGroup(true)}
            currentUserId={currentUserId}
            onlineUserIds={onlineUserIds}
          />
        </div>

        {/* Chat panel */}
        <div className={`flex-1 min-w-0 flex flex-col ${hasActiveChat ? 'flex' : 'hidden lg:flex'} bg-[var(--color-surface)]`}>
          {selectedGroup ? (
            <GroupChatWindow
              key={selectedGroup.id}
              group={selectedGroup}
              currentUserId={currentUserId}
              onBack={handleBack}
              onInviteResponded={handleInviteResponded}
            />
          ) : selectedConv ? (
            <ChatWindow
              key={selectedConv.id}
              conversation={selectedConv}
              currentUserId={currentUserId}
              isParticipantOnline={onlineUserIds.includes(selectedConv.participants[0]?.user_id)}
              onBack={handleBack}
              onMessageSent={(convId, body, senderId) =>
                setConversations(prev => prev.map(c =>
                  c.id === convId
                    ? { ...c, last_message: { message_id: `local-${Date.now()}`, body, created_at: new Date().toISOString(), sender_id: senderId } }
                    : c
                ))
              }
            />
          ) : draftUser ? (
            <ChatWindow
              key={`draft-${draftUser.user_id}`}
              draftUser={draftUser}
              currentUserId={currentUserId}
              isParticipantOnline={onlineUserIds.includes(draftUser.user_id)}
              onBack={handleBack}
              onConversationCreated={handleDraftCreated}
            />
          ) : (
            <EmptyState onNewConversation={() => setShowNewDm(true)} onNewGroup={() => setShowNewGroup(true)} />
          )}
        </div>
      </div>

      {showNewDm    && <NewConversationModal onClose={() => setShowNewDm(false)}    onConversationReady={handleConvReady} onDraftReady={handleDraftReady} />}
      {showNewGroup && <NewGroupModal        onClose={() => setShowNewGroup(false)} onGroupCreated={handleGroupCreated} />}
    </>
  )
}

function EmptyState({ onNewConversation, onNewGroup }: { onNewConversation: () => void; onNewGroup: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
      <div className="w-14 h-14 rounded-full glass border border-white/10 flex items-center justify-center">
        <MessageCircle size={24} className="text-[var(--color-cyan)]/40" />
      </div>
      <div className="space-y-1">
        <p className="font-spartan text-white/50 text-xs tracking-[0.2em] uppercase">Select a conversation</p>
        <p className="ff-body text-white/20 text-xs">Choose from your list or start a new one</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onNewConversation} className="ff-body text-xs px-4 py-2 rounded-xl bg-[var(--color-cyan)]/10 text-[var(--color-cyan)] border border-[var(--color-cyan)]/20 hover:bg-[var(--color-cyan)]/15 transition-colors">New conversation</button>
        <button type="button" onClick={onNewGroup}        className="ff-body text-xs px-4 py-2 rounded-xl bg-white/[0.04] text-white/50 border border-white/[0.08] hover:bg-white/[0.07] hover:text-white/70 transition-colors">New group</button>
      </div>
    </div>
  )
}