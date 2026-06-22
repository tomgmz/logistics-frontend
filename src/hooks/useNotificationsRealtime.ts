'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
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

    const channel = supabase
      .channel(`notifications:user:${userId}`)
      .on('broadcast', { event: 'new_notification' }, (msg) => {
        const row = msg.payload as AppNotification
        if (row?.notification_id) pushNew(row)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, hydrate, pushNew])
}
