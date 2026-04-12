'use client'

import { useEffect, useRef } from 'react'
import { getMe } from '@/app/lib/api/auth.api'
import { useAuthStore } from '@/app/lib/store/auth.store'

export default function AuthRehydrator() {
  const setUser     = useAuthStore((s) => s.setUser)
  const clearUser   = useAuthStore((s) => s.clearUser)
  const hasRun      = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    // Always verify user with backend, don't trust localStorage alone
    getMe()
      .then(setUser)
      .catch(() => {
        // User is not authenticated, clear any stale data
        clearUser()
      })
  }, [setUser, clearUser])

  return null
}