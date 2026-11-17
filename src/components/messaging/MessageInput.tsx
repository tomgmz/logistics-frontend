'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useMessageDraft } from '@/lib/messaging/messageDraft'
import { preloadEmojiData } from './EmojiPicker'
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
  /** Names the chat ('dm:<id>', 'group:<id>') so unsent text is kept per chat. */
  draftKey?:         string
}

/** The box grows up to this many lines, then scrolls inside. */
const MAX_LINES = 5

export default function MessageInput({
  onSend,
  onTypingChange,
  disabled,
  replyTo,
  onCancelReply,
  compact = false,
  showJumpToLatest = false,
  onJumpToLatest,
  draftKey,
}: MessageInputProps) {
  // Unsent text comes back when the chat is reopened (and after a reload).
  const [text, setText]           = useMessageDraft(draftKey)
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)
  const typingTimeout             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTyping                  = useRef(false)
  const fileRef                   = useRef<HTMLInputElement>(null)
  const [photo, setPhoto]         = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  // "@" opens the booking list; picking one writes its number in.
  const mention = useBookingMentionPicker(text, setText, textareaRef)

  // Fetch the emoji list in the background once a chat is open, so the first
  // click on the emoji button doesn't wait for it.
  useEffect(() => { preloadEmojiData() }, [])

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

  // Auto-grow up to 5 lines, whatever set the text (typing, an emoji, a
  // restored draft); past that the box scrolls inside. The scrollbar is only
  // turned on when the text really is taller than 5 lines, so an empty or
  // short message never shows one.
  const lineHeight = compact ? 20 : 24
  const maxHeight  = lineHeight * MAX_LINES
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const full = el.scrollHeight
    el.style.height = `${Math.min(full, maxHeight)}px`
    el.style.overflowY = full > maxHeight + 1 ? 'auto' : 'hidden'
  }, [text, maxHeight])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    mention.sync()

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
    textareaRef.current?.focus()
    setShowEmoji(false)
  }, [text, disabled, replyTo, onSend, stopTyping, setText])

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
  // Same height as a one-line pill, so the side buttons line up with it.
  const slotH    = compact ? 'h-9' : 'h-[50px]'
  const iconBtn  = 'group inline-flex shrink-0 items-center justify-center rounded-md p-1 text-white/70 transition-colors duration-100 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'

  // Photo, the pill field (emoji inside, Messenger-style) and a round send
  // button in one row; a reply being written is quoted above it.
  return (
    <div className={`ff-darker relative shrink-0 border-t border-white/[0.12] bg-[#0a0a0a] ${compact ? 'px-2 py-2' : 'px-4 py-3.5'}`}>
      {onJumpToLatest && <JumpToLatest show={showJumpToLatest && !mention.open} onClick={onJumpToLatest} />}
      <PhotoSendDialog file={photo} onCancel={() => setPhoto(null)} onSend={sendPhoto} />

      <div className="relative w-full">
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

        {/* Messenger-style: the photo button left, the pill (text + emoji at
            its right end) and send. As the text grows the buttons stay on the
            bottom line, and the emoji button sits beside the last line. */}
        <div className={`flex items-end ${compact ? 'gap-1' : 'gap-2.5'}`}>
          <div className={`flex shrink-0 items-center ${slotH}`}>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            <button type="button" onClick={() => fileRef.current?.click()} title="Send a photo (up to 10 MB)" aria-label="Send a photo" className={iconBtn}>
              <ImageIcon size={iconSize} strokeWidth={1.6} />
            </button>
          </div>

          {/* The pill is this wrapper, so the scrollbar sits inside it, clear
              of the rounded ends; a click on its padding focuses the box. */}
          <div
            onClick={e => { if (e.target === e.currentTarget) textareaRef.current?.focus() }}
            className={`flex min-w-0 flex-1 cursor-text items-end gap-1 rounded-[22px] border border-[#5a5a5a] bg-[#111212] focus-within:border-[var(--color-cyan)]/60 ${compact ? 'py-[7px] pl-3 pr-2' : 'py-3 pl-5 pr-3'}`}
          >
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
            className={`chat-input-scroll block min-w-0 flex-1 resize-none overflow-y-hidden border-0 bg-transparent p-0 font-medium text-white placeholder:text-white/45 focus:outline-none focus-visible:outline-none ${compact ? 'pr-1.5 text-[15px] leading-[20px]' : 'pr-2.5 text-[17px] leading-[24px]'}`}
            style={{ height: lineHeight, maxHeight }}
          />
            <div className="relative shrink-0" style={{ height: lineHeight }}>
              <button
                type="button"
                onClick={() => setShowEmoji(v => !v)}
                title="Emoji"
                aria-label="Emoji"
                className={`inline-flex h-full items-center justify-center rounded-full px-0.5 transition-colors duration-100 hover:text-white ${showEmoji ? 'text-[var(--color-cyan)]' : 'text-white/70'}`}
              >
                <Smile size={compact ? 18 : 22} strokeWidth={1.8} />
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

          <div className={`flex shrink-0 items-center ${slotH}`}>
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
