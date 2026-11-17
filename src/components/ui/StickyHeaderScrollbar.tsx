'use client'

import { useEffect } from 'react'

/**
 * Every table's vertical scrollbar starts under its sticky header row
 * (user 2026-11-17: the header never scrolls, so the bar must not run beside
 * it).
 *
 * CSS can push the track down (`::-webkit-scrollbar-track:vertical
 * { margin-top }`), but not know how tall a header is: it
 * differs per table and per screen width. This measures each scroll box's
 * `<thead>` and writes it to `--thead-h` on the box. Mounted once in the root
 * layout, so every table (now and new ones) gets it without wiring.
 *
 * The rule is rendered here as a <style>, not put in globals.css: Next's CSS
 * compiler drops `::-webkit-scrollbar-track:vertical` (a pseudo-class after a
 * pseudo-element it doesn't know), so it never reached the browser.
 *
 * Firefox has no track margin, so there the bar still runs the full height.
 */
const TRACK_RULE =
  '*:has(> table)::-webkit-scrollbar-track:vertical{margin-top:var(--thead-h,0px)}'

export default function StickyHeaderScrollbar() {
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return

    const watched = new Map<HTMLElement, HTMLElement>() // thead → its scroll box

    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const head = entry.target as HTMLElement
        const box = watched.get(head)
        if (box) box.style.setProperty('--thead-h', `${head.offsetHeight}px`)
      }
    })

    const scan = () => {
      for (const head of document.querySelectorAll<HTMLElement>('table > thead')) {
        if (watched.has(head)) continue
        const box = head.parentElement?.parentElement
        if (!box) continue
        watched.set(head, box)
        box.style.setProperty('--thead-h', `${head.offsetHeight}px`)
        sizes.observe(head)
      }
      // Forget tables that left the page.
      for (const head of [...watched.keys()]) {
        if (!head.isConnected) {
          sizes.unobserve(head)
          watched.delete(head)
        }
      }
    }

    let frame = 0
    const queue = () => {
      if (frame) return
      frame = requestAnimationFrame(() => { frame = 0; scan() })
    }

    scan()
    const changes = new MutationObserver(queue)
    changes.observe(document.body, { childList: true, subtree: true })

    return () => {
      changes.disconnect()
      sizes.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return <style>{TRACK_RULE}</style>
}
