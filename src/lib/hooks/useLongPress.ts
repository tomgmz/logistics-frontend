'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { TouchEvent as ReactTouchEvent, MouseEvent as ReactMouseEvent } from 'react'

/*
 * Long-press for touch screens: the phone stand-in for hovering a message to
 * get its reply / react / remove actions. Holding a finger still for `ms`
 * opens; a drag (scrolling the thread) cancels; the next touch anywhere
 * outside the pressed element closes again.
 *
 * Returns a binder so one hook can serve every row of a list:
 *   const longPress = useLongPress()
 *   <div {...longPress(() => open(id), () => close())}>
 */

const MOVE_TOLERANCE_PX = 10

export function useLongPress(ms = 450) {
  const timer        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start        = useRef<{ x: number; y: number } | null>(null)
  const fired        = useRef(false)
  const stopOutside  = useRef<(() => void) | null>(null)

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }, [])

  useEffect(() => () => {
    cancel()
    stopOutside.current?.()
  }, [cancel])

  return useCallback((onOpen: () => void, onClose: () => void) => ({
    onTouchStart: (e: ReactTouchEvent<HTMLElement>) => {
      const t  = e.touches[0]
      const el = e.currentTarget
      cancel()
      fired.current = false
      start.current = { x: t.clientX, y: t.clientY }
      timer.current = setTimeout(() => {
        timer.current = null
        fired.current = true
        onOpen()

        stopOutside.current?.()
        const onDocTouch = (ev: TouchEvent) => {
          if (el.contains(ev.target as Node)) return
          onClose()
          stopOutside.current?.()
        }
        document.addEventListener('touchstart', onDocTouch, true)
        stopOutside.current = () => {
          document.removeEventListener('touchstart', onDocTouch, true)
          stopOutside.current = null
        }
      }, ms)
    },
    onTouchMove: (e: ReactTouchEvent<HTMLElement>) => {
      const t = e.touches[0]
      if (start.current
        && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > MOVE_TOLERANCE_PX) cancel()
    },
    onTouchEnd: (e: ReactTouchEvent<HTMLElement>) => {
      cancel()
      // The press opened the menu; don't also let the lift count as a tap on
      // whatever is under the finger (e.g. the photo viewer).
      if (fired.current && e.cancelable) e.preventDefault()
    },
    onTouchCancel: cancel,
    // Android raises the context menu on a long press; the actions replace it.
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => {
      if (fired.current || timer.current) e.preventDefault()
    },
  }), [cancel, ms])
}
