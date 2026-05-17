'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMe, recoverSession, signOutSession } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
import { syncServerTime } from '@/app/utils/serverTime'
import axios from 'axios'

const PUBLIC_PATHS = ['/']

const ROLE_ROUTES: Record<string, string> = {
  super_admin:      '/superadmin',
  general_manager:  '/general_manager',
  accountant:       '/accountant',
  fleet_admin:      '/fleet_admin',
  operations_admin: '/operations_admin',
  it_admin:         '/it_admin',
  client:           '/client',
  vendor:           '/vendor',
}

export default function AuthRehydrator() {
  const setUser       = useAuthStore((s) => s.setUser)
  const clearUser     = useAuthStore((s) => s.clearUser)
  const user          = useAuthStore((s) => s.user)
  const hasHydrated   = useAuthStore((s) => s.hasHydrated)
  const router        = useRouter()
  const pathname      = usePathname()
  const hasRun           = useRef(false)
  const channelRef       = useRef<BroadcastChannel | null>(null)
  const recoverTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep logged-in users off the landing page (e.g. browser back after login)
  useEffect(() => {
    if (!hasHydrated || !user || pathname !== '/') return
    const portal = ROLE_ROUTES[user.role]
    if (portal) router.replace(portal)
  }, [hasHydrated, user, pathname, router])

  // After connectivity returns, refresh CSRF + access token before the user retries an action
  useEffect(() => {
    if (!user) return

    const scheduleRecover = () => {
      if (recoverTimerRef.current) clearTimeout(recoverTimerRef.current)
      recoverTimerRef.current = setTimeout(async () => {
        const ok = await recoverSession()
        if (!ok) return
        try {
          const me = await getMe()
          setUser(me)
        } catch (err) {
          const status = axios.isAxiosError(err) ? err.response?.status : null
          if (status === 401) {
            await signOutSession()
            const isPublic = PUBLIC_PATHS.some(
              (p) => pathname === p || pathname.startsWith(p + '/')
            )
            if (!isPublic) router.replace('/')
          }
        }
      }, 400)
    }

    const onOnline = () => scheduleRecover()
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRecover()
    }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      if (recoverTimerRef.current) clearTimeout(recoverTimerRef.current)
    }
  }, [user, pathname, router, setUser])

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
    if (hasRun.current) return
    hasRun.current = true

    function openChannel(userId: string) {
      // Close any existing channel first
      channelRef.current?.close()

      const channel = new BroadcastChannel(`auth_sync_${userId}`)
      channelRef.current = channel

      channel.onmessage = (event) => {
        const { type } = event.data

        if (type === 'LOGOUT') {
          clearUser()
          channel.close()
          channelRef.current = null
          const isPublic = PUBLIC_PATHS.some(
            (p) => pathname === p || pathname.startsWith(p + '/')
          )
          if (!isPublic) router.replace('/')
          return
        }

        if (type === 'REQUEST_SESSION') {
          const user = useAuthStore.getState().user
          if (user) {
            channel.postMessage({ type: 'SESSION_SHARE', user })
          }
          return
        }

        if (type === 'SESSION_SHARE') {
          if (event.data.user && !useAuthStore.getState().user) {
            setUser(event.data.user)
          }
          return
        }
      }
    }

    async function rehydrate() {
      try {
        const persisted = localStorage.getItem('auth-user')
        const hasLocalUser = !!JSON.parse(persisted ?? '{}')?.state?.user
        if (!hasLocalUser) {
          clearUser()
          return
        }
      } catch {
        clearUser()
        return
      }

      try {
        const user = await getMe()
        setUser(user)
        openChannel(user.user_id)
        return
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : null
        if (status !== 401) return
      }

      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true })
        const user = await getMe()
        setUser(user)
        openChannel(user.user_id)
        return
      } catch {
        await signOutSession()
        const isPublic = PUBLIC_PATHS.some(
          (p) => pathname === p || pathname.startsWith(p + '/')
        )
        if (!isPublic) router.replace('/')
      }
    }

    async function init() {
      await syncServerTime()
      rehydrate()
    }

    init()

    return () => {
      channelRef.current?.close()
      channelRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}