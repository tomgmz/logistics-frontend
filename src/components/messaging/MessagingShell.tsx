'use client'

import { useRouter } from 'next/navigation'
import { ROLE_ROUTES } from '@/constants/roles'
import { lastPage } from '@/lib/navigation/lastPage'
import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { matchesPersonSearch } from '@/lib/roles'
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
import NewMessageDialog, { type NewMessageTab } from './NewMessageDialog'
import SiteFooter        from '@/components/layout/SiteFooter'
import { useSetMessagingChatOpen } from './MessagingChromeContext'
import { cachedData, storeData } from '@/lib/query/useApiQuery'
import { dmChatKey, groupChatKey, markChatStale, markAllChatsStale } from './chatFreshness'
import { useCatchUp } from '@/lib/hooks/useLiveTable'

// The inbox as last shown (TanStack Query cache): back on Messages it shows at
// once, and the fresh read and realtime events update it as before.
const INBOX_KEY = ['messaging', 'inbox'] as const
type Inbox = { conversations: Conversation[]; groups: Group[] }

export default function MessagingShell() {
  const { user }        = useAuthStore()

  // Back: to the module you came from (lib/navigation/lastPage); the portal
  // home when Messages was opened straight from a link or nothing in your own
  // portal was remembered (e.g. the landing page, or another account's page).
  const goBack = () => {
    const home    = ROLE_ROUTES[user?.role ?? ''] ?? '/'
    const allowed = [home, ...(user?.it_standin ? [ROLE_ROUTES.it_admin] : [])]
    const prev    = lastPage()
    const ok      = !!prev && allowed.some(base => prev === base || prev.startsWith(base + '/') || prev.startsWith(base + '?'))
    router.push(ok ? prev! : home)
  }
  const currentUserId   = user?.user_id ?? ''

  const [cachedInbox]                     = useState(() => cachedData<Inbox>(INBOX_KEY))
  const [conversations, setConversations] = useState<Conversation[]>(() => cachedInbox?.conversations ?? [])
  const [groups, setGroups]               = useState<Group[]>(() => cachedInbox?.groups ?? [])
  const [selectedConvId, setSelectedConvId]   = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup]     = useState<Group | null>(null)
  const [draftUser, setDraftUser]             = useState<MessagableUser | null>(null)
  const [search, setSearch]               = useState('')
  const [loading, setLoading]             = useState(!cachedInbox)
  const [error, setError]                 = useState<string | null>(null)
  // New Message (Figma): one dialog, opened on the DIRECT or GROUP tab.
  const [newMessageTab, setNewMessageTab] = useState<NewMessageTab | null>(null)
  const router = useRouter()

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
      const mapped = rawGroups.map(toGroup)
      setGroups(mapped)
      // Keep the open group in step with the list (new name, new members).
      setSelectedGroup(prev => (prev ? mapped.find(g => g.id === prev.id) ?? null : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  // Back from a hidden tab or offline: changes made meanwhile never arrived live.
  useCatchUp(() => { void fetchAll() })

  // Keep the cached inbox in step with what is shown (fresh reads and
  // realtime changes alike).
  useEffect(() => {
    if (!loading) storeData<Inbox>(INBOX_KEY, { conversations, groups })
  }, [conversations, groups, loading])

  // Global user channel — keeps sidebar in sync across tabs / devices
  useMessagingRealtime({
    currentUserId,
    onNewMessage: (raw: MessageRow) => {
      // A closed chat changed: its next open reads fresh (the open one gets
      // the message on its own channel).
      if (raw.conversation_id !== selectedConvId) markChatStale(dmChatKey(raw.conversation_id))
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
      if (raw.group_id !== selectedGroup?.id) markChatStale(groupChatKey(raw.group_id))
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
              : raw.message_type === 'system' || selectedGroup?.id === g.id ? g.unread_count : g.unread_count + 1,
          }
        })
      })
      if (!known) fetchAll()
    },
    onGroupInvite: () => fetchAll(),
    onGroupUpdated: () => fetchAll(),
    onMessageUnsent: ({ conversation_id, group_id }) => {
      if (conversation_id) markChatStale(dmChatKey(conversation_id))
      if (group_id)        markChatStale(groupChatKey(group_id))
      fetchAll()
    },
    // A reaction changed a chat: one that isn't open reads fresh on its next
    // open (the 30-second reuse would otherwise show it without the reaction).
    // The open chat applies the reaction itself, as before. An older server
    // sends no chat id for a direct chat; then every closed direct chat reads
    // fresh next time, which is correct, just less precise.
    onReactionToggle: ({ conversation_id, group_id }) => {
      if (group_id) {
        if (group_id !== selectedGroup?.id) markChatStale(groupChatKey(group_id))
      } else if (conversation_id) {
        if (conversation_id !== selectedConvId) markChatStale(dmChatKey(conversation_id))
      } else {
        markAllChatsStale('dm:', selectedConvId ? dmChatKey(selectedConvId) : null)
      }
    },
  })

  const unified: UnifiedListItem[] = [
    ...conversations.map(c => ({ kind: 'dm'    as const, data: c })),
    ...groups.map(g       => ({ kind: 'group'  as const, data: g })),
  ].sort((a, b) => {
    const aT = a.data.last_message?.created_at ?? (a.kind === 'group' ? (a.data as Group).created_at : '')
    const bT = b.data.last_message?.created_at ?? (b.kind === 'group' ? (b.data as Group).created_at : '')
    return bT.localeCompare(aT)
  })

  const filtered = unified.filter(item => (
    item.kind === 'dm'
      ? matchesPersonSearch(search, item.data.participants[0])
      : item.data.name.toLowerCase().includes(search.trim().toLowerCase())
  ))

  const selectDm = (conv: Conversation) => {
    setSelectedConvId(conv.id)
    setSelectedGroup(null)
    setDraftUser(null)
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
    // Only when there is something to mark: every messaging call shares one
    // per-user rate limit, and clicking through chats used to send this twice.
    if (conv.unread_count > 0) messagingService.markAsRead(conv.id).catch(() => {})
  }

  const selectGroup = (g: Group) => {
    setSelectedGroup(g)
    setSelectedConvId(null)
    setDraftUser(null)
    setGroups(prev => prev.map(gr => gr.id === g.id ? { ...gr, unread_count: 0 } : gr))
    if (g.unread_count > 0 && g.my_status === 'accepted') messagingService.markGroupRead(g.id).catch(() => {})
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
    setNewMessageTab(null)
    setDraftUser(null)
    await fetchAll()
    setSelectedConvId(conversationId)
    setSelectedGroup(null)
    messagingService.markAsRead(conversationId).catch(() => {})
  }

  const handleDraftReady = (user: MessagableUser) => {
    setNewMessageTab(null)
    setSelectedConvId(null)
    setSelectedGroup(null)
    setDraftUser(user)
  }

  const handleGroupCreated = async (groupId: string) => {
    setNewMessageTab(null)
    const rawGroups  = await messagingService.getGroups().catch(() => [])
    const mapped     = rawGroups.map(toGroup)
    setGroups(mapped)
    const found      = mapped.find(g => g.id === groupId) ?? null
    setSelectedGroup(found)
    setSelectedConvId(null)
  }

  const selectedConv   = conversations.find(c => c.id === selectedConvId) ?? null
  const hasActiveChat  = !!selectedConvId || !!selectedGroup || !!draftUser

  const setChatOpen = useSetMessagingChatOpen()
  useEffect(() => {
    setChatOpen(hasActiveChat)
    return () => setChatOpen(false)
  }, [hasActiveChat, setChatOpen])

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
        <div className={`shrink-0 border-r border-white/[0.12] bg-[#0a0a0a] flex flex-col w-full lg:w-[290px] ${hasActiveChat ? 'hidden lg:flex' : 'flex'}`}>
          <ConversationList
            items={filtered}
            selectedConvId={selectedConvId}
            selectedGroupId={selectedGroup?.id ?? null}
            search={search}
            onSearchChange={setSearch}
            onSelectDm={selectDm}
            onSelectGroup={selectGroup}
            onNewConversation={() => setNewMessageTab('direct')}
            currentUserId={currentUserId}
            onlineUserIds={onlineUserIds}
            onBack={goBack}
          />
        </div>

        {/* Chat panel */}
        <div className={`flex-1 min-w-0 flex flex-col ${hasActiveChat ? 'flex' : 'hidden lg:flex'} bg-[#0a0a0a]`}>
          <div className="flex-1 min-h-0 flex flex-col">
          {selectedGroup ? (
            <GroupChatWindow
              key={selectedGroup.id}
              group={selectedGroup}
              currentUserId={currentUserId}
              onBack={handleBack}
              onInviteResponded={handleInviteResponded}
              onGroupChanged={fetchAll}
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
            <EmptyState />
          )}
          </div>
          {/* Under the chat pane only — never under the conversation list. */}
          <SiteFooter variant="compact" />
        </div>
      </div>

      {newMessageTab && (
        <NewMessageDialog
          initialTab={newMessageTab}
          onClose={() => setNewMessageTab(null)}
          onConversationReady={handleConvReady}
          onDraftReady={handleDraftReady}
          onGroupCreated={handleGroupCreated}
        />
      )}
    </>
  )
}

/** No chat open: just the words (user 2026-11-10: no buttons, no icon). */
function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-[17px] font-medium text-white/45">No message selected</p>
    </div>
  )
}