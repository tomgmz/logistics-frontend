import { useEffect, useRef, type DependencyList, type RefObject } from 'react'

// Within this many pixels of the bottom still counts as "at the latest message".
const NEAR_END = 80

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}

/**
 * Keeps a chat on its latest message.
 *
 * `anchorRef` is the bottom sentinel inside the scrolling message list. Opening
 * a chat (`chatKey` changes) jumps straight to the newest message instead of
 * animating through the whole history, and the list stays pinned there while
 * it still grows — photos load after the text and used to push the latest
 * message out of view. Scrolling up to read older messages unpins it; a new
 * message (`deps` change) pins it again, as before.
 */
export function useStickToBottom(anchorRef: RefObject<HTMLElement | null>, chatKey: unknown, deps: DependencyList) {
  const pinned = useRef(true)

  useEffect(() => { pinned.current = true }, [chatKey])

  useEffect(() => {
    const scroller = scrollParent(anchorRef.current)
    if (!scroller) return
    const toBottom = () => { scroller.scrollTop = scroller.scrollHeight }
    pinned.current = true
    toBottom()

    const onScroll = () => {
      pinned.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_END
    }
    const follow = () => { if (pinned.current) toBottom() }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRef, chatKey, ...deps])
}
