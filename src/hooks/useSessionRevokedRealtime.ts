'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import proxyApi, { getMe } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
import { showAccessChangedToast } from '@/components/ui/AccessChangedToast'

/**
 * Sign this tab out the moment its session is revoked elsewhere (the same
 * account signed in on another browser or device, or was deactivated), instead
 * of on its next request or a reload.
 *
 * The backend broadcasts on `session:user:{userId}` whenever it revokes the
 * user's sessions. The event itself decides nothing: this tab just asks the
 * server whether its own session still stands. A revoked one gets a 401, the
 * refresh is refused too, and the response interceptor in auth.api signs out
 * with the usual banner. The newly signed-in session hears the same event,
 * passes the check and stays.
 *
 * The same channel carries `permissions_changed` when someone edits this
 * user's Manage Access: the tab re-reads its permissions from /auth/me so the
 * sidebar and Read Only gates update at once, then shows a notice that stays
 * until it is closed.
 */
export function useSessionRevokedRealtime(): void {
  const userId = useAuthStore((s) => s.user?.user_id)

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`session:user:${userId}`)
      .on('broadcast', { event: 'session_revoked' }, () => {
        // The interceptor does the sign-out; nothing to do with the result.
        void proxyApi.get('/notifications/unread-count').catch(() => {})
      })
      .on('broadcast', { event: 'permissions_changed' }, () => {
        void getMe()
          .then((user) => useAuthStore.getState().setUser(user))
          .catch(() => {})
        showAccessChangedToast()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])
}
