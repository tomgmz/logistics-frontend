'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Minus, Users, CornerUpLeft, Check } from 'lucide-react'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { useAuthStore } from '@/lib/store/auth.store'
import { messagingService } from '@/lib/services/messaging.service'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { groupMessagesByDate, formatMessageTime } from '@/app/utils/messaging.utils'
import { toGroup, toGroupMessage } from '@/app/types/messaging/messaging.types'
import type {
  Group,
  GroupMessage,
  GroupMember,
  GroupMessageRaw,
  MessageReaction,
  ReactionTogglePayload,
} from '@/app/types/messaging/messaging.types'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import { QuickReactBar } from './EmojiPicker'
import MessageInput from './MessageInput'
import { Reply as ReplyIcon } from 'lucide-react'

const BUBBLE_W   = 338
const BUBBLE_GAP = 10
const MIN_COL_W  = 82

interface Props { groupId: string; index: number }

// ─── Seen-by helpers ──────────────────────────────────────────────────────────

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
          className="w-3 h-3 rounded-full bg-[var(--color-surface-dark)] border border-white/20 flex items-center justify-center">
          <span className="font-card text-[0.3rem] text-white/70 leading-none">{m.first_name[0]?.toUpperCase() ?? '?'}</span>
        </div>
      ))}
      {overflow > 0 && <span className="ff-body text-[8px] text-white/30">+{overflow}</span>}
    </div>
  )
}

