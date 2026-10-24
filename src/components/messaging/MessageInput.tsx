'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Smile, X, ImagePlus } from 'lucide-react'
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
  const iconSize = compact ? 14 : 16
  const iconBtn  = 'group inline-flex items-center justify-center rounded-md p-1.5 text-white/40 transition-colors duration-100 hover:bg-white/5 hover:text-white/75 disabled:cursor-not-allowed disabled:opacity-50'

  // Untitled UI's message composer: the field with its actions along the bottom edge.
  return (
    <div className={`relative shrink-0 border-t border-white/[0.07] bg-[var(--color-bg)] ${compact ? 'p-2' : 'px-4 py-3'}`}>
      {onJumpToLatest && <JumpToLatest show={showJumpToLatest && !mention.open} onClick={onJumpToLatest} />}
      <PhotoSendDialog file={photo} onCancel={() => setPhoto(null)} onSend={sendPhoto} />

      <div className="relative flex flex-col rounded-xl bg-white/[0.03] shadow-xs ring-1 ring-white/10 ring-inset transition-shadow duration-100 focus-within:ring-[var(--color-cyan)]/40">
        {/* Replying to: Untitled UI's quoted reply, inside the field */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className={compact ? 'px-2 pt-2' : 'px-3 pt-3'}>
                <blockquote className="relative flex items-start gap-2 rounded-lg bg-[var(--color-bg)] px-3 py-2 ring-1 ring-white/[0.08] ring-inset before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border-l-[3px] before:border-[var(--color-cyan)]">
                  <div className="min-w-0 flex-1">
                    <p className="ff-body truncate text-xs font-medium text-[var(--color-cyan)]">Replying to {replyTo.senderName}</p>
                    <p className="ff-body truncate text-sm text-white/55">{replyTo.content}</p>
                  </div>
                  <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className={iconBtn}>
                    <X size={14} />
                  </button>
                </blockquote>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <BookingMentionMenu picker={mention} />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={mention.sync}
          // Late, so a tap on the list (touch screens) still lands first.
          onBlur={() => setTimeout(mention.close, 150)}
          placeholder="Message"
          aria-label="Message"
          rows={1}
          maxLength={5000}
          // Never disabled: `disabled` only means a message is still being
          // sent, and disabling the box would drop its focus, so the user had
          // to click back into it after every message. Sending is blocked in
          // handleSend instead, and the next message can be typed meanwhile.
          className={`ff-body w-full resize-none bg-transparent text-white placeholder:text-white/30 focus:outline-none overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full ${compact ? 'px-2.5 pt-2 text-sm' : 'px-3.5 pt-3 text-[15px]'}`}
          style={{ minHeight: compact ? '32px' : '44px', maxHeight: compact ? '80px' : '120px' }}
        />

        <div className={`flex items-center gap-2 ${compact ? 'px-1.5 pb-1.5' : 'px-2.5 pb-2.5'}`}>
          {photoError
            ? (
              <p className="ff-body flex min-w-0 flex-1 items-center gap-1 text-xs text-[var(--color-red,#f62626)]">
                <span className="truncate">{photoError}</span>
                <button type="button" onClick={() => setPhotoError(null)} aria-label="Dismiss" className="shrink-0 p-0.5 text-white/40 hover:text-white/70"><X size={11} /></button>
              </p>
            )
            : <span className="flex-1" />}

          <div className="flex items-center gap-0.5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            <button type="button" onClick={() => fileRef.current?.click()} title="Send a photo (up to 10 MB)" aria-label="Send a photo" className={iconBtn}>
              <ImagePlus size={iconSize} />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmoji(v => !v)}
                title="Emoji"
                aria-label="Emoji"
                className={`${iconBtn} ${showEmoji ? 'bg-[var(--color-cyan)]/10 text-[var(--color-cyan)]' : ''}`}
              >
                <Smile size={iconSize} />
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
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={!hasText || disabled}
            aria-label="Send"
            className={`ff-body inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors duration-100 disabled:cursor-not-allowed ${compact ? 'p-2' : 'px-3.5 py-2 text-sm'} ${hasText
              ? 'bg-[var(--color-cyan)] text-[var(--color-bg)] hover:brightness-110'
              : 'bg-white/[0.05] text-white/25'}`}
          >
            <Send size={compact ? 13 : 14} />
            {!compact && 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
