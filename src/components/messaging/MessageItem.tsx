'use client'

import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Reply, Trash2 } from 'lucide-react'
import { formatMessageTime } from '@/app/utils/messaging.utils'
import type { MessageReaction } from '@/app/types/messaging/messaging.types'
import { useLongPress } from '@/lib/hooks/useLongPress'
import { QUICK_REACTIONS } from './EmojiPicker'
import ReadTicks from './ReadTicks'
import MessagePhoto from './MessagePhoto'
import ConfirmDeleteDialog, { type DeleteScope } from './ConfirmDeleteDialog'
import { BookingMentionCards } from './BookingMention'

/*
 * One chat message, after Untitled UI's message item
 * (untitledui.com/react/components/messaging), drawn in our palette:
 *
 *             ┌ bubble ──────────────── [😀… | ↩ | 🗑] ┐
 *             │ ▌ quoted reply                         │
 *             │ text / photo                           │
 *   (avatar)  └ squared bottom corner, sender's side ──┘
 *             (👍 2) (❤️)
 *             Name · 10:41 AM
 *
 * As the thread always had it: name and time under the bubble, at the bottom
 * left for others and the bottom right for you ("You", then sent / seen);
 * the name and avatar on the last message of a run. Only the actions Messages already has are on the
 * bar (react, reply, remove); a mouse opens it on hover, touch with a long
 * press. Every chat surface (full page, floating bubbles, groups, the
 * client's inbox) draws its messages with this.
 */

interface ReactionGroup { emoji: string; count: number; reacted: boolean }

function groupReactions(reactions: MessageReaction[], userId: string): ReactionGroup[] {
  const map = new Map<string, { count: number; reacted: boolean }>()
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, reacted: false }
    map.set(r.emoji, { count: cur.count + 1, reacted: cur.reacted || r.user_id === userId })
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, ...v }))
}

export function MessageAvatar({ initials, online, compact = false }: { initials: string; online?: boolean; compact?: boolean }) {
  return (
    <div className={`relative inline-flex shrink-0 rounded-full ${compact ? 'size-6' : 'size-8'}`}>
      <div className="flex size-full items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-dark)] outline-[0.5px] -outline-offset-[0.5px] outline-white/15">
        <span className={`font-card text-white/75 ${compact ? 'text-[0.45rem]' : 'text-[0.55rem]'}`}>{initials}</span>
      </div>
      {online && <span className={`absolute right-0 bottom-0 rounded-full bg-[var(--color-green)] ring-[1.5px] ring-[var(--color-surface)] ${compact ? 'size-1.5' : 'size-2'}`} />}
    </div>
  )
}

export function MessageDateDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex w-full shrink-0 items-center gap-x-2">
      <div className="h-px flex-1 bg-white/[0.08]" />
      <span className="ff-body text-sm font-medium text-white/45">{label}</span>
      <div className="h-px flex-1 bg-white/[0.08]" />
    </div>
  )
}

/** The other side is typing: their label over a three-dot bubble. */
export function TypingMessage({ name, initials, avatar, compact = false }: {
  name?: string
  initials?: string
  /** Replaces the initials avatar (a group shows a people icon). */
  avatar?: ReactNode
  compact?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }}
      className={`flex items-end gap-3 ${compact ? 'pr-6' : 'pr-8 lg:pr-10'}`}
    >
      {avatar ?? (initials ? <MessageAvatar initials={initials} compact={compact} /> : null)}
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex h-7 w-10 items-center justify-center gap-1 self-start rounded-lg rounded-bl-none bg-white/[0.06] ring-1 ring-white/[0.08] ring-inset">
          <div className="size-1 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
          <div className="size-1 animate-bounce rounded-full bg-white/35 [animation-delay:-0.15s]" />
          <div className="size-1 animate-bounce rounded-full bg-white/60" />
        </div>
        {name && <span className="ff-body truncate px-0.5 text-xs font-medium text-white/60">{name}</span>}
      </div>
    </motion.div>
  )
}

