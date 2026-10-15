'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMe, isAccountInactive, isSessionDead, refreshSession, type AuthUser } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
import { readPersisted } from '@/lib/secure-storage'
import { syncServerTime } from '@/app/utils/serverTime'
import { ROLE_ROUTES } from '@/constants/roles'
import { goHomeSignedOut } from '@/lib/auth-redirect'
import axios from 'axios'

const PUBLIC_PATHS = ['/']

/**
 * Every setUser() hands subscribers a new object identity, re-rendering each
 * `useAuthStore((s) => s.user)` consumer. Skip the commit when getMe() returned
 * exactly what the store already holds — the 401-then-refresh retry and any
 * remount would otherwise re-render the whole tree for identical data.
 *
 * Note this cannot dedupe the first commit after a cold load: `partialize`
 * persists a subset of AuthUser, so the rehydrated value legitimately differs
 * from the full one getMe() returns.
 */
function commitUser(
  next: AuthUser,
  setUser: (user: AuthUser) => void,
): void {
  const current = useAuthStore.getState().user
  if (current && JSON.stringify(current) === JSON.stringify(next)) return
  setUser(next)
}

export default function AuthRehydrator() {
  const setUser     = useAuthStore((s) => s.setUser)
  const clearUser   = useAuthStore((s) => s.clearUser)
  const user        = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const router      = useRouter()
  const pathname    = usePathname()
  const hasRun      = useRef(false)
  const channelRef  = useRef<BroadcastChannel | null>(null)

  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!hasHydrated || !user) return
    if (!user.must_change_password) return
    if (pathname === '/change-password') return
    const portalUrl = ROLE_ROUTES[user.role] ?? '/'
    router.replace(`/change-password?redirect=${encodeURIComponent(portalUrl)}`)
  }, [hasHydrated, user, pathname, router])

  useEffect(() => {
    if (!hasHydrated || !user || pathname !== '/') return
    if (user.must_change_password) return
    const portal = ROLE_ROUTES[user.role]
    if (portal) router.replace(portal)
  }, [hasHydrated, user, pathname, router])

  useEffect(() => {
    type Persisted = { state?: { user?: { user_id?: string } | null } }
    const handleStorage = async (e: StorageEvent) => {
      if (e.key !== 'auth-user') return
      // The stored value is encrypted (lib/secure-storage).
      const [oldVal, newVal] = await Promise.all([
        readPersisted<Persisted>(e.oldValue, 'auth-user'),
        readPersisted<Persisted>(e.newValue, 'auth-user'),
      ])
      const oldUserId = oldVal?.state?.user?.user_id ?? null
      const newUserId = newVal?.state?.user?.user_id ?? null
      if (oldUserId && newUserId && oldUserId !== newUserId) {
        router.replace('/')
        return
      }
      if (oldUserId && !newUserId) {
        const isPublic = PUBLIC_PATHS.some(
          (p) => pathname === p || pathname.startsWith(p + '/')
        )
        if (!isPublic) goHomeSignedOut()
      }
    }
    const onStorage = (e: StorageEvent) => { void handleStorage(e) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
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
          const isPublic = PUBLIC_PATHS.some(
            (p) =>
              pathnameRef.current === p ||
              pathnameRef.current.startsWith(p + '/')
          )
          // Never a soft router.replace('/') here. The tab that broadcast
          // LOGOUT hears it too, and a client navigation fired next to its
          // goHomeSignedOut() could cancel that full-page one. The cookies are
          // still set at that moment, so the proxy sent '/' straight back to
          // the portal, the portal (no user) bounced to '/' again, and the tab
          // looped forever. goHomeSignedOut is latched, so this is a no-op in
          // the tab already leaving and the one safe exit in every other tab.
          if (!isPublic) goHomeSignedOut()
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
        const persisted    = await readPersisted<{ state?: { user?: unknown } }>(localStorage.getItem('auth-user'), 'auth-user')
        const hasLocalUser = !!persisted?.state?.user
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
        commitUser(user, setUser)
        openChannel(user.user_id)
        return
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : null
        if (status !== 401) return
        // Deactivated or archived while away: refreshing can't bring that
        // back, so sign out now and say why.
        const code = axios.isAxiosError(err) ? (err.response?.data as { code?: string } | undefined)?.code : undefined
        if (code === 'ACCOUNT_INACTIVE') {
          if (cancelled) return
          clearUser()
          goHomeSignedOut('inactive')
          return
        }
      }

      try {
        // Shared with the request interceptor, so tabs loading at the same
        // moment take turns instead of overwriting each other's token.
        await refreshSession()
        const user = await getMe()
        if (cancelled) return
        commitUser(user, setUser)
        openChannel(user.user_id)
        return
      } catch (err) {
        if (cancelled) return
        // A temporary failure (backend unreachable or waking up) keeps the
        // stored user; only a 401 means the session is over.
        if (!isSessionDead(err)) return
        clearUser()
        const isPublic = PUBLIC_PATHS.some(
          (p) =>
            pathnameRef.current === p ||
            pathnameRef.current.startsWith(p + '/')
        )
        if (!isPublic) goHomeSignedOut(isAccountInactive(err) ? 'inactive' : undefined)
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