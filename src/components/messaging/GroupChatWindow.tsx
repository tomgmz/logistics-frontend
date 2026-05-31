'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, MoreVertical, Users, Loader2, Check, X, CornerUpLeft } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { messagingService } from '@/lib/services/messaging.service'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import MessageInput from './MessageInput'
import { QuickReactBar } from './EmojiPicker'
import { groupMessagesByDate, formatMessageTime } from '@/app/utils/messaging.utils'
import { Reply as ReplyIcon } from 'lucide-react'
import type {
  Group,
  GroupMessage,
  GroupMember,
  GroupMessageRaw,
  MessageReaction,
  ReactionTogglePayload,
} from '@/app/types/messaging/messaging.types'
import { toGroupMessage } from '@/app/types/messaging/messaging.types'

interface ReplyTo     { messageId: string; content: string; senderName: string }

interface GroupChatWindowProps {
  group:             Group
  currentUserId:     string
  onBack:            () => void
  onInviteResponded?: (groupId: string, accepted: boolean) => void
}

function getSeenBy(members: GroupMember[], msgCreatedAt: string, senderId: string, currentUserId: string): GroupMember[] {
  return members.filter(m =>
    m.status === 'accepted' &&
    m.user_id !== senderId &&
    m.user_id !== currentUserId &&
    m.last_read_at !== null &&
    m.last_read_at >= msgCreatedAt
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

interface ReactionGroup { emoji: string; count: number; reacted: boolean }

function groupReactions(reactions: MessageReaction[], userId: string): ReactionGroup[] {
  const map = new Map<string, { count: number; reacted: boolean }>()
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, reacted: false }
    map.set(r.emoji, { count: cur.count + 1, reacted: cur.reacted || r.user_id === userId })
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, ...v }))
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

