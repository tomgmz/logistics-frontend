import { create } from 'zustand'
import type { AppNotification, NotificationFilter } from '@/lib/services/notification.service'
import {
  notificationService, normalizeNotification, matchesNotificationFilter,
} from '@/lib/services/notification.service'

/** Notifications per page in the bell. */
export const NOTIFICATIONS_PAGE_SIZE = 10

interface NotificationStore {
  /** The current page's notifications. */
  items:       AppNotification[]
  unreadCount: number
  loaded:      boolean
  page:        number
  total:       number
  totalPages:  number
  pageLoading: boolean
  /** The bell's filter dropdown; null shows everything. */
  filter:      NotificationFilter | null
  /** Switch the filter and go back to page 1 of it. */
  setFilter:   (filter: NotificationFilter | null) => Promise<void>
  /** Reload the current page (page 1 on first load) and the unread count. */
  hydrate:     () => Promise<void>
  goToPage:    (page: number) => Promise<void>
  pushNew:     (n: AppNotification) => void
  markRead:    (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  items:       [],
  unreadCount: 0,
  loaded:      false,
  page:        1,
  total:       0,
  totalPages:  1,
  pageLoading: false,
  filter:      null,

  setFilter: async (filter) => {
    set({ filter, page: 1, pageLoading: true })
    try {
      const res = await notificationService.page(1, NOTIFICATIONS_PAGE_SIZE, filter)
      // A quicker second switch wins: drop this answer if the filter moved on.
      if (get().filter !== filter) return
      set({ items: res.items, total: res.total, totalPages: res.totalPages })
    } finally {
      if (get().filter === filter) set({ pageLoading: false })
    }
  },

  hydrate: async () => {
    const [res, unreadCount] = await Promise.all([
      notificationService.page(get().page, NOTIFICATIONS_PAGE_SIZE, get().filter),
      notificationService.unreadCount(),
    ])
    // The page emptied (notifications went away): step back to the last one.
    if (res.items.length === 0 && get().page > 1) {
      set({ page: Math.max(1, res.totalPages) })
      return get().hydrate()
    }
    set({ items: res.items, total: res.total, totalPages: res.totalPages, unreadCount, loaded: true })
  },

  goToPage: async (page) => {
    set({ pageLoading: true })
    try {
      const res = await notificationService.page(page, NOTIFICATIONS_PAGE_SIZE, get().filter)
      set({ page, items: res.items, total: res.total, totalPages: res.totalPages })
    } finally {
      set({ pageLoading: false })
    }
  },

  // Called from the realtime subscription when a new notification arrives. It
  // joins the top of page 1; on a later page only the counts move, so the page
  // being read doesn't shift under the reader.
  pushNew: (raw) => {
    const n = normalizeNotification(raw)
    const { items, page, total, filter } = get()
    if (items.some((i) => i.notification_id === n.notification_id)) return
    // Outside the current filter: only the unread badge moves.
    if (!matchesNotificationFilter(n, filter)) {
      set({ unreadCount: get().unreadCount + (n.read_at ? 0 : 1) })
      return
    }
    const nextTotal = total + 1
    set({
      items:       page === 1 ? [n, ...items].slice(0, NOTIFICATIONS_PAGE_SIZE) : items,
      total:       nextTotal,
      totalPages:  Math.max(1, Math.ceil(nextTotal / NOTIFICATIONS_PAGE_SIZE)),
      unreadCount: get().unreadCount + (n.read_at ? 0 : 1),
    })
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
