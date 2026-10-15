import { RefObject, useEffect } from 'react'

/**
 * Keeps the portal footer at the end of the page instead of always on screen.
 *
 * Portal pages scroll inside their own pane (an `overflow-y-auto` element),
 * not the document, so the footer can't simply sit after the content. This
 * finds the page-level scroller — the widest scrolling element whose bottom
 * edge meets the content area's bottom edge — and, while one exists:
 *   - pads its bottom by the footer's height, so there is room to scroll into;
 *   - lays the footer over that padding, sliding it in as the last pixels of
 *     the page scroll into view, so it is only seen at the very bottom.
 * With no page-level scroller (the page fits) the footer stays in normal flow
 * at the bottom of the content area. Both modes leave the same room for the
 * content, so switching between them can't make a page flip back and forth.
 */
export function useEndOfPageFooter(
  contentRef: RefObject<HTMLElement | null>,
  footerRef:  RefObject<HTMLElement | null>,
  resetKey:   unknown,
) {
  useEffect(() => {
    const content = contentRef.current
    const footer  = footerRef.current
    if (!content || !footer) return

    let scroller: HTMLElement | null = null
    let savedPadding = ''
    let frame = 0

    const findPageScroller = (): HTMLElement | null => {
      const box = content.getBoundingClientRect()
      let best: HTMLElement | null = null
      let bestArea = 0
      for (const el of content.querySelectorAll<HTMLElement>('*')) {
        if (el.scrollHeight - el.clientHeight <= 1) continue
        const r = el.getBoundingClientRect()
        if (Math.abs(r.bottom - box.bottom) > 2 || r.width < box.width * 0.5) continue
        const { overflowY } = getComputedStyle(el)
        if (overflowY !== 'auto' && overflowY !== 'scroll') continue
        const area = r.width * r.height
        if (area > bestArea) { best = el; bestArea = area }
      }
      return best
    }

    const release = () => {
      if (scroller) scroller.style.paddingBottom = savedPadding
      scroller = null
      footer.style.position = ''
      footer.style.transform = ''
    }

    const attach = (el: HTMLElement) => {
      const height = footer.offsetHeight
      savedPadding = el.style.paddingBottom
      const base = getComputedStyle(el).paddingBottom
      el.style.paddingBottom = `calc(${base} + ${height}px)`
      scroller = el
      footer.style.position = 'absolute'
    }

    // Slide the docked footer by however much of the page is still below the fold.
    const place = () => {
      if (!scroller) return
      const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      const offset = Math.min(footer.offsetHeight, Math.max(0, remaining))
      footer.style.transform = `translateY(${offset}px)`
    }

    const scan = () => {
      frame = 0
      if (scroller && !scroller.isConnected) release()
      const next = findPageScroller()
      if (next !== scroller) {
        release()
        if (next) attach(next)
      }
      place()
    }

    const schedule = () => { if (!frame) frame = requestAnimationFrame(scan) }
    const onScroll = (e: Event) => { if (e.target === scroller) place(); else schedule() }

    const resizes   = new ResizeObserver(schedule)
    const mutations = new MutationObserver(schedule)
    resizes.observe(content)
    mutations.observe(content, { childList: true, subtree: true })
    content.addEventListener('scroll', onScroll, true)
    scan()

    return () => {
      cancelAnimationFrame(frame)
      resizes.disconnect()
      mutations.disconnect()
      content.removeEventListener('scroll', onScroll, true)
      release()
    }
  }, [contentRef, footerRef, resetKey])
}
