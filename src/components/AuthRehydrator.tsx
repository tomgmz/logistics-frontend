'use client'

import { useEffect, useRef } from 'react'
import { getMe } from '@/app/lib/api/auth.api'
import { useAuthStore } from '@/app/lib/store/auth.store'

export default function AuthRehydrator() {
  const setUser    = useAuthStore((s) => s.setUser)
  const hasRun     = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    getMe()
      .then(setUser)
      .catch(() => {
      })
  }, [setUser])

  return null
}