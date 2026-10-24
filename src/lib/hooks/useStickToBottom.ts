import { useCallback, useEffect, useRef, useState, type DependencyList, type RefObject } from 'react'
import { isReadBy } from '@/app/utils/messaging.utils'

// Within this many pixels of the bottom still counts as "at the latest message".
const NEAR_END = 80
// Room left above the first unread message, so the date line over it shows.
const UNREAD_OFFSET = 56

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}

interface ChatMessageLike { id: string; sender_id: string; created_at: string; kind?: string }

interface StickOptions {
  /** False while the messages are still loading. */
  ready?:         boolean
  messages?:      ChatMessageLike[]
  currentUserId?: string
  /**
   * The reader's own last-read time as the chat opens (null: never read;
   * undefined: not known yet). Only the first known value counts, since
   * opening the chat marks it read straight away.
   */
  lastReadAt?:    string | null
}

/**
 * Where a chat's scroll sits.
 *
 *   - Opening a chat (`chatKey` changes) lands on the first message you have
 *     not read yet, or on the newest one when everything is read.
 *   - After that it follows new content (a message, a photo finishing
 *     loading, the typing bubble) only while you are already at the bottom.
 *     A reaction, or anything else that changes the list while you are
 *     reading further up, leaves the scroll where it is.
 *   - `scrollToLatest()` (call it when you send) goes to the newest message.
 *
 * `anchorRef` is the bottom sentinel inside the scrolling message list.
 */
export function useStickToBottom(
  anchorRef: RefObject<HTMLElement | null>,
  chatKey: unknown,
  deps: DependencyList,
  options: StickOptions = {},
) {
  const { ready = true, messages, currentUserId, lastReadAt } = options
  const pinned = useRef(true)
  const placed = useRef(false)
  const readAt = useRef<string | null | undefined>(undefined)
  // For the arrow-down button: shown whenever the newest message is out of view.
  const [atLatest, setAtLatest] = useState(true)

  useEffect(() => {
    pinned.current = true
    placed.current = false
    readAt.current = undefined
  }, [chatKey])

  useEffect(() => {
    if (readAt.current === undefined && lastReadAt !== undefined) readAt.current = lastReadAt
  }, [chatKey, lastReadAt])

  const toBottom = useCallback(() => {
    const scroller = scrollParent(anchorRef.current)
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [anchorRef])

  // Listeners: note whether the reader is at the bottom, and keep following
  // there while photos load and the list grows.
  useEffect(() => {
    const scroller = scrollParent(anchorRef.current)
    if (!scroller) return
    const onScroll = () => {
      pinned.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_END
      setAtLatest(pinned.current)
    }
    const follow = () => { if (pinned.current && placed.current) toBottom() }
    const resize = new ResizeObserver(follow)
    for (const child of Array.from(scroller.children)) resize.observe(child)
    // Photos get their real height on load; load doesn't bubble, so capture it.
    scroller.addEventListener('load', follow, true)
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      resize.disconnect()
      scroller.removeEventListener('load', follow, true)
      scroller.removeEventListener('scroll', onScroll)
    }
  }, [anchorRef, chatKey, ready, toBottom])

  useEffect(() => {
    const scroller = scrollParent(anchorRef.current)
    if (!scroller) return

    if (!placed.current) {
      if (!ready) return
      placed.current = true
      const firstUnread = messages?.find(m =>
        m.kind !== 'system' && m.sender_id !== currentUserId && !isReadBy(readAt.current ?? null, m.created_at))
      const el = firstUnread && readAt.current !== undefined
        ? scroller.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(firstUnread.id)}"]`)
        : null
      if (!el) { pinned.current = true; toBottom(); return }
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      scroller.scrollTop = Math.max(0, top - UNREAD_OFFSET)
      pinned.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_END
      return
    }

    if (pinned.current) toBottom()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRef, chatKey, ready, ...deps])

  /** After sending, or the arrow-down button: back to the newest message, and keep following it. */
  const scrollToLatest = useCallback(() => {
    pinned.current = true
    setAtLatest(true)
    requestAnimationFrame(toBottom)
  }, [toBottom])

  return { scrollToLatest, atLatest }
}
