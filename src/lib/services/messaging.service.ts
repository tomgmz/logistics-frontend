import proxyApi, { initCsrf } from '@/lib/api/auth.api'

// ─── Response wrapper ────────────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

// ─── Types (mirror backend messaging.types.ts) ───────────────────────────────

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

export interface ConversationWithDetails extends ConversationRow {
  other_user: ConversationParticipant
  last_message: ConversationLastMessage | null
  unread_count: number
}

export interface MessageRow {
  message_id: string
  conversation_id: string
  sender_id: string
  receiver_id: string
  content: string
  is_read: boolean
  sent_at: string
  read_at: string | null
  deleted_by_sender: boolean
  deleted_by_receiver: boolean
}

export interface MessagableUser {
  user_id: string
  first_name: string | null
  last_name: string | null
  role: UserRole
  email: string
  booking_id?: string
}

// ─── Request payloads ────────────────────────────────────────────────────────

export interface CreateConversationPayload {
  target_user_id: string
  booking_id?: string
}

export interface SendMessagePayload {
  content: string
}

export interface GetMessagesQuery {
  limit?: number
  before?: string // ISO datetime string
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

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

// ─── Base path ───────────────────────────────────────────────────────────────

const B = '/messaging'

// ─── Service ─────────────────────────────────────────────────────────────────

export const messagingService = {
  /**
   * Get all conversations for the current user, ordered by last message.
   */
  getConversations: () =>
    get<ConversationWithDetails[]>(`${B}/conversations`),

  /**
   * Start a new conversation or return an existing one with target_user_id.
   * For clients, target must be a driver assigned to an in-transit booking.
   */
  createOrGetConversation: (payload: CreateConversationPayload) =>
    post<ConversationRow>(`${B}/conversations`, payload),

  /**
   * Fetch messages for a conversation with cursor-based pagination.
   * Pass `before` (ISO datetime) to load older messages.
   */
  getMessages: (conversationId: string, query?: GetMessagesQuery) =>
    get<MessageRow[]>(`${B}/conversations/${conversationId}/messages`, {
      limit: query?.limit,
      before: query?.before,
    }),

  /**
   * Send a message in a conversation.
   */
  sendMessage: (conversationId: string, payload: SendMessagePayload) =>
    post<MessageRow>(`${B}/conversations/${conversationId}/messages`, payload),

  /**
   * Mark all unread messages in a conversation as read.
   */
  markAsRead: (conversationId: string) =>
    patch<void>(`${B}/conversations/${conversationId}/read`),

  /**
   * Soft-delete a message (hides it only for the calling user).
   */
  deleteMessage: (messageId: string) =>
    del<void>(`${B}/messages/${messageId}`),

  /**
   * Get the list of users you are allowed to message.
   * - Staff/admin: all active users
   * - Client: only drivers assigned to their in-transit bookings
   */
  getMessagableUsers: () =>
    get<MessagableUser[]>(`${B}/users`),
}