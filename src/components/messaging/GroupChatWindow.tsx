'use client'

import { useStickToBottom } from '@/lib/hooks/useStickToBottom'
import { nameWithRole } from '@/lib/roles'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Users, Loader2, Check, X, UserPlus, Pencil, Inbox } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { messagingService, type GroupMemberRequest } from '@/lib/services/messaging.service'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import MessageInput from './MessageInput'
import RowActionMenu from '@/components/ui/RowActionMenu'
import GroupOptionsModals, { type GroupOptionsView } from './GroupOptionsModals'
import MessageItem, { MessageDateDivider, TypingMessage } from './MessageItem'
import { groupMessagesByDate, groupEventText, isReadBy, latestSeenPositions } from '@/app/utils/messaging.utils'
import type { DeleteScope } from './ConfirmDeleteDialog'
import type {
  Group,
  GroupMessage,
  GroupMember,
  GroupMessageRaw,
  ReactionTogglePayload,
} from '@/app/types/messaging/messaging.types'
import { toGroupMessage, PHOTO_PLACEHOLDER } from '@/app/types/messaging/messaging.types'

interface ReplyTo     { messageId: string; content: string; senderName: string }

interface GroupChatWindowProps {
  group:             Group
  currentUserId:     string
  onBack:            () => void
  onInviteResponded?: (groupId: string, accepted: boolean) => void
  /** The group was renamed or gained members; reload it. */
  onGroupChanged?:    () => void
}

function getSeenBy(members: GroupMember[], msgCreatedAt: string, senderId: string, currentUserId: string): GroupMember[] {
  return members.filter(m =>
    m.status === 'accepted' &&
    m.user_id !== senderId &&
    m.user_id !== currentUserId &&
    isReadBy(m.last_read_at, msgCreatedAt)
  )
}

function SeenByAvatars({ seenBy }: { seenBy: GroupMember[] }) {
  if (!seenBy.length) return null
  const visible  = seenBy.slice(0, 3)
  const overflow = seenBy.length - visible.length
  return (
    <div className="flex items-center gap-0.5 mt-0.5 justify-end">
      {visible.map(m => (
        <div key={m.user_id} title={`${m.first_name} ${m.last_name}`}
          className="w-3.5 h-3.5 rounded-full bg-[var(--color-surface-dark)] border border-white/20 flex items-center justify-center">
          <span className="font-card text-[0.35rem] text-white/70 leading-none">{m.first_name[0]?.toUpperCase() ?? '?'}</span>
        </div>
      ))}
      {overflow > 0 && <span className="ff-body text-[9px] text-white/30">+{overflow}</span>}
    </div>
  )
}

function applyReactionToggle(msgs: GroupMessage[], payload: ReactionTogglePayload): GroupMessage[] {
  return msgs.map(m => {
    if (m.id !== payload.message_id) return m
    const base      = m.reactions.filter(r => r.user_id !== payload.user_id)
    const reactions = payload.action === 'added'
      ? [...base, { emoji: payload.emoji, user_id: payload.user_id }]
      : base
    return { ...m, reactions }
  })
}

function TypingDots() {
  return (
    <span className="flex items-center gap-[3px]">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)]/60 inline-block"
          animate={{ y: [0, -4, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
      ))}
    </span>
  )
}

