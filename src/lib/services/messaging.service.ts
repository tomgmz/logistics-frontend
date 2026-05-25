import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import type {
  ConversationWithDetails,
  MessageRow,
  MessagableUser,
  GroupRaw,
  GroupMessageRaw,
} from '@/app/types/messaging/messaging.types'

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export type { ConversationWithDetails, MessageRow, MessagableUser }

export type ConversationContextType = 'direct' | 'booking_transit'

export type UserRole =
  | 'admin'
  | 'general_manager'
  | 'fleet_admin'
  | 'operations_admin'
  | 'accountant'
  | 'client'
  | 'driver'
  | 'vendor'
  | 'it_admin'

export interface ConversationParticipant {
  user_id: string
  first_name: string | null
  last_name: string | null
  role: UserRole
  email: string
}

export interface ConversationLastMessage {
  message_id: string
  content: string
  sent_at: string
  sender_id: string
}

export interface ConversationRow {
  conversation_id: string
  participant_a_id: string
  participant_b_id: string
  context_type: ConversationContextType
  booking_id: string | null
  created_at: string
  updated_at: string
  last_message_at: string | null
}

export interface CreateConversationPayload {
  target_user_id: string
  booking_id?: string
}

export interface SendMessagePayload {
  content: string
}

export interface GetMessagesQuery {
  limit?: number
  before?: string
}

async function get<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url, { params })
  return data.data
}

async function post<T>(url: string, payload: unknown): Promise<T> {
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
  getConversations: () =>
    get<ConversationWithDetails[]>(`${B}/conversations`),

  createOrGetConversation: (payload: CreateConversationPayload) =>
    post<ConversationRow>(`${B}/conversations`, payload),

  getMessages: (conversationId: string, query?: GetMessagesQuery) =>
    get<MessageRow[]>(`${B}/conversations/${conversationId}/messages`, {
      limit: query?.limit,
      before: query?.before,
    }),

  sendMessage: (conversationId: string, payload: SendMessagePayload) =>
    post<MessageRow>(`${B}/conversations/${conversationId}/messages`, payload),

  markAsRead: (conversationId: string) =>
    patch<void>(`${B}/conversations/${conversationId}/read`),

  deleteMessage: (messageId: string) =>
    del<void>(`${B}/messages/${messageId}`),

  getMessagableUsers: () =>
    get<MessagableUser[]>(`${B}/users`),

  getGroups: () =>
    get<GroupRaw[]>(`${B}/groups`),

  createGroup: (payload: { name: string; member_ids: string[] }) =>
    post<{ group_id: string }>(`${B}/groups`, payload),

  respondToGroupInvite: (groupId: string, accept: boolean) =>
    patch<void>(`${B}/groups/${groupId}/invite/respond`, { accept }),

  getGroupMessages: (groupId: string) =>
    get<GroupMessageRaw[]>(`${B}/groups/${groupId}/messages`),

  sendGroupMessage: (groupId: string, payload: { content: string }) =>
    post<GroupMessageRaw>(`${B}/groups/${groupId}/messages`, payload),

  markGroupRead: (groupId: string, messageIds: string[]) =>
    patch<void>(`${B}/groups/${groupId}/read`, { message_ids: messageIds }),
}