import proxyApi from '@/lib/api/auth.api'

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

interface ApiResponse<T> {
  status: string
  data:   T
}

export const notificationService = {
  list: async (params?: { limit?: number; before?: string }): Promise<AppNotification[]> => {
    const { data } = await proxyApi.get<ApiResponse<AppNotification[]>>('/notifications', { params })
    return data.data ?? []
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
