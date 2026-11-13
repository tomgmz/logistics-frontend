'use client'

import { useEffect } from 'react'

/**
 * Tables scroll along one axis at a time (user 2026-11-13).
 *
 * A trackpad swipe is rarely perfectly straight, so a table that scrolls both
 * ways (wide columns + many rows) moved diagonally. As in spreadsheet grids
 * (Google Sheets), each wheel/trackpad gesture is locked to the axis it
 * starts on, the stronger of the two, until the gesture pauses for 200 ms.
 * Only where a <table> can move both ways (its own box, or its box sideways
 * and the page up/down) is the wheel touched;
 * everything else scrolls as the browser does. Touch screens already lock
 * the axis natively (iOS Safari, Chrome Android), so only wheel events are
 * handled. Shift + wheel (sideways) is a single axis and passes through.
 */
const GESTURE_GAP_MS = 200
const LINE_PX = 16   // Firefox mouse wheels report lines (deltaMode 1)

/**
 * The nearest element scrolling sideways and the nearest scrolling up/down
 * from the event target (the page itself counts for up/down), when a table
 * sits in the sideways one or both are the same table box. null = not a
 * table that can move both ways, leave it to the browser.
 */
function tableScrollers(start: EventTarget | null): { x: HTMLElement; y: HTMLElement } | null {
  let x: HTMLElement | null = null
  let y: HTMLElement | null = null
  let el = start instanceof Element ? start : null
  while (el && el !== document.documentElement && !(x && y)) {
    if (el instanceof HTMLElement) {
      const cs = getComputedStyle(el)
      if (!x && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) x = el
      if (!y && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) y = el
    }
    el = el.parentElement
  }
  const page = document.scrollingElement as HTMLElement | null
  if (!y && page && page.scrollHeight > page.clientHeight + 1) y = page
  if (!x || !y || !x.querySelector('table')) return null
  return { x, y }
}

export default function WheelAxisLock() {
  useEffect(() => {
    let axis: 'x' | 'y' | null = null
    let lockedEl: HTMLElement | null = null
    let lastAt = 0

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return                       // pinch-zoom / browser zoom
      const dx = e.deltaX, dy = e.deltaY
      if (dx === 0 && dy === 0) return
      const sc = tableScrollers(e.target)
      if (!sc) return
      const now = performance.now()
      // A new gesture (other table, or a pause) picks its axis from its first event.
      if (sc.x !== lockedEl || now - lastAt > GESTURE_GAP_MS) {
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        lockedEl = sc.x
      }
      lastAt = now
      const onAxis  = axis === 'x' ? dx : dy
      const offAxis = axis === 'x' ? dy : dx
      if (offAxis === 0) return                   // straight along the locked axis: native scroll
      e.preventDefault()                          // drop the other axis for the rest of the gesture
      if (onAxis === 0) return
      if (axis === 'x') sc.x.scrollLeft += dx * (e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? sc.x.clientWidth : 1)
      else sc.y.scrollTop += dy * (e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? sc.y.clientHeight : 1)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])
  return null
}
