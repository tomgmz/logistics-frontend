'use client'

import { useEffect } from 'react'
import { initCsrf } from '@/app/lib/api/auth.api'

export default function CsrfInit() {
  useEffect(() => {
    initCsrf().catch((err) => {
      console.error('[CsrfInit] Failed to initialize CSRF token:', err)

    })
  }, [])

  return null
}