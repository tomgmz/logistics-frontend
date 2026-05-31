'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users } from 'lucide-react'
import { useMessengerStore } from '@/lib/store/messenger.store'
import type { ChatEntry } from '@/lib/store/messenger.store'
import { useAuthStore } from '@/lib/store/auth.store'
import { useGlobalPresence } from '@/lib/hooks/useGlobalPresence'
import { messagingService } from '@/lib/services/messaging.service'
import { toConversation, toGroup, toGroupMessage, toMessage } from '@/app/types/messaging/messaging.types'
import type { Conversation, Group, GroupMessage, Message } from '@/app/types/messaging/messaging.types'
import MessengerChatBubble  from './MessengerChatBubble'
import MessengerGroupBubble from './MessengerGroupBubble'

export function MessengerBubbleContainer() {
  const { openChats } = useMessengerStore()

  return (
    <>
      <MessengerMinimizedBubbles />
      <AnimatePresence>
        {openChats.map((chat, i) => {
          const index = openChats.length - 1 - i
          return chat.kind === 'group' ? (
            <MessengerGroupBubble key={chat.id} groupId={chat.id} index={index} />
          ) : (
            <MessengerChatBubble key={chat.id} conversationId={chat.id} index={index} />
          )
        })}
      </AnimatePresence>
    </>
  )
}

const BUBBLE_SIZE   = 56
const BUBBLE_GAP    = 10
const RIGHT_OFFSET  = 16
const BOTTOM_OFFSET = 16

function MinimizedBubbleItem({ chat, stackIndex }: { chat: ChatEntry; stackIndex: number }) {
  const { closeChat, toggleMinimizeChat } = useMessengerStore()
  const { user }      = useAuthStore()
  const currentUserId = user?.user_id ?? ''
  const onlineUserIds = useGlobalPresence(currentUserId)

  const [hovered, setHovered]   = useState(false)
  const [conv, setConv]         = useState<Conversation | null>(null)
  const [group, setGroup]       = useState<Group | null>(null)
  const [preview, setPreview]   = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (chat.kind === 'dm') {
          const [rawConvs, rawMsgs] = await Promise.all([
            messagingService.getConversations(),
            messagingService.getMessages(chat.id),
          ])
          if (cancelled) return
          const found = rawConvs.find(c => c.conversation_id === chat.id)
          if (found) setConv(toConversation(found))
          const mapped = rawMsgs.map(toMessage) as Message[]
          if (mapped.length) {
            const last = mapped[mapped.length - 1]
            setPreview(last.sender_id === currentUserId ? `You: ${last.body}` : last.body)
          }
        } else {
          const [rawGroups, rawMsgs] = await Promise.all([
            messagingService.getGroups(),
            messagingService.getGroupMessages(chat.id),
          ])
          if (cancelled) return
          const found = rawGroups.find(g => g.group_id === chat.id)
          if (found) setGroup(toGroup(found))
          const mapped = rawMsgs.map(toGroupMessage) as GroupMessage[]
          if (mapped.length) {
            const last = mapped[mapped.length - 1]
            setPreview(last.sender_id === currentUserId ? `You: ${last.body}` : last.body)
          }
        }
      } catch { /* silent */ }
    }
    load()
    return () => { cancelled = true }
  }, [chat.id, chat.kind, currentUserId])

  const isGroup  = chat.kind === 'group'
  const p        = conv?.participants[0]
  const initials = p ? `${p.first_name?.[0] ?? '?'}${p.last_name?.[0] ?? '?'}`.toUpperCase() : null
  const name     = isGroup ? (group?.name ?? '…') : (p ? `${p.first_name} ${p.last_name}` : '…')
  const bottomPos= BOTTOM_OFFSET + stackIndex * (BUBBLE_SIZE + BUBBLE_GAP)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6, x: 20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.6, x: 20 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      style={{ bottom: bottomPos, right: RIGHT_OFFSET }}
      className="fixed z-40 flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, x: 8, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-[calc(100%+10px)] bg-[var(--color-bg)] border border-white/[0.09] rounded-2xl px-3 py-2 shadow-2xl min-w-[160px] max-w-[220px] pointer-events-none"
          >
            <p className="ff-body text-[11px] font-semibold text-white truncate">{name}</p>
            {preview && <p className="ff-body text-[10px] text-white/40 truncate mt-0.5">{preview}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar */}
      <button type="button" onClick={() => toggleMinimizeChat(chat.id)} className="relative focus:outline-none" aria-label={`Open chat with ${name}`}>
        <motion.div
          animate={{ scale: hovered ? 1.06 : 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{ width: BUBBLE_SIZE, height: BUBBLE_SIZE }}
          className="rounded-full bg-[var(--color-surface-dark)] border-2 border-white/10 flex items-center justify-center shadow-xl cursor-pointer overflow-hidden"
        >
          {isGroup
            ? <Users size={20} className="text-white/60" />
            : <span className="font-card text-sm text-white/80">{initials}</span>
          }
        </motion.div>

        {!isGroup && p && onlineUserIds.includes(p.user_id) && (
          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-[var(--color-green)] border-2 border-[var(--color-bg)]" />
        )}

        <AnimatePresence>
          {hovered && (
            <motion.span
              initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.12 }}
              onClick={e => { e.stopPropagation(); closeChat(chat.id) }}
              style={{ width: 18, height: 18 }}
              className="absolute -top-1 -right-1 rounded-full bg-[var(--color-bg)] border border-white/20 flex items-center justify-center cursor-pointer hover:bg-red-500/20 hover:border-red-400/40 transition-colors"
            >
              <X size={9} className="text-white/60" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </motion.div>
  )
}

function MessengerMinimizedBubbles() {
  const { minimizedChats } = useMessengerStore()
  const visible = minimizedChats.slice(-3)

  return (
    <AnimatePresence>
      {visible.map((chat, i) => (
        <MinimizedBubbleItem key={chat.id} chat={chat} stackIndex={i} />
      ))}
    </AnimatePresence>
  )
}

export default MessengerBubbleContainer