import proxyApi from '@/lib/api/auth.api'
import { expandText } from '@/lib/roles'

export interface AppNotification {
  notification_id: string
  user_id:         string
  type:            string
  title:           string
  body:            string
  booking_id:      string | null
  data:            Record<string, unknown>
  read_at:         string | null
  created_at:      string
}

// Spell out abbreviations in text stored before the UI stopped using them.
export const normalizeNotification = (n: AppNotification): AppNotification => ({
  ...n,
  title: expandText(n.title),
  body:  expandText(n.body),
})

interface ApiResponse<T> {
  status: string
  data:   T
}

export const notificationService = {
  list: async (params?: { limit?: number; before?: string }): Promise<AppNotification[]> => {
    const { data } = await proxyApi.get<ApiResponse<AppNotification[]>>('/notifications', { params })
    return (data.data ?? []).map(normalizeNotification)
  },

  unreadCount: async (): Promise<number> => {
    const { data } = await proxyApi.get<ApiResponse<{ count: number }>>('/notifications/unread-count')
    return data.data?.count ?? 0
  },

  markRead: async (id: string): Promise<void> => {
    await proxyApi.patch(`/notifications/${id}/read`)
  },

  markAllRead: async (): Promise<void> => {
    await proxyApi.patch('/notifications/read-all')
  },
}