export default function GroupChatWindow({ group, currentUserId, onBack, onInviteResponded }: GroupChatWindowProps) {
  const bottomRef    = useRef<HTMLDivElement>(null)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [messages, setMessages]           = useState<GroupMessage[]>([])
  const [loading, setLoading]             = useState(true)
  const [sending, setSending]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [typingUsers, setTypingUsers]     = useState<Record<string, string>>({})
  const [onlineIds, setOnlineIds]         = useState<string[]>([])
  const [inviteStatus, setInviteStatus]   = useState(group.my_status)
  const [inviteLoading, setInviteLoading] = useState<'accept' | 'decline' | null>(null)
  const [replyTo, setReplyTo]             = useState<ReplyTo | null>(null)
  const [hoveredId, setHoveredId]         = useState<string | null>(null)
  const [members, setMembers]             = useState<GroupMember[]>(group.members)

  const typingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingIds     = useRef<Set<string>>(new Set())

  const isPending       = inviteStatus === 'pending'
  const acceptedMembers = members.filter(m => m.status === 'accepted')
  const memberMap       = Object.fromEntries(members.map(m => [m.user_id, m]))
  const invitedBy       = memberMap[members.find(m => m.user_id === currentUserId)?.invited_by ?? '']
  const invitedByName   = invitedBy ? `${invitedBy.first_name} ${invitedBy.last_name}` : 'Someone'

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
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typingUsers])

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

  const handleSend = async (body: string, replyToMessageId?: string) => {
    const oid = `optimistic-${Date.now()}`
    const opt: GroupMessage = {
      id: oid, group_id: group.id, sender_id: currentUserId, body,
      created_at: new Date().toISOString(),
      reply_to: replyTo ? { message_id: replyTo.messageId, content: replyTo.content, sender_id: currentUserId } : null,
      reactions: [],
    }
    pendingIds.current.add(oid)
    setMessages(p => [...p, opt])
    setReplyTo(null)
    try {
      setSending(true)
      const saved = await messagingService.sendGroupMessage(group.id, { content: body, reply_to_message_id: replyToMessageId })
      setMessages(p => p.map(m => m.id === oid ? coerce(saved) : m))
      pendingIds.current.delete(oid)
    } catch { pendingIds.current.delete(oid); setMessages(p => p.filter(m => m.id !== oid)) }
    finally { setSending(false) }
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

  return (
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
        <button type="button" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors"><MoreVertical size={15} /></button>
      </div>

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
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-1 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20 bg-[var(--color-surface)]">
            {loading && <div className="flex items-center justify-center h-full"><Loader2 size={18} className="animate-spin text-[var(--color-cyan)]/40" /></div>}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <p className="ff-body text-white/30 text-xs">{error}</p>
                <button type="button" onClick={fetchMessages} className="ff-body text-xs text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] transition-colors">Retry</button>
              </div>
            )}
            {!loading && !error && dateGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <Users size={24} className="text-white/20" />
                <p className="ff-body text-white/20 text-xs">No messages yet. Start the conversation.</p>
              </div>
            )}
            {!loading && !error && dateGroups.map(({ date, messages: msgs }) => (
              <div key={date} className="space-y-2.5">
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="ff-body text-[10px] text-white/20 uppercase tracking-widest shrink-0">{date}</span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                </div>
                {msgs.map((msg, i) => {
                  const isMine        = msg.sender_id === currentUserId
                  const sender        = memberMap[msg.sender_id]
                  const prev          = msgs[i - 1]
                  const showName      = !isMine && prev?.sender_id !== msg.sender_id
                  const showAvatar    = !isMine && (msgs[i + 1]?.sender_id !== msg.sender_id || i === msgs.length - 1)
                  const senderInitials= sender ? `${sender.first_name?.[0] ?? '?'}${sender.last_name?.[0] ?? '?'}`.toUpperCase() : '?'
                  const isSenderOnline= sender ? onlineIds.includes(sender.user_id) : false
                  const isOptimistic  = msg.id.startsWith('optimistic-')
                  const grouped       = groupReactions(msg.reactions, currentUserId)
                  const seenBy        = (!isOptimistic && isMine) ? getSeenBy(members, msg.created_at, msg.sender_id, currentUserId) : []
                  const replyName     = msg.reply_to ? (msg.reply_to.sender_id === currentUserId ? 'You' : memberMap[msg.reply_to.sender_id]?.first_name ?? 'Someone') : undefined

                  return (
                    <div key={msg.id}
                      className={`flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                      onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); hoverTimeout.current = setTimeout(() => setHoveredId(msg.id), 60) }}
                      onMouseLeave={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); setHoveredId(null) }}
                    >
                      {!isMine && (
                        <div className="shrink-0 self-end mb-1">
                          {showAvatar ? (
                            <div className="relative">
                              <div className="w-6 h-6 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
                                <span className="font-card text-[0.5rem] text-white/75">{senderInitials}</span>
                              </div>
                              {isSenderOnline && <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-[var(--color-green)] border border-[var(--color-bg)]" />}
                            </div>
                          ) : <div className="w-6" />}
                        </div>
                      )}

                      <div className={`relative flex flex-col gap-0.5 max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
                        <AnimatePresence>
                          {hoveredId === msg.id && (
                            <QuickReactBar isMine={isMine}
                              currentUserReaction={grouped.find(r => r.reacted)?.emoji ?? null}
                              onReact={emoji => { handleReact(msg.id, emoji); setHoveredId(null) }}
                            />
                          )}
                        </AnimatePresence>

                        {showName && sender && <span className="ff-body text-[10px] text-white/30 px-1">{sender.first_name} {sender.last_name}</span>}

                        {msg.reply_to && (
                          <div className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-xl mb-0.5 max-w-full border-l-2 ${isMine ? 'bg-white/[0.06] border-white/20' : 'bg-white/[0.04] border-[var(--color-cyan)]/40'}`}>
                            <CornerUpLeft size={10} className="text-white/30 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              {replyName && <p className="ff-body text-[10px] text-[var(--color-cyan)]/70 truncate">{replyName}</p>}
                              <p className="ff-body text-[11px] text-white/40 truncate">{msg.reply_to.content}</p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          {isMine && hoveredId === msg.id && (
                            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} type="button"
                              onClick={() => setReplyTo({ messageId: msg.id, content: msg.body, senderName: 'You' })}
                              className="p-1.5 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors"
                            ><ReplyIcon size={13} /></motion.button>
                          )}
                          <div className={`px-3 py-2 rounded-2xl ff-body text-[13px] leading-relaxed break-words ${isMine ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] rounded-br-sm' : 'glass-surface text-white border border-white/[0.06] rounded-bl-sm'} ${isOptimistic ? 'opacity-70' : ''}`}>
                            {msg.body}
                          </div>
                          {!isMine && hoveredId === msg.id && (
                            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} type="button"
                              onClick={() => setReplyTo({ messageId: msg.id, content: msg.body, senderName: sender?.first_name ?? 'Someone' })}
                              className="p-1.5 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors"
                            ><ReplyIcon size={13} /></motion.button>
                          )}
                        </div>

                        <span className="ff-body text-[9px] text-white/20 px-1">{formatMessageTime(msg.created_at)}</span>

                        {grouped.length > 0 && (
                          <div className={`flex flex-wrap gap-1 px-1 ${isMine ? 'justify-end' : ''}`}>
                            {grouped.map(r => (
                              <button key={r.emoji} type="button" onClick={() => handleReact(msg.id, r.emoji)}
                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border transition-all ${r.reacted ? 'bg-[var(--color-cyan)]/15 border-[var(--color-cyan)]/30' : 'bg-white/[0.05] border-white/10 hover:bg-white/10'}`}>
                                <span className="text-[13px] leading-none">{r.emoji}</span>
                                {r.count > 1 && <span className="ff-body text-[10px] text-white/50">{r.count}</span>}
                              </button>
                            ))}
                          </div>
                        )}

                        {isMine && <SeenByAvatars seenBy={seenBy} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            <AnimatePresence>
              {typingLabel && (
                <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.95 }} transition={{ duration: 0.18 }} className="flex items-end gap-2 max-w-[72%] mr-auto">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0 mb-1"><Users size={10} className="text-white/50" /></div>
                  <div className="flex flex-col gap-0.5 items-start">
                    <span className="ff-body text-[10px] text-white/30 px-1">{typingLabel}</span>
                    <div className="glass-surface border border-white/[0.06] rounded-2xl rounded-bl-sm px-4 py-3"><TypingDots /></div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={bottomRef} className="h-1" />
          </div>

          <MessageInput onSend={handleSend} onTypingChange={broadcastTyping} disabled={sending} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
        </>
      )}

      {isPending && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8 bg-[var(--color-surface)]">
          <Users size={22} className="text-white/10" />
          <p className="ff-body text-white/20 text-xs">Accept the invite to see messages and participate.</p>
        </div>
      )}
    </div>
  )
}