// ─── Reaction helpers ─────────────────────────────────────────────────────────

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
    const base: MessageReaction[] = m.reactions.filter(r => r.user_id !== payload.user_id)
    return { ...m, reactions: payload.action === 'added' ? [...base, { emoji: payload.emoji, user_id: payload.user_id }] : base }
  })
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="flex items-center gap-[3px]">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-1 h-1 rounded-full bg-[var(--color-cyan)]/60 inline-block"
          animate={{ y: [0, -3, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
      ))}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MessengerGroupBubble({ groupId, index }: Props) {
  const { closeChat, minimizeChat } = useMessengerStore()
  const { user }                    = useAuthStore()
  const currentUserId               = user?.user_id ?? ''
  const isMobile                    = useIsMobile()
  const rightOffset                 = MIN_COL_W + index * (BUBBLE_W + BUBBLE_GAP)

  const [group, setGroup]         = useState<Group | null>(null)
  const [messages, setMessages]   = useState<GroupMessage[]>([])
  const [members, setMembers]     = useState<GroupMember[]>([])   // live copy for seen-by
  const [loadingGroup, setLG]     = useState(true)
  const [loadingMsgs, setLM]      = useState(true)
  const [sending, setSending]     = useState(false)
  const [inviteStatus, setInviteStatus]   = useState<Group['my_status'] | null>(null)
  const [inviteLoading, setInviteLoading] = useState<'accept' | 'decline' | null>(null)
  const [typingUsers, setTyping]  = useState<Record<string, string>>({})
  const [onlineIds, setOnline]    = useState<string[]>([])
  const [hoveredId, setHovered]   = useState<string | null>(null)
  const [replyTo, setReplyTo]     = useState<{ messageId: string; content: string; senderName: string } | null>(null)

  const bottomRef      = useRef<HTMLDivElement>(null)
  const hoverTimeout   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingIds     = useRef<Set<string>>(new Set())

  const coerce = useCallback((r: GroupMessageRaw): GroupMessage => toGroupMessage(r), [])

  // Load group metadata + messages
  useEffect(() => {
    messagingService.getGroups()
      .then(raw => {
        const found = raw.find(g => g.group_id === groupId)
        if (found) { const g = toGroup(found); setGroup(g); setMembers(g.members); setInviteStatus(g.my_status) }
      })
      .catch(() => {})
      .finally(() => setLG(false))
  }, [groupId])

  const fetchMessages = useCallback(async () => {
    try {
      const raw  = await messagingService.getGroupMessages(groupId)
      const msgs = raw.map(coerce)
      setMessages(msgs)
      if (msgs.length) messagingService.markGroupRead(groupId).catch(() => {})
    } catch { /* silent */ }
    finally { setLM(false) }
  }, [groupId, coerce])

  // Only pull messages once the invite is accepted — a pending member can't read them.
  useEffect(() => {
    if (inviteStatus === 'accepted') fetchMessages()
    else if (inviteStatus) setLM(false)
  }, [fetchMessages, inviteStatus])

  const handleInvite = async (accept: boolean) => {
    setInviteLoading(accept ? 'accept' : 'decline')
    try {
      await messagingService.respondToGroupInvite(groupId, accept)
      if (accept) { setInviteStatus('accepted'); fetchMessages() }
      else { closeChat(groupId) }
    } catch { /* silent */ }
    finally { setInviteLoading(null) }
  }
  useEffect(() => { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50) }, [messages, typingUsers])

  const memberMap = Object.fromEntries(members.map(m => [m.user_id, m]))

  const { broadcastTyping } = useMessagingRealtime({
    currentUserId,
    conversationId: `group:${groupId}`,
    onGroupMessage: (raw) => {
      if (raw.group_id !== groupId) return
      const inc = coerce(raw)
      setMessages(prev => {
        const match = [...pendingIds.current].find(id => prev.some(m => m.id === id && m.body === inc.body))
        if (match) { pendingIds.current.delete(match); return prev.map(m => m.id === match ? inc : m) }
        if (prev.some(m => m.id === inc.id)) return prev
        return [...prev, inc]
      })
      if (raw.sender_id !== currentUserId) messagingService.markGroupRead(groupId).catch(() => {})
    },
    onGroupReadReceipt: ({ user_id, read_at }) => {
      setMembers(prev => prev.map(m => m.user_id === user_id ? { ...m, last_read_at: read_at } : m))
    },
    onReactionToggle: payload => setMessages(prev => applyReactionToggle(prev, payload)),
    onTyping: (uid, isTypingNow) => {
      if (uid === currentUserId) return
      const name = memberMap[uid]?.first_name ?? 'Someone'
      if (typingTimeouts.current[uid]) { clearTimeout(typingTimeouts.current[uid]); delete typingTimeouts.current[uid] }
      if (isTypingNow) {
        setTyping(p => ({ ...p, [uid]: name }))
        typingTimeouts.current[uid] = setTimeout(() => setTyping(p => { const n = { ...p }; delete n[uid]; return n }), 3000)
      } else {
        setTyping(p => { const n = { ...p }; delete n[uid]; return n })
      }
    },
    onPresenceChange: setOnline,
  })

  const handleSend = async (body: string, replyToMessageId?: string) => {
    const oid = `optimistic-${Date.now()}`
    pendingIds.current.add(oid)
    setMessages(prev => [...prev, {
      id: oid, group_id: groupId, sender_id: currentUserId, body,
      created_at: new Date().toISOString(),
      reply_to: replyTo ? { message_id: replyTo.messageId, content: replyTo.content, sender_id: currentUserId } : null,
      reactions: [],
    }])
    setReplyTo(null)
    try {
      setSending(true)
      const saved = await messagingService.sendGroupMessage(groupId, { content: body, reply_to_message_id: replyToMessageId })
      setMessages(prev => prev.map(m => m.id === oid ? coerce(saved) : m))
      pendingIds.current.delete(oid)
    } catch { pendingIds.current.delete(oid); setMessages(prev => prev.filter(m => m.id !== oid)) }
    finally { setSending(false) }
  }

  const handleReact = async (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const base = m.reactions.filter(r => r.user_id !== currentUserId)
      const cur  = m.reactions.find(r => r.user_id === currentUserId)
      return { ...m, reactions: cur?.emoji === emoji ? base : [...base, { emoji, user_id: currentUserId }] }
    }))
    try { await messagingService.reactToGroupMessage(groupId, messageId, emoji) }
    catch { fetchMessages() }
  }

  const typingNames = Object.values(typingUsers)
  const typingLabel = typingNames.length === 1 ? `${typingNames[0]} typing…`
    : typingNames.length > 1 ? 'Several typing…' : null

  const dateGroups = groupMessagesByDate(messages)
  const acceptedCount = members.filter(m => m.status === 'accepted').length
  const isPending     = inviteStatus === 'pending'
  const invitedBy     = memberMap[members.find(m => m.user_id === currentUserId)?.invited_by ?? '']
  const invitedByName = invitedBy ? `${invitedBy.first_name} ${invitedBy.last_name}` : 'Someone'

  // On mobile chats go full-screen like the native app, so only the top one shows.
  if (isMobile && index !== 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      style={isMobile ? { inset: 0, width: '100%', height: '100%' } : { right: rightOffset, width: BUBBLE_W, height: 490 }}
      className={`fixed z-50 flex flex-col overflow-hidden shadow-2xl ${isMobile ? 'inset-0 rounded-none border-0' : 'bottom-0 rounded-t-2xl border border-b-0 border-white/[0.09]'}`}
    >
      {/* Header */}
      <div className="w-full flex items-center gap-2.5 px-3 py-2.5 shrink-0 bg-[var(--color-bg)] border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0">
          {loadingGroup ? <Loader2 size={10} className="animate-spin text-white/30" /> : <Users size={13} className="text-white/60" />}
        </div>

        <div className="flex-1 min-w-0">
          {loadingGroup ? (
            <p className="ff-body text-xs text-white/30">Loading…</p>
          ) : (
            <>
              <p className="ff-body text-xs text-white truncate">{group?.name}</p>
              <AnimatePresence mode="wait">
                {typingLabel ? (
                  <motion.p key="t" initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="ff-body text-[9px] text-[var(--color-cyan)] flex items-center gap-0.5">
                    <TypingDots />{typingLabel}
                  </motion.p>
                ) : (
                  <motion.p key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ff-body text-[9px] text-white/30">
                    {acceptedCount} member{acceptedCount !== 1 ? 's' : ''} · {onlineIds.filter(id => members.some(m => m.user_id === id && m.status === 'accepted')).length} online
                  </motion.p>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => minimizeChat(groupId)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors" aria-label="Minimize"><Minus size={12} /></button>
          <button type="button" onClick={() => closeChat(groupId)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-red-400 transition-colors" aria-label="Close"><X size={12} /></button>
        </div>
      </div>

      {/* Invite banner — pending member must accept before reading / sending */}
      {isPending ? (
        <div className="flex flex-col flex-1 overflow-y-auto bg-[var(--color-surface)] min-h-0">
          <div className="m-3 p-3.5 rounded-2xl bg-amber-400/[0.06] border border-amber-400/20 flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0 mt-0.5"><Users size={12} className="text-amber-400/70" /></div>
              <div className="flex-1 min-w-0">
                <p className="ff-body text-[12px] text-white leading-snug"><span className="text-amber-400">{invitedByName}</span> invited you to join <span className="font-medium">{group?.name}</span></p>
                <p className="ff-body text-[10px] text-white/35 mt-0.5">{acceptedCount} member{acceptedCount !== 1 ? 's' : ''} · Accept to read and send messages</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={() => handleInvite(true)} disabled={!!inviteLoading} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[var(--color-cyan)] text-[var(--color-bg)] ff-body text-[11px] font-medium disabled:opacity-50 transition-opacity">
                {inviteLoading === 'accept' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Accept
              </motion.button>
              <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={() => handleInvite(false)} disabled={!!inviteLoading} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 ff-body text-[11px] disabled:opacity-50 hover:bg-white/[0.08]">
                {inviteLoading === 'decline' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}Decline
              </motion.button>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-6">
            <Users size={20} className="text-white/10" />
            <p className="ff-body text-white/20 text-[11px]">Accept the invite to see messages and participate.</p>
          </div>
        </div>
      ) : (
      /* Messages */
      <div className="flex flex-col flex-1 overflow-hidden bg-[var(--color-surface)] min-h-0">
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1.5 min-h-0 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          {loadingMsgs && (
            <div className="flex items-center justify-center h-full"><Loader2 size={16} className="animate-spin text-[var(--color-cyan)]/30" /></div>
          )}

          {!loadingMsgs && dateGroups.map(({ date, messages: msgs }) => (
            <div key={date} className="space-y-1.5">
              <p className="ff-body text-[9px] text-white/20 text-center uppercase tracking-widest">{date}</p>
              {msgs.map((msg, i) => {
                const isMine       = msg.sender_id === currentUserId
                const sender       = memberMap[msg.sender_id]
                const prev         = msgs[i - 1]
                const showName     = !isMine && prev?.sender_id !== msg.sender_id
                const isOptimistic = msg.id.startsWith('optimistic-')
                const grouped      = groupReactions(msg.reactions, currentUserId)
                const seenBy       = (!isOptimistic && isMine) ? getSeenBy(members, msg.created_at, msg.sender_id, currentUserId) : []
                const replyName    = msg.reply_to ? (msg.reply_to.sender_id === currentUserId ? 'You' : memberMap[msg.reply_to.sender_id]?.first_name ?? 'Someone') : undefined
                const senderInitials = sender ? `${sender.first_name?.[0] ?? '?'}${sender.last_name?.[0] ?? '?'}`.toUpperCase() : '?'
                const showAvatar   = !isMine && (msgs[i + 1]?.sender_id !== msg.sender_id || i === msgs.length - 1)

                return (
                  <div key={msg.id}
                    className={`flex gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                    onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); hoverTimeout.current = setTimeout(() => setHovered(msg.id), 60) }}
                    onMouseLeave={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); setHovered(null) }}
                  >
                    {!isMine && (
                      <div className="shrink-0 self-end mb-0.5">
                        {showAvatar ? (
                          <div className="relative">
                            <div className="w-5 h-5 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
                              <span className="font-card text-[0.4rem] text-white/75">{senderInitials}</span>
                            </div>
                            {onlineIds.includes(msg.sender_id) && <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-[var(--color-green)] border border-[var(--color-bg)]" />}
                          </div>
                        ) : <div className="w-5" />}
                      </div>
                    )}

                    <div className={`relative flex flex-col gap-0.5 max-w-[85%] ${isMine ? 'items-end' : 'items-start'}`}>
                      <AnimatePresence>
                        {hoveredId === msg.id && (
                          <QuickReactBar isMine={isMine}
                            currentUserReaction={grouped.find(r => r.reacted)?.emoji ?? null}
                            onReact={emoji => { handleReact(msg.id, emoji); setHovered(null) }}
                          />
                        )}
                      </AnimatePresence>

                      {showName && sender && <span className="ff-body text-[9px] text-white/30 px-0.5">{sender.first_name} {sender.last_name}</span>}

                      {msg.reply_to && (
                        <div className={`flex items-start gap-1 px-2 py-1 rounded-lg mb-0.5 max-w-full border-l-2 ${isMine ? 'bg-white/[0.06] border-white/20' : 'bg-white/[0.04] border-[var(--color-cyan)]/40'}`}>
                          <CornerUpLeft size={9} className="text-white/30 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            {replyName && <p className="ff-body text-[9px] text-[var(--color-cyan)]/70 truncate">{replyName}</p>}
                            <p className="ff-body text-[10px] text-white/40 truncate">{msg.reply_to.content}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-0.5">
                        {isMine && hoveredId === msg.id && (
                          <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} type="button"
                            onClick={() => setReplyTo({ messageId: msg.id, content: msg.body, senderName: 'You' })}
                            className="p-1 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors"
                          ><ReplyIcon size={11} /></motion.button>
                        )}
                        <div className={`px-2.5 py-1.5 rounded-2xl ff-body text-[11.5px] leading-relaxed break-words ${isMine ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] rounded-br-sm' : 'glass-surface text-white border border-white/[0.06] rounded-bl-sm'} ${isOptimistic ? 'opacity-60' : ''}`}>
                          {msg.body}
                        </div>
                        {!isMine && hoveredId === msg.id && (
                          <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} type="button"
                            onClick={() => setReplyTo({ messageId: msg.id, content: msg.body, senderName: sender?.first_name ?? 'Someone' })}
                            className="p-1 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/60 transition-colors"
                          ><ReplyIcon size={11} /></motion.button>
                        )}
                      </div>

                      <span className="ff-body text-[8px] text-white/20 px-0.5">{formatMessageTime(msg.created_at)}</span>

                      {grouped.length > 0 && (
                        <div className={`flex flex-wrap gap-0.5 ${isMine ? 'justify-end' : ''}`}>
                          {grouped.map(r => (
                            <button key={r.emoji} type="button" onClick={() => handleReact(msg.id, r.emoji)}
                              className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full border transition-all ${r.reacted ? 'bg-[var(--color-cyan)]/15 border-[var(--color-cyan)]/30' : 'bg-white/[0.05] border-white/10 hover:bg-white/10'}`}>
                              <span className="text-[11px] leading-none">{r.emoji}</span>
                              {r.count > 1 && <span className="ff-body text-[8px] text-white/50">{r.count}</span>}
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
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-end gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0"><Users size={9} className="text-white/50" /></div>
                <div className="glass-surface border border-white/[0.06] rounded-2xl rounded-bl-sm px-2.5 py-1.5"><TypingDots /></div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        <MessageInput
          onSend={handleSend}
          onTypingChange={broadcastTyping}
          disabled={sending}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          compact
        />
      </div>
      )}
    </motion.div>
  )
}