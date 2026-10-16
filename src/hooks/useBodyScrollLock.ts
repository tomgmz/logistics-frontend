'use client'

import { useEffect } from 'react'

/*
 * Page scroll lock for overlays (modals, side panels, mobile menus).
 *
 * `body { overflow: hidden }` alone does not stop touch scrolling on iOS
 * Safari, so the page behind an open panel still scrolls there. Pinning the
 * body with `position: fixed` at the current offset does, and the offset is
 * restored on unlock so the page does not jump to the top.
 *
 * Locks are counted: with two overlays open, closing one must not unlock the
 * page under the other.
 */

let lockCount = 0
let saved: { scrollY: number; style: Partial<CSSStyleDeclaration> } | null = null

function lock() {
  lockCount += 1
  if (lockCount > 1) return

  const body = document.body
  const scrollY = window.scrollY
  saved = {
    scrollY,
    style: {
      position: body.style.position,
      top:      body.style.top,
      left:     body.style.left,
      right:    body.style.right,
      width:    body.style.width,
      overflow: body.style.overflow,
    },
  }
  body.style.position = 'fixed'
  body.style.top      = `-${scrollY}px`
  body.style.left     = '0'
  body.style.right    = '0'
  body.style.width    = '100%'
  body.style.overflow = 'hidden'
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount > 0 || !saved) return

  const { scrollY, style } = saved
  saved = null
  Object.assign(document.body.style, style)

  // <html> has scroll-behavior: smooth; restoring the offset must be instant,
  // not an animated scroll down from the top.
  const html = document.documentElement
  const prevBehavior = html.style.scrollBehavior
  html.style.scrollBehavior = 'auto'
  window.scrollTo(0, scrollY)
  html.style.scrollBehavior = prevBehavior
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
