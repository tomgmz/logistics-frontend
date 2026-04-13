'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMe } from '@/app/lib/api/auth.api'
import { useAuthStore } from '@/app/lib/store/auth.store'

const PUBLIC_PATHS = ['/']

export default function AuthRehydrator() {
  const setUser   = useAuthStore((s) => s.setUser)
  const clearUser = useAuthStore((s) => s.clearUser)
  const router    = useRouter()
  const pathname  = usePathname()
  const hasRun    = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    getMe()
      .then(setUser)
      .catch(() => {
        clearUser()
        const isPublic = PUBLIC_PATHS.some(
          (p) => pathname === p || pathname.startsWith(p + '/')
        )
        if (!isPublic) {
          router.replace('/')
        }
      })
  }, [setUser, clearUser, router, pathname])

  return null
}