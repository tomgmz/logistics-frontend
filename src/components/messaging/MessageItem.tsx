'use client'

import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Reply, Trash2 } from 'lucide-react'
import { formatMessageTime } from '@/app/utils/messaging.utils'
import type { MessageReaction } from '@/app/types/messaging/messaging.types'
import { useLongPress } from '@/lib/hooks/useLongPress'
import { QUICK_REACTIONS } from './EmojiPicker'
import MessagePhoto from './MessagePhoto'
import ConfirmDeleteDialog, { type DeleteScope } from './ConfirmDeleteDialog'
import { BookingMentionCards } from './BookingMention'

/*
 * One chat message, per the Figma Messages design (docs/figma/messaging,
 * 2026-11-10), the same as the driver app:
 *
 *                       You replied to [name]
 *                            ( quoted message )
 *            (            your message, teal pill )   [😀… | ↩ | 🗑]
 *                                    [time]  read
 *   ( their message, grey pill )
 *   [time]
 *
 * Pill bubbles; the time (and "read" on yours) only under the last bubble of
 * a run; a reaction chip on the bubble's lower inner corner. A direct chat
 * shows no avatar or name (hideIdentity); a group keeps them. The action bar
 * is unchanged: a mouse opens it on hover, touch with a long press. Every chat
 * surface (full page, floating bubbles, groups, the client's inbox) draws its
 * messages with this, in Darker Grotesque.
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
    <div className="ff-darker my-4 flex w-full shrink-0 items-center gap-x-3">
      <div className="h-0 flex-1 border-t border-dashed border-white/35" />
      <span className="text-[15px] font-medium text-white/45">{label}</span>
      <div className="h-0 flex-1 border-t border-dashed border-white/35" />
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
  /** A direct chat: no avatar or name beside the other person's bubbles. */
  hideIdentity?:  boolean
}

export default function MessageItem({
  messageId, isMine, currentUserId, senderName, showName = true, initials = '?', online,
  createdAt, body, attachmentUrl, stamped, seen, pending = false, replyTo,
  reactions = [], onReact, onReply, onDelete, compact = false, footer, hideIdentity = false,
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

  const textSize = compact ? 'text-[15px]' : 'text-[17px]'
  const isPhoto  = !!attachmentUrl

  // Last bubble of a run: (name ·) time, and "read" on yours.
  const meta = showName ? (
    <div className={`flex items-center gap-1.5 px-0.5 ${isMine ? 'justify-end self-end' : 'justify-start self-start'}`}>
      {!hideIdentity && !isMine && (
        <>
          <span className="min-w-0 truncate text-[13px] font-semibold text-white/70">{senderName}</span>
          <span className="text-[13px] text-white/30">·</span>
        </>
      )}
      <time className="shrink-0 text-[13px] font-medium text-white/45" dateTime={createdAt}>
        {pending ? 'sending…' : formatMessageTime(createdAt)}
      </time>
      {isMine && seen && !pending && <span className="text-[13px] font-semibold text-[var(--color-cyan)]">read</span>}
    </div>
  ) : null

  // "You replied to Ali" / "Ali replied to you" over the quoted message.
  const replyLabel = replyTo
    ? isMine
      ? `You replied to ${replyTo.name === 'You' ? 'yourself' : replyTo.name ?? 'a message'}`
      : `${(senderName ?? '').split(/\s+/)[0] || 'They'} replied to ${replyTo.name === 'You' ? 'you' : replyTo.name ?? 'a message'}`
    : null

  return (
    <>
    <motion.li
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
      data-msg-id={messageId}
      className={`ff-darker relative flex list-none items-end gap-2.5 ${isMine
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

      {!isMine && !hideIdentity && (showName
        ? <MessageAvatar initials={initials} online={online} compact={compact} />
        : <div className={`shrink-0 ${compact ? 'w-6' : 'w-8'}`} />)}

      {/* The whole message (bubble and reactions) is one hover area, and opening
          the bar moves nothing, so going from the bubble to a reaction never
          closes and reopens it. */}
      <article
        className={`flex min-w-0 flex-1 flex-col gap-1 ${isMine ? 'items-end' : 'items-start'} ${pending ? 'opacity-60' : ''}`}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
      >
        {replyTo && (
          <>
            <span className="max-w-full truncate px-1 text-[13px] font-medium text-white/45">{replyLabel}</span>
            <blockquote className="-mb-4 max-w-[min(100%,420px)] truncate rounded-[22px] border border-[#5a5a5a] bg-[#1f1f1f] px-5 pt-1.5 pb-5 text-[17px] font-medium text-white/85">
              {replyTo.content}
            </blockquote>
          </>
        )}
        <div
          className={`group/msg relative rounded-[22px] border ${textSize} font-medium leading-snug text-white [overflow-wrap:anywhere] whitespace-pre-line
            ${isMine ? 'self-end border-[var(--color-cyan)] bg-[#063a37]' : 'self-start border-[#5a5a5a] bg-[#1f1f1f]'}
            ${isPhoto ? 'p-1.5 rounded-[18px]' : compact ? 'px-4 py-1.5' : 'px-5 py-2'}
            max-w-full pointer-coarse:select-none [-webkit-touch-callout:none]`}
          {...(hasActions ? longPress(() => setOpen(true), () => setOpen(false)) : {})}
        >
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
          <ul className={`relative z-[1] -mt-3.5 flex flex-wrap gap-1 px-1 ${isMine ? 'self-start' : 'self-end'}`}>
            {grouped.map(r => (
              <li key={r.emoji}>
                <button
                  type="button" onClick={() => onReact?.(r.emoji)} disabled={!onReact}
                  className={`flex h-[22px] items-center gap-1 rounded-full border border-[var(--color-cyan)] px-2 text-[13px] font-semibold transition-colors ${r.reacted
                    ? 'bg-[#0a4d49] text-[var(--color-cyan)]'
                    : 'bg-[#063a37] text-white hover:bg-[#0a4d49]'}`}
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
