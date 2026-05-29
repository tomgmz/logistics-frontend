import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import type {
  ConversationWithDetails,
  MessageRow,
  MessagableUser,
  GroupRaw,
  GroupMessageRaw,
} from '@/app/types/messaging/messaging.types'

interface ApiResponse<T> { success: boolean; data: T; message?: string }

export type { ConversationWithDetails, MessageRow, MessagableUser }

async function get<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url, { params })
  return data.data
}

async function post<T>(url: string, payload?: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.post<ApiResponse<T>>(url, payload)
  return data.data
}

async function patch<T>(url: string, payload?: unknown): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.patch<ApiResponse<T>>(url, payload ?? {})
  return data.data
}

async function del<T>(url: string): Promise<T> {
  await initCsrf()
  const { data } = await proxyApi.delete<ApiResponse<T>>(url)
  return data.data
}

const B = '/messaging'

export const messagingService = {
  // ── DM ─────────────────────────────────────────────────────────────────────
  getConversations: () =>
    get<ConversationWithDetails[]>(`${B}/conversations`),

  createOrGetConversation: (payload: { target_user_id: string; booking_id?: string }) =>
    post<{ conversation_id: string }>(`${B}/conversations`, payload),

  getMessages: (conversationId: string, query?: { limit?: number; before?: string }) =>
    get<MessageRow[]>(`${B}/conversations/${conversationId}/messages`, {
      limit: query?.limit,
      before: query?.before,
    }),

  sendMessage: (conversationId: string, payload: { content: string; reply_to_message_id?: string }) =>
    post<MessageRow>(`${B}/conversations/${conversationId}/messages`, payload),

  markAsRead: (conversationId: string) =>
    patch<void>(`${B}/conversations/${conversationId}/read`),

  deleteMessage: (messageId: string) =>
    del<void>(`${B}/messages/${messageId}`),

  reactToMessage: (conversationId: string, messageId: string, emoji: string) =>
    post<{ action: 'added' | 'removed' }>(`${B}/conversations/${conversationId}/messages/${messageId}/react`, { emoji }),

  getMessagableUsers: () =>
    get<MessagableUser[]>(`${B}/users`),

  // ── Groups ──────────────────────────────────────────────────────────────────
  getGroups: () =>
    get<GroupRaw[]>(`${B}/groups`),

  createGroup: (payload: { name: string; member_ids: string[] }) =>
    post<{ group_id: string }>(`${B}/groups`, payload),

  respondToGroupInvite: (groupId: string, accept: boolean) =>
    patch<void>(`${B}/groups/${groupId}/invite/respond`, { accept }),

  getGroupMessages: (groupId: string, query?: { limit?: number; before?: string }) =>
    get<GroupMessageRaw[]>(`${B}/groups/${groupId}/messages`, {
      limit: query?.limit,
      before: query?.before,
    }),

  sendGroupMessage: (groupId: string, payload: { content: string; reply_to_message_id?: string }) =>
    post<GroupMessageRaw>(`${B}/groups/${groupId}/messages`, payload),

  // message_ids defaults to [] on the backend — calling with [] updates last_read_at only
  markGroupRead: (groupId: string, messageIds: string[] = []) =>
    patch<void>(`${B}/groups/${groupId}/read`, { message_ids: messageIds }),

  reactToGroupMessage: (groupId: string, messageId: string, emoji: string) =>
    post<{ action: 'added' | 'removed' }>(`${B}/groups/${groupId}/messages/${messageId}/react`, { emoji }),
}