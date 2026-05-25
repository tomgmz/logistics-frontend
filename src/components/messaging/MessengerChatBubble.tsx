'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Minus, ChevronDown, Send, Check, CheckCheck } from 'lucide-react'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { MOCK_CONVERSATIONS, MOCK_MESSAGES } from '@/lib/data/messaging.mock'
import { groupMessagesByDate, formatMessageTime } from '@/app/utils/messaging.utils'
import type { Message } from '@/app/types/messaging/messaging.types'

const BUBBLE_WIDTH = 300
const BUBBLE_GAP = 10

interface MessengerChatBubbleProps {
  conversationId: string
  index: number
}

export default function MessengerChatBubble({ conversationId, index }: MessengerChatBubbleProps) {
  const { closeChat, minimizedChatIds, toggleMinimizeChat } = useMessengerStore()
  const isMinimized = minimizedChatIds.includes(conversationId)

  const conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId)
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES[conversationId] ?? [])
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isMinimized) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages, isMinimized])

  if (!conv) return null

  const participant = conv.participants[0]
  const initials = `${participant.first_name[0]}${participant.last_name[0]}`.toUpperCase()
  const rightOffset = 16 + index * (BUBBLE_WIDTH + BUBBLE_GAP)
  const groups = groupMessagesByDate(messages)

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setMessages(prev => [...prev, {
      id: `local-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: 'current',
      body: trimmed,
      created_at: new Date().toISOString(),
      read_at: null,
    }])
    setText('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend() }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      style={{ right: rightOffset, width: BUBBLE_WIDTH }}
      className="fixed bottom-0 z-50 flex flex-col rounded-t-2xl overflow-hidden border border-b-0 border-white/[0.09] shadow-2xl"
    >
      <button
        type="button"
        onClick={() => toggleMinimizeChat(conversationId)}
        className="
          w-full flex items-center gap-2.5 px-3 py-2.5
          bg-[var(--color-bg)] border-b border-white/[0.06]
          hover:bg-white/[0.03] transition-colors cursor-pointer
        "
      >
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center">
            <span className="font-card text-[0.56rem] text-white/75">{initials}</span>
          </div>
          {participant.is_online && (
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[var(--color-green)] border-[1.5px] border-[var(--color-bg)]" />
          )}
        </div>

        <div className="flex-1 min-w-0 text-left">
          <p className="ff-body text-xs text-white truncate">
            {participant.first_name} {participant.last_name}
          </p>
          {participant.is_online && (
            <p className="ff-body text-[9px] text-[var(--color-green)]">Active now</p>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          <span
            role="button"
            onClick={() => toggleMinimizeChat(conversationId)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
          >
            {isMinimized ? <ChevronDown size={12} /> : <Minus size={12} />}
          </span>
          <span
            role="button"
            onClick={() => closeChat(conversationId)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-red-400 transition-colors"
          >
            <X size={12} />
          </span>
        </div>
      </button>

      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            key="bubble-body"
            initial={{ height: 0 }}
            animate={{ height: 320 }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col overflow-hidden bg-[var(--color-surface)]"
          >
            <div className="
              overflow-y-auto px-3 py-3 space-y-2
              [&::-webkit-scrollbar]:w-[3px]
              [&::-webkit-scrollbar-thumb]:bg-white/10
              [&::-webkit-scrollbar-thumb]:rounded-full
            " style={{ height: 270 }}>
              {groups.map(({ date, messages: groupMsgs }) => (
                <div key={date} className="space-y-2">
                  <p className="ff-body text-[9px] text-white/18 text-center uppercase tracking-widest">{date}</p>
                  {groupMsgs.map(msg => {
                    const isMine = msg.sender_id === 'current'
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex flex-col gap-0.5 max-w-[85%]`}>
                          <div className={`
                            px-3 py-1.5 rounded-2xl ff-body text-[11.5px] leading-relaxed break-words
                            ${isMine
                              ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] rounded-br-sm'
                              : 'glass-surface text-white border border-white/[0.06] rounded-bl-sm'
                            }
                          `}>
                            {msg.body}
                          </div>
                          <div className={`flex items-center gap-1 ${isMine ? 'justify-end' : ''}`}>
                            <span className="ff-body text-[9px] text-white/18">
                              {formatMessageTime(msg.created_at)}
                            </span>
                            {isMine && (
                              msg.read_at
                                ? <CheckCheck size={9} className="text-[var(--color-cyan)]" />
                                : <Check size={9} className="text-white/18" />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="shrink-0 px-2.5 py-2 border-t border-white/[0.06] bg-[var(--color-bg)] flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Aa"
                className="
                  flex-1 bg-white/[0.05] border border-white/[0.07] rounded-full
                  px-3 py-1.5 ff-body text-xs text-white placeholder:text-white/20
                  focus:outline-none focus:border-[var(--color-cyan)]/30
                  transition-colors
                "
              />
              <motion.button
                type="button"
                whileHover={text.trim() ? { scale: 1.1 } : {}}
                whileTap={text.trim() ? { scale: 0.92 } : {}}
                onClick={handleSend}
                className={`
                  shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all
                  ${text.trim()
                    ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] glow-cyan'
                    : 'bg-white/[0.05] text-white/18 cursor-not-allowed'
                  }
                `}
              >
                <Send size={11} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}