interface MessageItemProps {
  /** Lets the thread find it (opening on the first unread message). */
  messageId?:     string
  isMine:         boolean
  currentUserId:  string
  /** The sender's name (with role); your own messages say "You". */
  senderName?:    string
  /** True on the last message of a run from one sender: name (and their avatar). */
  showName?:      boolean
  initials?:      string
  online?:        boolean
  createdAt:      string
  body:           string
  attachmentUrl?: string | null
  stamped?:       boolean
  /** Omit on surfaces without read receipts. */
  seen?:          boolean
  /** Still being sent (optimistic). */
  pending?:       boolean
  replyTo?:       { name?: string; content: string } | null
  reactions?:     MessageReaction[]
  onReact?:       (emoji: string) => void
  onReply?:       () => void
  /** 'me' deletes it for you; 'everyone' unsends it (your own messages only). */
  onDelete?:      (scope: DeleteScope) => void
  /** Floating bubbles: smaller avatar and type. */
  compact?:       boolean
  /** Under the message at the far right of the thread, e.g. a group's "seen by" avatars. */
  footer?:        ReactNode
}

export default function MessageItem({
  messageId, isMine, currentUserId, senderName, showName = true, initials = '?', online,
  createdAt, body, attachmentUrl, stamped, seen, pending = false, replyTo,
  reactions = [], onReact, onReply, onDelete, compact = false, footer,
}: MessageItemProps) {
  const [open, setOpen]                         = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const hoverTimeout                            = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPress                               = useLongPress()
  const grouped                                 = groupReactions(reactions, currentUserId)
  const myReaction                              = grouped.find(r => r.reacted)?.emoji ?? null
  const canDelete                               = !!onDelete && !pending
  const hasActions                              = !!onReact || !!onReply || canDelete

  // Hover for a mouse only; touch opens the same bar with a long press.
  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !hasActions) return
    hoverTimeout.current = setTimeout(() => setOpen(true), 60)
  }
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setOpen(false)
  }

  const textSize = compact ? 'text-[13px]' : 'text-[15px]'
  const isPhoto  = !!attachmentUrl

  // Under the bubble, on the sender's side: name · time and your sent / seen.
  const meta = (
    <div className={`ff-body flex items-center gap-1 px-0.5 ${isMine ? 'justify-end self-end' : 'justify-start self-start'}`}>
      {showName && (
        <span className="min-w-0 truncate text-xs font-medium text-white/60">{isMine ? 'You' : senderName}</span>
      )}
      {showName && <span className="text-xs text-white/30">·</span>}
      <time className="shrink-0 text-xs text-white/40" dateTime={createdAt}>{formatMessageTime(createdAt)}</time>
      {isMine && seen !== undefined && <ReadTicks seen={seen && !pending} size={13} />}
    </div>
  )

  return (
    <>
    <motion.li
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
      data-msg-id={messageId}
      className={`relative flex list-none items-end gap-3 ${isMine
        ? `self-end ${compact ? 'pl-6' : 'pl-10'}`
        : `self-start ${compact ? 'pr-6' : 'pr-8 lg:pr-10'}`} max-w-full`}
    >
      {/* Rendered into a portal, so its place in the tree does not matter. */}
      {onDelete && (
        <ConfirmDeleteDialog
          open={confirmingDelete}
          canUnsend={isMine}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={(scope) => { setConfirmingDelete(false); onDelete(scope) }}
        />
      )}

      {!isMine && (showName
        ? <MessageAvatar initials={initials} online={online} compact={compact} />
        : <div className={`shrink-0 ${compact ? 'w-6' : 'w-8'}`} />)}

      {/* The whole message (bubble and reactions) is one hover area, and opening
          the bar moves nothing, so going from the bubble to a reaction never
          closes and reopens it. */}
      <article
        className={`flex min-w-0 flex-1 flex-col gap-1.5 ${pending ? 'opacity-60' : ''}`}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
      >
        <div
          className={`group/msg relative ff-body rounded-lg ring-1 ring-white/[0.08] ring-inset ${textSize} leading-relaxed text-white [overflow-wrap:anywhere] whitespace-pre-line
            ${isMine ? 'self-end rounded-br-none bg-[var(--color-bg)]' : 'self-start rounded-bl-none bg-white/[0.06]'}
            ${isPhoto && !replyTo ? 'p-1.5' : 'px-3 py-2'} ${isMine && !isPhoto ? 'pr-4' : ''}
            max-w-full pointer-coarse:select-none [-webkit-touch-callout:none]`}
          {...(hasActions ? longPress(() => setOpen(true), () => setOpen(false)) : {})}
        >
          {replyTo && (
            <blockquote className="relative mb-1.5 rounded-lg bg-[var(--color-bg)] px-3 py-2 text-sm text-white/55 ring-1 ring-white/[0.08] ring-inset before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border-l-[3px] before:border-[var(--color-cyan)]">
              {replyTo.name && <span className="block truncate text-xs font-medium text-[var(--color-cyan)]">{replyTo.name}</span>}
              <span className="line-clamp-2">{replyTo.content}</span>
            </blockquote>
          )}
          <MessagePhoto body={body} attachmentUrl={attachmentUrl} stamped={stamped} />

          {/* Action bar: floats over the bubble's top corner, so the reactions
              under the bubble stay where they are and can be clicked. */}
          <AnimatePresence>
            {open && hasActions && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}
                className={`absolute -top-5 z-10 flex items-center gap-1.5 rounded-lg bg-[#222] px-2 py-1.5 shadow-xl ring-1 ring-white/10 ${isMine ? 'right-2' : 'left-2'}`}
              >
                {onReact && QUICK_REACTIONS.map(emoji => (
                  <button
                    key={emoji} type="button" title={`React ${emoji}`} aria-label={`React ${emoji}`}
                    onClick={() => { onReact(emoji); setOpen(false) }}
                    className={`flex size-6 items-center justify-center rounded transition-transform duration-75 hover:scale-125 active:scale-90 ${myReaction === emoji ? 'bg-[var(--color-cyan)]/20' : ''}`}
                  >
                    <span className="text-[15px] leading-none select-none">{emoji}</span>
                  </button>
                ))}
                {onReact && (onReply || canDelete) && <span className="mx-0.5 h-4 w-px bg-white/15" />}
                {onReply && (
                  <button type="button" title="Reply" aria-label="Reply" onClick={() => { onReply(); setOpen(false) }}
                    className="rounded p-0.5 text-white/45 transition-colors duration-100 hover:text-white/80">
                    <Reply size={16} />
                  </button>
                )}
                {canDelete && (
                  <button type="button" title="Remove message" aria-label="Remove message" onClick={() => { setConfirmingDelete(true); setOpen(false) }}
                    className="rounded p-0.5 text-white/45 transition-colors duration-100 hover:text-[var(--color-red,#f62626)]">
                    <Trash2 size={16} />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* A mentioned booking's important details, under the message. */}
        <BookingMentionCards text={body} alignEnd={isMine} compact={compact} />

        {grouped.length > 0 && (
          <ul className={`flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {grouped.map(r => (
              <li key={r.emoji}>
                <button
                  type="button" onClick={() => onReact?.(r.emoji)} disabled={!onReact}
                  className={`ff-body flex h-6 items-center gap-1 rounded-2xl px-2 py-0.5 text-sm ring-1 ring-inset transition-colors ${r.reacted
                    ? 'bg-[var(--color-cyan)]/15 ring-[var(--color-cyan)]/35 text-[var(--color-cyan)]'
                    : 'bg-white/[0.06] ring-white/[0.08] text-white/60 hover:bg-white/10'}`}
                >
                  <span className="leading-none">{r.emoji}</span>
                  {r.count > 1 && <span className="text-xs">{r.count}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {meta}
      </article>
    </motion.li>
    {/* Group "seen by": always the far right edge, whoever sent the message. */}
    {footer && <li className="-mt-1 flex list-none justify-end self-stretch">{footer}</li>}
    </>
  )
}
