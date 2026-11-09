'use client'

import { useEffect } from 'react'
import { subscribeBroadcast } from '@/lib/realtime/sharedBroadcast'
import { useAuthStore } from '@/lib/store/auth.store'
import { pushNotification } from '@/lib/query/notifications'
import type { AppNotification } from '@/lib/services/notification.service'

/**
 * Subscribes the signed-in user to their personal notification channel; a new
 * notification goes straight into the bell's cached page and count (TanStack
 * Query, lib/query/notifications). The bell loads itself. Mount once in the
 * authenticated shell.
 */
export function useNotificationsRealtime(): void {
  const userId = useAuthStore((s) => s.user?.user_id)

  useEffect(() => {
    if (!userId) return
    // Shared, ref-counted channel (sharedBroadcast) so a re-subscribe can't
    // pick up a channel that is still being torn down.
    return subscribeBroadcast(`notifications:user:${userId}`, {
      new_notification: (payload) => {
        const row = payload as AppNotification
        if (row?.notification_id) pushNotification(row)
      },
    })
  }, [userId])
}
