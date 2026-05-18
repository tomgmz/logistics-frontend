'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMe } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
import { syncServerTime } from '@/app/utils/serverTime'
import { ROLE_ROUTES } from '@/constants/roles'
import axios from 'axios'

const PUBLIC_PATHS = ['/']

export default function AuthRehydrator() {
  const setUser     = useAuthStore((s) => s.setUser)
  const clearUser   = useAuthStore((s) => s.clearUser)
  const user        = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const router      = useRouter()
  const pathname    = usePathname()
  const hasRun      = useRef(false)
  const channelRef  = useRef<BroadcastChannel | null>(null)

  // Keep a live ref to pathname so BroadcastChannel handlers
  // always read the current value, not the stale closure value
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  // Dedicated effect: redirect to /change-password from any page when flag is set
  useEffect(() => {
    if (!hasHydrated || !user) return
    if (!user.must_change_password) return
    if (pathname === '/change-password') return
    const portalUrl = ROLE_ROUTES[user.role] ?? '/'
    router.replace(`/change-password?redirect=${encodeURIComponent(portalUrl)}`)
  }, [hasHydrated, user, pathname, router])

  // Keep logged-in users off the landing page (e.g. browser back after login)
  useEffect(() => {
    if (!hasHydrated || !user || pathname !== '/') return
    if (user.must_change_password) return
    const portal = ROLE_ROUTES[user.role]
    if (portal) router.replace(portal)
  }, [hasHydrated, user, pathname, router])

  // Cross-tab logout and user-switch detection via localStorage events.
  // Note: localStorage.removeItem('auth-user') is called only in the
  // originating tab (ReusableSidebar). Other tabs rely on this StorageEvent
  // to detect the removal and redirect to '/'. The BroadcastChannel LOGOUT
  // message handles the same for tabs on the same origin that share a channel.
  // Both mechanisms are needed because StorageEvent doesn't fire in the
  // originating tab, and BroadcastChannel doesn't persist across restarts.
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

    let cancelled = false

    function openChannel(userId: string) {
      channelRef.current?.close()
      const channel = new BroadcastChannel(`auth_sync_${userId}`)
      channelRef.current = channel

      channel.onmessage = (event) => {
        const { type } = event.data

        if (type === 'LOGOUT') {
          clearUser()
          channel.close()
          channelRef.current = null
          // Use pathnameRef so we always check the current route,
          // not the stale value captured when the channel was opened
          const isPublic = PUBLIC_PATHS.some(
            (p) =>
              pathnameRef.current === p ||
              pathnameRef.current.startsWith(p + '/')
          )
          if (!isPublic) router.replace('/')
          return
        }

        if (type === 'PASSWORD_CHANGED') {
          const currentUser = useAuthStore.getState().user
          if (currentUser) {
            useAuthStore
              .getState()
              .setUser({ ...currentUser, must_change_password: false })
          }
          const portalUrl =
            event.data.portalUrl ??
            ROLE_ROUTES[currentUser?.role ?? ''] ??
            '/'
          router.replace(portalUrl)
          return
        }

        if (type === 'REQUEST_SESSION') {
          const currentUser = useAuthStore.getState().user
          if (currentUser)
            channel.postMessage({ type: 'SESSION_SHARE', user: currentUser })
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
        const persisted    = localStorage.getItem('auth-user')
        const hasLocalUser = !!JSON.parse(persisted ?? '{}')?.state?.user
        if (!hasLocalUser) {
          if (!cancelled) clearUser()
          return
        }
      } catch {
        if (!cancelled) clearUser()
        return
      }

      try {
        const user = await getMe()
        if (cancelled) return
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
        if (cancelled) return
        setUser(user)
        openChannel(user.user_id)
        return
      } catch {
        if (cancelled) return
        clearUser()
        const isPublic = PUBLIC_PATHS.some(
          (p) =>
            pathnameRef.current === p ||
            pathnameRef.current.startsWith(p + '/')
        )
        if (!isPublic) router.replace('/')
      }
    }

    async function init() {
      await syncServerTime()
      await rehydrate()
    }

    init()

    return () => {
      cancelled = true
      channelRef.current?.close()
      channelRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}