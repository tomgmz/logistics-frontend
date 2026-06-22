import { create } from 'zustand'
import type { AppNotification } from '@/lib/services/notification.service'
import { notificationService } from '@/lib/services/notification.service'

interface NotificationStore {
  items:       AppNotification[]
  unreadCount: number
  loaded:      boolean
  hydrate:     () => Promise<void>
  pushNew:     (n: AppNotification) => void
  markRead:    (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  items:       [],
  unreadCount: 0,
  loaded:      false,

  hydrate: async () => {
    const [items, unreadCount] = await Promise.all([
      notificationService.list({ limit: 30 }),
      notificationService.unreadCount(),
    ])
    set({ items, unreadCount, loaded: true })
  },

  // Called from the realtime subscription when a new notification arrives.
  pushNew: (n) => {
    const { items } = get()
    if (items.some((i) => i.notification_id === n.notification_id)) return
    set({ items: [n, ...items], unreadCount: get().unreadCount + (n.read_at ? 0 : 1) })
  },

  markRead: async (id) => {
    const target = get().items.find((i) => i.notification_id === id)
    if (!target || target.read_at) return
    set({
      items: get().items.map((i) =>
        i.notification_id === id ? { ...i, read_at: new Date().toISOString() } : i,
      ),
      unreadCount: Math.max(0, get().unreadCount - 1),
    })
    try {
      await notificationService.markRead(id)
    } catch {
      // revert on failure
      set({
        items: get().items.map((i) =>
          i.notification_id === id ? { ...i, read_at: null } : i,
        ),
        unreadCount: get().unreadCount + 1,
      })
    }
  },

  markAllRead: async () => {
    const nowIso = new Date().toISOString()
    set({
      items: get().items.map((i) => (i.read_at ? i : { ...i, read_at: nowIso })),
      unreadCount: 0,
    })
    try {
      await notificationService.markAllRead()
    } catch {
      get().hydrate()
    }
  },
}))
