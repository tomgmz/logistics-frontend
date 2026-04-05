'use client'

import { useEffect } from 'react'
import { initCsrf } from '@/app/lib/api/auth.api'

/**
 * Drop this once inside your root layout (client component).
 * initCsrf() is Promise-locked — calling it multiple times is safe,
 * including React 18 Strict Mode double-invocation in development.
 */
export default function CsrfInit() {
  useEffect(() => {
    initCsrf().catch(() => {
      // Silently ignore — the request interceptor will retry on the next
      // mutating request, and the 401 handler will redirect if needed.
    })
  }, []) // empty deps — run once on mount only

  return null
}