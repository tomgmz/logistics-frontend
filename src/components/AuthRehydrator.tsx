'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMe } from '@/app/lib/api/auth.api'
import { useAuthStore } from '@/app/lib/store/auth.store'
import { syncServerTime } from '@/app/utils/serverTime'
import axios from 'axios'

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

    syncServerTime()

    async function rehydrate() {
      try {
        const user = await getMe()
        setUser(user)
        return
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : null
        if (status !== 401) return
      }

      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true })
        const user = await getMe()
        setUser(user)
        return
      } catch {
        clearUser()
        const isPublic = PUBLIC_PATHS.some(
          (p) => pathname === p || pathname.startsWith(p + '/')
        )
        if (!isPublic) router.replace('/')
      }
    }

    rehydrate()
  }, [setUser, clearUser, router, pathname])

  return null
}