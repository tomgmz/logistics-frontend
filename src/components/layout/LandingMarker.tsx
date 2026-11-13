'use client'

import { useEffect } from 'react'

/**
 * Marks <html data-landing> while the landing page is open, so global styles
 * can leave it out (the text-field font rule in globals.css). On <html>, not a
 * wrapper, because the sign-in pop-up and menus are portaled to <body>.
 */
export default function LandingMarker() {
  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('data-landing', '')
    return () => html.removeAttribute('data-landing')
  }, [])
  return null
}
