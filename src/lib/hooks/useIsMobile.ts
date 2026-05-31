'use client'

import { useEffect, useState } from 'react'

// Matches Tailwind's default `sm` breakpoint (640px). Below it we treat the
// viewport as "mobile" and render the messaging surfaces full-screen, mirroring
// the native mobile app instead of the floating desktop bubbles.
const MOBILE_MAX_WIDTH = 640

export function useIsMobile(maxWidth: number = MOBILE_MAX_WIDTH): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidth - 0.02}px)`)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [maxWidth])

  return isMobile
}