export default function GroupChatWindow({ group, currentUserId, onBack, onInviteResponded, onGroupChanged }: GroupChatWindowProps) {
  const bottomRef    = useRef<HTMLDivElement>(null)

  const [messages, setMessages]           = useState<GroupMessage[]>([])
  const [loading, setLoading]             = useState(true)
  const [sending, setSending]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [typingUsers, setTypingUsers]     = useState<Record<string, string>>({})
  const [onlineIds, setOnlineIds]         = useState<string[]>([])
  const [inviteStatus, setInviteStatus]   = useState(group.my_status)
  const [inviteLoading, setInviteLoading] = useState<'accept' | 'decline' | null>(null)
  const [replyTo, setReplyTo]             = useState<ReplyTo | null>(null)
  const [members, setMembers]             = useState<GroupMember[]>(group.members)
  const [optionsView, setOptionsView]     = useState<GroupOptionsView | null>(null)

  // The group is reloaded after a rename or new invitees; pick up its members.
  useEffect(() => { setMembers(group.members) }, [group.members])

  // Only the creator renames the group and changes who is in it; everyone else asks.
  const isCreator = group.created_by === currentUserId
  const [requests, setRequests] = useState<GroupMemberRequest[]>([])
  // Reloaded whenever the group is (a new request or a decision broadcasts group_updated).
  useEffect(() => {
    if (!isCreator) { setRequests([]); return }
    let cancelled = false
    messagingService.getGroupMemberRequests(group.id)
      .then(rs => { if (!cancelled) setRequests(rs ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [group, isCreator])

  const typingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingIds     = useRef<Set<string>>(new Set())

  const isPending       = inviteStatus === 'pending'
  const acceptedMembers = members.filter(m => m.status === 'accepted')
  // Your message counts as seen once every other member has read it.
  const othersInGroup   = acceptedMembers.filter(m => m.user_id !== currentUserId).length
  const memberMap       = Object.fromEntries(members.map(m => [m.user_id, m]))
  const invitedBy       = memberMap[members.find(m => m.user_id === currentUserId)?.invited_by ?? '']
  const invitedByName   = invitedBy ? `${invitedBy.first_name} ${invitedBy.last_name}` : 'Someone'
  const nameOf          = (id: string) => memberMap[id] ? `${memberMap[id].first_name} ${memberMap[id].last_name}`.trim() : undefined
  const creatorLine     = group.created_by === currentUserId
    ? 'You created this group'
    : `${nameOf(group.created_by) ?? 'Someone'} created this group`

  const coerce = useCallback((r: GroupMessageRaw): GroupMessage => toGroupMessage(r), [])

  const fetchMessages = useCallback(async () => {
    if (isPending) { setLoading(false); return }
    try {
      setError(null)
      setLoading(true)
      const raw  = await messagingService.getGroupMessages(group.id)
      const msgs = raw.map(coerce)
      setMessages(msgs)
      if (msgs.length) messagingService.markGroupRead(group.id).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally { setLoading(false) }
  }, [group.id, isPending, coerce])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  // Opens on your first unread message; after that follows only while you're at the bottom.
  const { scrollToLatest, atLatest } = useStickToBottom(bottomRef, group.id, [messages, typingUsers], {
    ready: !loading, messages, currentUserId,
    lastReadAt: group.members.find(m => m.user_id === currentUserId)?.last_read_at ?? null,
  })

  const handleInvite = async (accept: boolean) => {
    setInviteLoading(accept ? 'accept' : 'decline')
    try {
      await messagingService.respondToGroupInvite(group.id, accept)
      setInviteStatus(accept ? 'accepted' : 'declined')
      onInviteResponded?.(group.id, accept)
      if (accept) { setLoading(true); const r = await messagingService.getGroupMessages(group.id); setMessages(r.map(coerce)); setLoading(false) }
    } catch { /* silent */ } finally { setInviteLoading(null) }
  }

  const { broadcastTyping } = useMessagingRealtime({
    currentUserId,
    onMessageUnsent: ({ message_id }) => setMessages(prev => prev.filter(m => m.id !== message_id)),
    conversationId: `group:${group.id}`,
    onGroupMessage: (raw) => {
      if (raw.group_id !== group.id) return
      const incoming = coerce(raw)
      setMessages(prev => {
        const match = [...pendingIds.current].find(id => prev.some(m => m.id === id && m.body === incoming.body))
        if (match) { pendingIds.current.delete(match); return prev.map(m => m.id === match ? incoming : m) }
        if (prev.some(m => m.id === incoming.id)) return prev
        return [...prev, incoming]
      })
      if (raw.sender_id !== currentUserId) messagingService.markGroupRead(group.id).catch(() => {})
    },
    onGroupReadReceipt: ({ user_id, read_at }) => {
      // Update local member last_read_at so seen-by updates in real time
      setMembers(prev => prev.map(m => m.user_id === user_id ? { ...m, last_read_at: read_at } : m))
    },
    onReactionToggle: (payload) => {
      setMessages(prev => applyReactionToggle(prev, payload))
    },
    onTyping: (userId, isTypingNow) => {
      if (userId === currentUserId) return
      const name = memberMap[userId]?.first_name ?? 'Someone'
      if (typingTimeouts.current[userId]) { clearTimeout(typingTimeouts.current[userId]); delete typingTimeouts.current[userId] }
      if (isTypingNow) {
        setTypingUsers(p => ({ ...p, [userId]: name }))
        typingTimeouts.current[userId] = setTimeout(() => setTypingUsers(p => { const n = { ...p }; delete n[userId]; return n }), 3000)
      } else {
        setTypingUsers(p => { const n = { ...p }; delete n[userId]; return n })
      }
    },
    onPresenceChange: setOnlineIds,
  })

  const handleSend = async (text: string, replyToMessageId?: string, attachmentUrl?: string) => {
    scrollToLatest()
    const body = attachmentUrl && !text ? PHOTO_PLACEHOLDER : text
    const oid = `optimistic-${Date.now()}`
    const opt: GroupMessage = {
      id: oid, group_id: group.id, sender_id: currentUserId, body,
      created_at: new Date().toISOString(),
      reply_to: replyTo ? { message_id: replyTo.messageId, content: replyTo.content, sender_id: currentUserId } : null,
      reactions: [],
      kind: 'text', meta: null,
      attachment_url: attachmentUrl ?? null,
    }
    pendingIds.current.add(oid)
    setMessages(p => [...p, opt])
    setReplyTo(null)
    try {
      setSending(true)
      const saved = await messagingService.sendGroupMessage(group.id, { content: text, attachment_url: attachmentUrl, reply_to_message_id: replyToMessageId })
      setMessages(p => p.map(m => m.id === oid ? coerce(saved) : m))
      pendingIds.current.delete(oid)
    } catch { pendingIds.current.delete(oid); setMessages(p => p.filter(m => m.id !== oid)) }
    finally { setSending(false) }
  }

  const confirmDelete = async (id: string, scope: DeleteScope) => {
    setMessages(prev => prev.filter(m => m.id !== id))
    try { await messagingService.hideGroupMessage(group.id, id, scope) }
    catch { fetchMessages() }
  }

  const handleReact = async (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const base     = m.reactions.filter(r => r.user_id !== currentUserId)
      const existing = m.reactions.find(r => r.user_id === currentUserId)
      return { ...m, reactions: existing?.emoji === emoji ? base : [...base, { emoji, user_id: currentUserId }] }
    }))
    try { await messagingService.reactToGroupMessage(group.id, messageId, emoji) }
    catch { fetchMessages() }
  }

  const typingNames  = Object.values(typingUsers)
  const typingLabel  = typingNames.length === 1 ? `${typingNames[0]} is typing`
    : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing`
    : typingNames.length > 2   ? 'Several people are typing' : null

  const dateGroups = groupMessagesByDate(messages)
  // Each member's avatar appears once, under the newest message they have seen.
  const seenAt     = latestSeenPositions(messages, members, currentUserId)

  return (
    <>
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] bg-[var(--color-bg)]">
        <button type="button" onClick={onBack} className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition-colors"><ArrowLeft size={17} /></button>
        <div className="w-9 h-9 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0">
          <Users size={14} className="text-white/60" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="ff-body text-sm text-white leading-tight truncate">{group.name}</p>
          <AnimatePresence mode="wait">
            {typingLabel ? (
              <motion.p key="t" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="ff-body text-[11px] text-[var(--color-cyan)] flex items-center gap-1">
                <TypingDots />{typingLabel}…
              </motion.p>
            ) : (
              <motion.p key="m" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="ff-body text-[11px] text-[var(--color-muted)]">
                {isPending
                  ? <span className="text-amber-400/80">Invite pending</span>
                  : <span>{acceptedMembers.length} member{acceptedMembers.length !== 1 ? 's' : ''} · {onlineIds.filter(id => acceptedMembers.some(m => m.user_id === id)).length} online</span>}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {/* Untitled UI icon dropdown, shared with every table's actions. */}
        <RowActionMenu
          label="Group options"
          heading={group.name ?? 'Group'}
          subheading={isPending ? 'Invite pending' : `${acceptedMembers.length} member${acceptedMembers.length !== 1 ? 's' : ''}`}
          actions={[
            { label: 'See All Members', icon: <Users size={15} />, onSelect: () => setOptionsView('members'), description: 'Everyone in this group' },
            ...(!isPending ? [
              { label: isCreator ? 'Add People' : 'Ask to Add People', icon: <UserPlus size={15} />, onSelect: () => setOptionsView('add'),
                description: isCreator ? 'Add someone to the group' : 'The group creator approves it' },
              ...(isCreator ? [
                { label: 'Edit Group Name', icon: <Pencil size={15} />, onSelect: () => setOptionsView('rename'), description: 'Rename the group' },
                { label: requests.length > 0 ? `Member Requests (${requests.length})` : 'Member Requests', icon: <Inbox size={15} />,
                  tone: requests.length > 0 ? 'accent' as const : 'default' as const,
                  onSelect: () => setOptionsView('requests'), description: 'People asked to be added' },
              ] : []),
            ] : []),
          ]}
        />
      </div>

      <GroupOptionsModals
        view={optionsView}
        group={group}
        currentUserId={currentUserId}
        requests={requests}
        onClose={() => setOptionsView(null)}
        onChanged={() => onGroupChanged?.()}
      />

      {/* The creator's requests waiting for a decision. */}
      {isCreator && !isPending && requests.length > 0 && (
        <button type="button" onClick={() => setOptionsView('requests')}
          className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/[0.07] bg-[var(--color-cyan)]/[0.06] hover:bg-[var(--color-cyan)]/[0.1] text-left transition-colors">
          <Inbox size={14} className="text-[var(--color-cyan)]" />
          <span className="ff-body text-xs text-white/85 flex-1">
            {requests.length} member request{requests.length !== 1 ? 's' : ''} waiting for your approval
          </span>
          <span className="ff-body text-xs text-[var(--color-cyan)]">Review</span>
        </button>
      )}

      {/* Invite banner */}
      <AnimatePresence>
        {isPending && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="shrink-0 overflow-hidden">
            <div className="mx-4 my-3 p-4 rounded-2xl bg-amber-400/[0.06] border border-amber-400/20 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0 mt-0.5"><Users size={14} className="text-amber-400/70" /></div>
                <div className="flex-1 min-w-0">
                  <p className="ff-body text-sm text-white leading-snug"><span className="text-amber-400">{invitedByName}</span> invited you to join <span className="font-medium">{group.name}</span></p>
                  <p className="ff-body text-[11px] text-white/35 mt-0.5">{acceptedMembers.length} member{acceptedMembers.length !== 1 ? 's' : ''} · Accept to read and send messages</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={() => handleInvite(true)} disabled={!!inviteLoading} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[var(--color-cyan)] text-[var(--color-bg)] ff-body text-xs font-medium disabled:opacity-50 transition-opacity">
                  {inviteLoading === 'accept' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Accept
                </motion.button>
                <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={() => handleInvite(false)} disabled={!!inviteLoading} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 ff-body text-xs disabled:opacity-50 hover:bg-white/[0.08]">
                  {inviteLoading === 'decline' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}Decline
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {inviteStatus === 'declined' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center"><X size={20} className="text-white/20" /></div>
          <p className="ff-body text-white/30 text-xs">You declined this group invite.</p>
          <button type="button" onClick={onBack} className="ff-body text-xs text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] transition-colors">Go back</button>
        </div>
      )}

      {inviteStatus === 'accepted' && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20 bg-[var(--color-surface)]">
            {loading && <div className="flex items-center justify-center h-full"><Loader2 size={18} className="animate-spin text-[var(--color-cyan)]/40" /></div>}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <p className="ff-body text-white/30 text-xs">{error}</p>
                <button type="button" onClick={fetchMessages} className="ff-body text-xs text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] transition-colors">Retry</button>
              </div>
            )}
            {!loading && !error && (
              <div className="flex flex-col items-center text-center gap-2 pt-6 pb-8">
                <div className="w-16 h-16 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
                  <Users size={26} className="text-white/60" />
                </div>
                <p className="ff-body text-base text-white font-semibold mt-1 break-words max-w-full">{group.name}</p>
                <p className="ff-body text-xs text-white/45">{creatorLine}</p>
                <div className="flex items-start gap-6 mt-3">
                  <button type="button" onClick={() => setOptionsView('add')} className="flex flex-col items-center gap-1.5 group">
                    <span className="w-10 h-10 rounded-full bg-white/[0.07] group-hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                      <UserPlus size={16} className="text-white/80" />
                    </span>
                    <span className="ff-body text-xs text-white/70">Add</span>
                  </button>
                  {isCreator && (
                    <button type="button" onClick={() => setOptionsView('rename')} className="flex flex-col items-center gap-1.5 group">
                      <span className="w-10 h-10 rounded-full bg-white/[0.07] group-hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                        <Pencil size={16} className="text-white/80" />
                      </span>
                      <span className="ff-body text-xs text-white/70">Name</span>
                    </button>
                  )}
                  <button type="button" onClick={() => setOptionsView('members')} className="flex flex-col items-center gap-1.5 group">
                    <span className="w-10 h-10 rounded-full bg-white/[0.07] group-hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                      <Users size={16} className="text-white/80" />
                    </span>
                    <span className="ff-body text-xs text-white/70">Members</span>
                  </button>
                </div>
                {dateGroups.length === 0 && (
                  <p className="ff-body text-white/25 text-xs mt-6">No messages yet. Start the conversation.</p>
                )}
              </div>
            )}
            {!loading && !error && dateGroups.map(({ date, messages: msgs }) => (
              <div key={date}>
                <MessageDateDivider label={date} />
                <ul className="flex flex-col gap-3">
                  {msgs.map((msg, i) => {
                    if (msg.kind === 'system') {
                      return (
                        <li key={msg.id} className="list-none text-center ff-body text-xs text-white/45 py-0.5 px-6 leading-snug">
                          {groupEventText(msg, currentUserId, nameOf)}
                        </li>
                      )
                    }
                    const isMine        = msg.sender_id === currentUserId
                    const sender        = memberMap[msg.sender_id]
                    const next          = msgs[i + 1]
                    // An event line breaks a run of messages, like a change of sender.
                    const showName      = next?.sender_id !== msg.sender_id || next?.kind === 'system'
                    const isOptimistic  = msg.id.startsWith('optimistic-')
                    const seenBy        = (!isOptimistic && isMine) ? getSeenBy(members, msg.created_at, msg.sender_id, currentUserId) : []
                    const replyName     = msg.reply_to ? (msg.reply_to.sender_id === currentUserId ? 'You' : memberMap[msg.reply_to.sender_id]?.first_name ?? 'Someone') : undefined
                    const seenHere      = seenAt[msg.id] ?? []
                    return (
                      <MessageItem
                        key={msg.id}
                        messageId={msg.id}
                        isMine={isMine}
                        currentUserId={currentUserId}
                        senderName={sender ? nameWithRole(sender.first_name, sender.last_name, sender.role) : 'Someone'}
                        showName={showName}
                        initials={sender ? `${sender.first_name?.[0] ?? '?'}${sender.last_name?.[0] ?? '?'}`.toUpperCase() : '?'}
                        online={onlineIds.includes(msg.sender_id)}
                        createdAt={msg.created_at}
                        body={msg.body}
                        attachmentUrl={msg.attachment_url}
                        stamped={msg.attachment_stamped}
                        seen={isMine ? othersInGroup > 0 && seenBy.length >= othersInGroup : undefined}
                        pending={isOptimistic}
                        replyTo={msg.reply_to ? { name: replyName, content: msg.reply_to.content } : null}
                        reactions={msg.reactions}
                        onReact={emoji => handleReact(msg.id, emoji)}
                        onReply={() => setReplyTo({ messageId: msg.id, content: msg.body, senderName: isMine ? 'You' : sender?.first_name ?? 'Someone' })}
                        onDelete={scope => void confirmDelete(msg.id, scope)}
                        footer={seenHere.length > 0 ? <SeenByAvatars seenBy={seenHere} /> : undefined}
                      />
                    )
                  })}
                </ul>
              </div>
            ))}

            <AnimatePresence>
              {typingLabel && (
                <div className="mt-4">
                  <TypingMessage
                    name={typingLabel}
                    avatar={<div className="size-8 shrink-0 rounded-full bg-[var(--color-surface-dark)] outline-[0.5px] -outline-offset-[0.5px] outline-white/15 flex items-center justify-center"><Users size={13} className="text-white/55" /></div>}
                  />
                </div>
              )}
            </AnimatePresence>
            <div ref={bottomRef} className="h-1" />
          </div>

          <MessageInput onSend={handleSend} onTypingChange={broadcastTyping} disabled={sending} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} showJumpToLatest={!atLatest} onJumpToLatest={scrollToLatest} />
        </>
      )}

      {isPending && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8 bg-[var(--color-surface)]">
          <Users size={22} className="text-white/10" />
          <p className="ff-body text-white/20 text-xs">Accept the invite to see messages and participate.</p>
        </div>
      )}
    </div>
    </>
  )
}
