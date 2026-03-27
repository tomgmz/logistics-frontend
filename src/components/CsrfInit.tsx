'use client'

import { useEffect } from 'react'
import { initCsrf } from '@/app/lib/api/auth.api'

export default function CsrfInit() {
  useEffect(() => {
    initCsrf()
  }, [])

  return null
}