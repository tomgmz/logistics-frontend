'use client'

import { useEffect } from 'react'
import { subscribeBroadcast } from '@/lib/realtime/sharedBroadcast'
import { useAuthStore } from '@/lib/store/auth.store'
import { useNotificationStore } from '@/lib/store/notification.store'
import type { AppNotification } from '@/lib/services/notification.service'

/**
 * Subscribes the signed-in user to their personal notification channel and keeps
 * the notification store in sync. Mount once in the authenticated shell.
 */
export function useNotificationsRealtime(): void {
  const userId = useAuthStore((s) => s.user?.user_id)
  const hydrate = useNotificationStore((s) => s.hydrate)
  const pushNew = useNotificationStore((s) => s.pushNew)

  useEffect(() => {
    if (!userId) return

    // Initial load.
    hydrate().catch(() => {})

    // Shared, ref-counted channel (sharedBroadcast) so a re-subscribe can't
    // pick up a channel that is still being torn down.
    return subscribeBroadcast(`notifications:user:${userId}`, {
      new_notification: (payload) => {
        const row = payload as AppNotification
        if (row?.notification_id) pushNew(row)
      },
    })
  }, [userId, hydrate, pushNew])
}
