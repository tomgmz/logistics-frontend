'use client'

import { useState, useRef } from 'react'
import { Send, Paperclip, Smile } from 'lucide-react'
import { motion } from 'framer-motion'

interface MessageInputProps {
  onSend: (body: string) => void
  disabled?: boolean
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
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

  const hasText = text.trim().length > 0

  return (
    <div className="shrink-0 px-4 py-3 border-t border-white/[0.07] bg-[var(--color-bg)]">
      <div className="flex items-end gap-2">
        <button
          type="button"
          className="shrink-0 p-2 rounded-lg hover:bg-white/5 text-white/25 hover:text-white/50 transition-colors mb-1"
        >
          <Paperclip size={16} />
        </button>

        <div className="flex-1 relative glass rounded-xl border border-white/[0.08] focus-within:border-[var(--color-cyan)]/30 transition-colors overflow-hidden">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            disabled={disabled}
            className="
              w-full bg-transparent px-3.5 py-3 pr-10
              ff-body text-sm text-white placeholder:text-white/25
              resize-none focus:outline-none
              overflow-y-auto
              [&::-webkit-scrollbar]:w-[3px]
              [&::-webkit-scrollbar-thumb]:bg-white/10
              [&::-webkit-scrollbar-thumb]:rounded-full
            "
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          <button
            type="button"
            className="absolute right-2.5 bottom-2.5 p-1.5 rounded-lg hover:bg-white/5 text-white/20 hover:text-white/40 transition-colors"
          >
            <Smile size={14} />
          </button>
        </div>

        <motion.button
          type="button"
          whileHover={hasText ? { scale: 1.08 } : {}}
          whileTap={hasText ? { scale: 0.94 } : {}}
          onClick={handleSend}
          disabled={!hasText || disabled}
          className={`
            shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all mb-1
            ${hasText
              ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] glow-cyan'
              : 'bg-white/[0.05] text-white/20 cursor-not-allowed'
            }
          `}
        >
          <Send size={14} />
        </motion.button>
      </div>
    </div>
  )
}