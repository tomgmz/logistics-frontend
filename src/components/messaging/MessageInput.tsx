'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Smile, X, Image as ImageIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import EmojiPicker from './EmojiPicker'
import PhotoSendDialog, { MAX_PHOTO_BYTES } from './PhotoSendDialog'
import { BookingMentionMenu, useBookingMentionPicker } from './BookingMention'
import JumpToLatest from './JumpToLatest'

export interface ReplyToPreview {
  messageId: string
  content: string
  senderName: string
}

interface MessageInputProps {
  /** `attachmentUrl`: a photo already uploaded; `body` is then its caption (may be empty). */
  onSend:          (body: string, replyToMessageId?: string, attachmentUrl?: string) => void
  onTypingChange?: (isTyping: boolean) => void
  disabled?:       boolean
  replyTo?:        ReplyToPreview | null
  onCancelReply?:  () => void
  /** compact=true: used inside floating bubbles — tighter padding, single-line feel */
  compact?:        boolean
  /** The newest message is out of view: show the arrow-down above the box. */
  showJumpToLatest?: boolean
  onJumpToLatest?:   () => void
}

export default function MessageInput({
  onSend,
  onTypingChange,
  disabled,
  replyTo,
  onCancelReply,
  compact = false,
  showJumpToLatest = false,
  onJumpToLatest,
}: MessageInputProps) {
  const [text, setText]           = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)
  const typingTimeout             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTyping                  = useRef(false)
  const fileRef                   = useRef<HTMLInputElement>(null)
  const [photo, setPhoto]         = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  // "@" opens the booking list; picking one writes its number in.
  const mention = useBookingMentionPicker(text, setText, textareaRef)

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setPhotoError('Only photos can be sent'); return }
    if (file.size > MAX_PHOTO_BYTES) { setPhotoError('Photos can be up to 10 MB'); return }
    setPhotoError(null)
    setPhoto(file)
  }

  const sendPhoto = (attachmentUrl: string, caption: string) => {
    setPhoto(null)
    onSend(caption, replyTo?.messageId, attachmentUrl)
  }

  const stopTyping = useCallback(() => {
    if (!isTyping.current) return
    isTyping.current = false
    onTypingChange?.(false)
  }, [onTypingChange])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    mention.sync()
    // Auto-grow
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, compact ? 80 : 120)}px`

    if (e.target.value.trim() && !isTyping.current) {
      isTyping.current = true
      onTypingChange?.(true)
    }
    if (!e.target.value.trim()) stopTyping()
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(stopTyping, 2500)
  }

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    stopTyping()
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    onSend(trimmed, replyTo?.messageId)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
    setShowEmoji(false)
  }, [text, disabled, replyTo, onSend, stopTyping])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.onKeyDown(e)) return
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
  const iconSize = compact ? 20 : 26
  const iconBtn  = 'group inline-flex shrink-0 items-center justify-center rounded-md p-1 text-white/70 transition-colors duration-100 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'

  // Figma (Web Messaging.png / Messaging.png): emoji, photo, the pill field and
  // a round send button in one row; a reply being written is quoted above it.
  return (
    <div className={`ff-darker relative shrink-0 border-t border-white/[0.12] bg-[#0a0a0a] ${compact ? 'px-2 py-2' : 'px-4 py-3.5'}`}>
      {onJumpToLatest && <JumpToLatest show={showJumpToLatest && !mention.open} onClick={onJumpToLatest} />}
      <PhotoSendDialog file={photo} onCancel={() => setPhoto(null)} onSend={sendPhoto} />

      <div className={`relative mx-auto w-full ${compact ? '' : 'max-w-[1100px]'}`}>
        {/* Replying to … */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-[#5a5a5a] border-l-[3px] border-l-[var(--color-cyan)] bg-[#1f1f1f] px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-cyan)]">Replying to {replyTo.senderName}</p>
                  <p className="truncate text-[15px] font-medium text-white/60">{replyTo.content}</p>
                </div>
                <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className={iconBtn}>
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <BookingMentionMenu picker={mention} />

        <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2.5'}`}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmoji(v => !v)}
              title="Emoji"
              aria-label="Emoji"
              className={`${iconBtn} ${showEmoji ? 'bg-[var(--color-cyan)]/10 text-[var(--color-cyan)]' : ''}`}
            >
              <Smile size={iconSize} strokeWidth={1.6} />
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
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          <button type="button" onClick={() => fileRef.current?.click()} title="Send a photo (up to 10 MB)" aria-label="Send a photo" className={iconBtn}>
            <ImageIcon size={iconSize} strokeWidth={1.6} />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={mention.sync}
            // Late, so a tap on the list (touch screens) still lands first.
            onBlur={() => setTimeout(mention.close, 150)}
            placeholder="Type your message"
            aria-label="Message"
            rows={1}
            maxLength={5000}
            // Never disabled: `disabled` only means a message is still being
            // sent, and disabling the box would drop its focus, so the user had
            // to click back into it after every message. Sending is blocked in
            // handleSend instead, and the next message can be typed meanwhile.
            className={`min-w-0 flex-1 resize-none rounded-[22px] border border-[#5a5a5a] bg-[#111212] font-medium text-white placeholder:text-white/45 focus:outline-none focus:border-[var(--color-cyan)]/60 overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full ${compact ? 'px-3 py-1.5 text-[15px]' : 'px-5 py-3 text-[17px]'}`}
            style={{ minHeight: compact ? '36px' : '50px', maxHeight: compact ? '80px' : '120px' }}
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={!hasText || disabled}
            aria-label="Send"
            className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#063a37] text-[var(--color-cyan)] transition-opacity duration-100 hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'size-9' : 'size-11'}`}
          >
            <Send size={compact ? 16 : 20} strokeWidth={1.8} />
          </button>
        </div>

        {photoError && (
          <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-[var(--color-red,#f62626)]">
            <span className="truncate">{photoError}</span>
            <button type="button" onClick={() => setPhotoError(null)} aria-label="Dismiss" className="shrink-0 p-0.5 text-white/40 hover:text-white/70"><X size={11} /></button>
          </p>
        )}
      </div>
    </div>
  )
}
