'use client'

import { useEffect } from 'react'

/*
 * iOS Safari zooms the page into any focused field whose text is under 16px
 * and leaves it zoomed after the keyboard closes. `maximum-scale=1` stops that
 * auto-zoom, and iOS still lets people pinch-zoom regardless. Android does
 * honour it as a pinch-zoom block, so it is only added on iOS
 * (`-webkit-touch-callout` is supported there and nowhere else).
 */
export default function IosViewportFix() {
  useEffect(() => {
    if (!CSS.supports('-webkit-touch-callout', 'none')) return
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!meta || meta.content.includes('maximum-scale')) return
    meta.content = `${meta.content}, maximum-scale=1`
  }, [])

  return null
}
