'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMe } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
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
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== 'auth-user') return

      const oldUserId = e.oldValue
        ? (JSON.parse(e.oldValue)?.state?.user?.user_id ?? null)
        : null
      const newUserId = e.newValue
        ? (JSON.parse(e.newValue)?.state?.user?.user_id ?? null)
        : null

      if (oldUserId && newUserId && oldUserId !== newUserId) {
        router.replace('/')
        return
      }

      if (oldUserId && !newUserId) {
        const isPublic = PUBLIC_PATHS.some(
          (p) => pathname === p || pathname.startsWith(p + '/')
        )
        if (!isPublic) router.replace('/')
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [router, pathname])

  useEffect(() => {
    const channel = new BroadcastChannel('auth_sync')

    channel.onmessage = (event) => {
      if (event.data.type === 'LOGOUT') {
        clearUser()
        const isPublic = PUBLIC_PATHS.some(
          (p) => pathname === p || pathname.startsWith(p + '/')
        )
        if (!isPublic) router.replace('/')
      }

      // ✅ Auto-login other tabs when login happens on any tab
      if (event.data.type === 'LOGIN') {
        setUser(event.data.user)
        const destination = event.data.portalUrl as string | undefined
        if (destination) router.push(destination)
      }
    }

    return () => channel.close()
  }, [clearUser, setUser, router, pathname])

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