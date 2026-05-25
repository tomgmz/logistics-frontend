'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, MoreVertical, Users, Loader2, Check, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { messagingService } from '@/lib/services/messaging.service'
import { useMessagingRealtime } from '@/lib/hooks/useMessagingRealtime'
import MessageInput from './MessageInput'
import { groupMessagesByDate } from '@/app/utils/messaging.utils'
import type { Group, GroupMessage, GroupMessageRaw } from '@/app/types/messaging/messaging.types'
import { toGroupMessage } from '@/app/types/messaging/messaging.types'

interface GroupChatWindowProps {
  group: Group
  currentUserId: string
  onBack: () => void
  onInviteResponded?: (groupId: string, accepted: boolean) => void
}

export default function GroupChatWindow({ group, currentUserId, onBack, onInviteResponded }: GroupChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({})
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingOptimisticIds = useRef<Set<string>>(new Set())
  const [inviteStatus, setInviteStatus] = useState<'pending' | 'accepted' | 'declined'>(group.my_status)
  const [inviteResponding, setInviteResponding] = useState<'accept' | 'decline' | null>(null)

  const isPending = inviteStatus === 'pending'
  const acceptedMembers = group.members.filter(m => m.status === 'accepted')
  const memberMap = Object.fromEntries(group.members.map(m => [m.user_id, m]))
  const invitedByMember = memberMap[group.members.find(m => m.user_id === currentUserId)?.invited_by ?? '']
  const invitedByName = invitedByMember
    ? `${invitedByMember.first_name} ${invitedByMember.last_name}`
    : 'Someone'

  const fetchMessages = useCallback(async () => {
    if (isPending) { setLoading(false); return }
    try {
      setError(null)
      setLoading(true)
      const raw = await messagingService.getGroupMessages(group.id)
      const msgs = raw.map(toGroupMessage)
      setMessages(msgs)
      if (msgs.length > 0) {
        messagingService.markGroupRead(group.id, msgs.map(m => m.id)).catch(() => {})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [group.id, isPending])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  const handleInviteRespond = async (accept: boolean) => {
    setInviteResponding(accept ? 'accept' : 'decline')
    try {
      await messagingService.respondToGroupInvite(group.id, accept)
      setInviteStatus(accept ? 'accepted' : 'declined')
      onInviteResponded?.(group.id, accept)
      if (accept) {
        // Now load messages
        setLoading(true)
        const raw = await messagingService.getGroupMessages(group.id)
        const msgs = raw.map(toGroupMessage)
        setMessages(msgs)
        setLoading(false)
      }
    } catch {
      // silently fail, keep pending
    } finally {
      setInviteResponding(null)
    }
  }

  const { broadcastTyping } = useMessagingRealtime({
    currentUserId,
    conversationId: `group:${group.id}`,
    onGroupMessage: (raw: GroupMessageRaw) => {
      if (raw.group_id !== group.id) return
      const incoming = toGroupMessage(raw)
      setMessages(prev => {
        const matchedId = [...pendingOptimisticIds.current].find(id =>
          prev.some(m => m.id === id && m.body === incoming.body)
        )
        if (matchedId) {
          pendingOptimisticIds.current.delete(matchedId)
          return prev.map(m => m.id === matchedId ? incoming : m)
        }
        if (prev.some(m => m.id === incoming.id)) return prev
        return [...prev, incoming]
      })
      if (raw.sender_id !== currentUserId) {
        messagingService.markGroupRead(group.id, [incoming.id]).catch(() => {})
      }
    },
    onTyping: (userId, isTyping) => {
      if (userId === currentUserId) return
      const member = memberMap[userId]
      const name = member ? member.first_name : 'Someone'
      if (typingTimeoutsRef.current[userId]) {
        clearTimeout(typingTimeoutsRef.current[userId])
        delete typingTimeoutsRef.current[userId]
      }
      if (isTyping) {
        setTypingUsers(prev => ({ ...prev, [userId]: name }))
        typingTimeoutsRef.current[userId] = setTimeout(() => {
          setTypingUsers(prev => { const next = { ...prev }; delete next[userId]; return next })
          delete typingTimeoutsRef.current[userId]
        }, 3000)
      } else {
        setTypingUsers(prev => { const next = { ...prev }; delete next[userId]; return next })
      }
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingUsers])

  const handleSend = async (body: string) => {
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: GroupMessage = {
      id: optimisticId,
      group_id: group.id,
      sender_id: currentUserId,
      body,
      created_at: new Date().toISOString(),
    }
    pendingOptimisticIds.current.add(optimisticId)
    setMessages(prev => [...prev, optimisticMsg])
    try {
      setSending(true)
      const saved = await messagingService.sendGroupMessage(group.id, { content: body })
      setMessages(prev => prev.map(m => m.id === optimisticId ? toGroupMessage(saved) : m))
      pendingOptimisticIds.current.delete(optimisticId)
    } catch {
      pendingOptimisticIds.current.delete(optimisticId)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
    } finally {
      setSending(false)
    }
  }

  const typingNames = Object.values(typingUsers)
  const typingLabel = typingNames.length === 1
    ? `${typingNames[0]} is typing`
    : typingNames.length === 2
      ? `${typingNames[0]} and ${typingNames[1]} are typing`
      : typingNames.length > 2 ? 'Several people are typing' : null

  const dateGroups = groupMessagesByDate(messages)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] bg-[var(--color-bg)]">
        <button type="button" onClick={onBack} className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={17} />
        </button>
        <div className="w-9 h-9 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0">
          <Users size={14} className="text-white/60" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="ff-body text-sm text-white leading-tight truncate">{group.name}</p>
          <AnimatePresence mode="wait">
            {typingLabel ? (
              <motion.p key="typing" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="ff-body text-[11px] text-[var(--color-cyan)] flex items-center gap-1">
                <TypingDots />{typingLabel}…
              </motion.p>
            ) : (
              <motion.p key="members" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="ff-body text-[11px] text-[var(--color-muted)]">
                {isPending
                  ? <span className="text-amber-400/80">Invite pending</span>
                  : `${acceptedMembers.length} member${acceptedMembers.length !== 1 ? 's' : ''}`
                }
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <button type="button" className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/70 transition-colors">
          <MoreVertical size={15} />
        </button>
      </div>

      {/* Invite banner */}
      <AnimatePresence>
        {isPending && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="mx-4 my-3 p-4 rounded-2xl bg-amber-400/[0.06] border border-amber-400/20 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Users size={14} className="text-amber-400/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="ff-body text-sm text-white leading-snug">
                    <span className="text-amber-400">{invitedByName}</span> invited you to join <span className="text-white font-medium">{group.name}</span>
                  </p>
                  <p className="ff-body text-[11px] text-white/35 mt-0.5">
                    {acceptedMembers.length} member{acceptedMembers.length !== 1 ? 's' : ''} · Accept to read and send messages
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleInviteRespond(true)}
                  disabled={!!inviteResponding}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[var(--color-cyan)] text-[var(--color-bg)] ff-body text-xs font-medium disabled:opacity-50 transition-opacity"
                >
                  {inviteResponding === 'accept'
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Check size={13} />
                  }
                  Accept
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleInviteRespond(false)}
                  disabled={!!inviteResponding}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 ff-body text-xs disabled:opacity-50 transition-opacity hover:bg-white/[0.08] hover:text-white/70"
                >
                  {inviteResponding === 'decline'
                    ? <Loader2 size={13} className="animate-spin" />
                    : <X size={13} />
                  }
                  Decline
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Declined state */}
      {inviteStatus === 'declined' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
            <X size={20} className="text-white/20" />
          </div>
          <p className="ff-body text-white/30 text-xs">You declined this group invite.</p>
          <button type="button" onClick={onBack} className="ff-body text-xs text-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] transition-colors">
            Go back
          </button>
        </div>
      )}

      {/* Messages area — hidden while pending or declined */}
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
            {!loading && !error && dateGroups.map(({ date, messages: groupMsgs }) => (
              <div key={date} className="space-y-2.5">
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="ff-body text-[10px] text-white/20 uppercase tracking-widest shrink-0">{date}</span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                </div>
                {groupMsgs.map((msg, i) => {
                  const isMine = msg.sender_id === currentUserId
                  const sender = memberMap[msg.sender_id]
                  const prevMsg = groupMsgs[i - 1]
                  const showName = !isMine && prevMsg?.sender_id !== msg.sender_id
                  const isLastInRun = !isMine && (groupMsgs[i + 1]?.sender_id !== msg.sender_id || i === groupMsgs.length - 1)
                  const senderInitials = sender
                    ? `${sender.first_name[0] ?? '?'}${sender.last_name[0] ?? '?'}`.toUpperCase()
                    : '?'
                  return (
                    <div key={msg.id} className={`flex gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {!isMine && (
                        <div className="shrink-0 self-end mb-1">
                          {isLastInRun
                            ? <div className="w-6 h-6 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center"><span className="font-card text-[0.5rem] text-white/75">{senderInitials}</span></div>
                            : <div className="w-6" />
                          }
                        </div>
                      )}
                      <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
                        {showName && sender && (
                          <span className="ff-body text-[10px] text-white/30 px-1">{sender.first_name} {sender.last_name}</span>
                        )}
                        <div className={`px-3 py-2 rounded-2xl ff-body text-[13px] leading-relaxed break-words ${isMine ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] rounded-br-sm' : 'glass-surface text-white border border-white/[0.06] rounded-bl-sm'}`}>
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            <AnimatePresence>
              {typingLabel && (
                <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.95 }} transition={{ duration: 0.18 }} className="flex items-end gap-2 max-w-[72%] mr-auto">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0 mb-1">
                    <Users size={10} className="text-white/50" />
                  </div>
                  <div className="flex flex-col gap-0.5 items-start">
                    <span className="ff-body text-[10px] text-white/30 px-1">{typingLabel}</span>
                    <div className="glass-surface border border-white/[0.06] rounded-2xl rounded-bl-sm px-4 py-3"><TypingDots /></div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={bottomRef} className="h-1" />
          </div>
          <MessageInput onSend={handleSend} onTypingChange={broadcastTyping} disabled={sending} />
        </>
      )}

      {/* Pending: show a read-only preview placeholder below the banner */}
      {isPending && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8 bg-[var(--color-surface)]">
          <Users size={22} className="text-white/10" />
          <p className="ff-body text-white/20 text-xs">Accept the invite to see messages and participate.</p>
        </div>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <span className="flex items-center gap-[3px]">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)]/60 inline-block" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
      ))}
    </span>
  )
}