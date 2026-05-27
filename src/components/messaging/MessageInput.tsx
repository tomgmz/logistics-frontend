'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Smile, X, CornerUpLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import EmojiPicker from './EmojiPicker'

interface ReplyTo {
  messageId: string
  content: string
  senderName: string
}

interface MessageInputProps {
  onSend: (body: string, replyToMessageId?: string) => void
  onTypingChange?: (isTyping: boolean) => void
  disabled?: boolean
  replyTo?: ReplyTo | null
  onCancelReply?: () => void
  compact?: boolean
}

export default function MessageInput({
  onSend,
  onTypingChange,
  disabled,
  replyTo,
  onCancelReply,
}: MessageInputProps) {
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  const stopTyping = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false
      onTypingChange?.(false)
    }
  }, [onTypingChange])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
    if (!isTypingRef.current && e.target.value.trim()) {
      isTypingRef.current = true
      onTypingChange?.(true)
    }
    if (!e.target.value.trim()) stopTyping()
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(stopTyping, 2500)
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    stopTyping()
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    onSend(trimmed, replyTo?.messageId)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleEmojiSelect = (emoji: string) => {
    setText(prev => prev + emoji)
    textareaRef.current?.focus()
  }

  const hasText = text.trim().length > 0

  return (
    <div className="shrink-0 border-t border-white/[0.07] bg-[var(--color-bg)]">
      {/* Reply banner */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.05] bg-white/[0.02]">
              <CornerUpLeft size={12} className="text-[var(--color-cyan)]/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="ff-body text-[10px] text-[var(--color-cyan)]/70 truncate">{replyTo.senderName}</p>
                <p className="ff-body text-[11px] text-white/40 truncate">{replyTo.content}</p>
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                className="p-1 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 py-3 flex items-end gap-2">
        {/* Emoji button */}
        <div className="relative shrink-0 mb-1">
          <button
            type="button"
            onClick={() => setShowEmoji(v => !v)}
            className={`p-2 rounded-lg transition-colors ${showEmoji ? 'bg-[var(--color-cyan)]/10 text-[var(--color-cyan)]' : 'hover:bg-white/5 text-white/30 hover:text-white/60'}`}
          >
            <Smile size={16} />
          </button>
          <AnimatePresence>
            {showEmoji && (
              <EmojiPicker
                onSelect={handleEmojiSelect}
                onClose={() => setShowEmoji(false)}
                position="top"
              />
            )}
          </AnimatePresence>
        </div>

        {/* Textarea */}
        <div className="flex-1 relative glass rounded-xl border border-white/[0.08] focus-within:border-[var(--color-cyan)]/30 transition-colors overflow-hidden">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent px-3.5 py-[13px] ff-body text-sm text-white placeholder:text-white/25 resize-none focus:outline-none overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
        </div>

        {/* Send */}
        <motion.button
          type="button"
          whileHover={hasText ? { scale: 1.08 } : {}}
          whileTap={hasText ? { scale: 0.94 } : {}}
          onClick={handleSend}
          disabled={!hasText || disabled}
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all mb-1 ${hasText ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] glow-cyan' : 'bg-white/[0.05] text-white/20 cursor-not-allowed'}`}
        >
          <Send size={14} />
        </motion.button>
      </div>
    </div>
  )
}