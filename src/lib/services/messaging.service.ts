import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import type {
  ConversationWithDetails,
  MessageRow,
  MessagableUser,
  GroupRaw,
  GroupMessageRaw,
  MentionableBooking,
  BookingMentionDetails,
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

/** Where and when a stamped photo was taken; the server prints the rest. */
export interface PhotoStampInput {
  takenAt:    Date
  latitude?:  number
  longitude?: number
  accuracyM?: number
}

export const messagingService = {
  /**
   * Store a photo for a chat message; send the returned url as attachment_url.
   * `stamp` set: the server burns in the time-and-place stamp. Not set: plain.
   */
  uploadPhoto: async (file: Blob, stamp: PhotoStampInput | null): Promise<{ url: string; stamped: boolean }> => {
    await initCsrf()
    const form = new FormData()
    form.append('image', file, 'photo.jpg')
    if (stamp) {
      form.append('stamp', '1')
      form.append('taken_at', stamp.takenAt.toISOString())
      if (stamp.latitude != null && stamp.longitude != null) {
        form.append('latitude', String(stamp.latitude))
        form.append('longitude', String(stamp.longitude))
        if (stamp.accuracyM != null) form.append('accuracy_m', String(stamp.accuracyM))
      }
    }
    const { data } = await proxyApi.post<ApiResponse<{ url: string; stamped: boolean }>>(`${B}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  getConversations: () =>
    get<ConversationWithDetails[]>(`${B}/conversations`),

  createOrGetConversation: (payload: { target_user_id: string; booking_id?: string }) =>
    post<{ conversation_id: string }>(`${B}/conversations`, payload),

  resolveConversation: (target_user_id: string) =>
    get<{ conversation_id: string | null }>(`${B}/conversations/resolve`, { target_user_id }),

  sendDirectMessage: (payload: { target_user_id: string; content: string; attachment_url?: string; reply_to_message_id?: string; booking_id?: string }) =>
    post<MessageRow>(`${B}/conversations/direct`, payload),

  getMessages: (conversationId: string, query?: { limit?: number; before?: string }) =>
    get<MessageRow[]>(`${B}/conversations/${conversationId}/messages`, {
      limit: query?.limit,
      before: query?.before,
    }),

  sendMessage: (conversationId: string, payload: { content: string; attachment_url?: string; reply_to_message_id?: string }) =>
    post<MessageRow>(`${B}/conversations/${conversationId}/messages`, payload),

  markAsRead: (conversationId: string) =>
    patch<void>(`${B}/conversations/${conversationId}/read`),

  // 'me' deletes it for the caller; 'everyone' unsends it (sender only).
  deleteMessage: (messageId: string, scope: 'me' | 'everyone' = 'me') =>
    del<void>(`${B}/messages/${messageId}${scope === 'everyone' ? '?scope=everyone' : ''}`),

  reactToMessage: (conversationId: string, messageId: string, emoji: string) =>
    post<{ action: 'added' | 'removed' }>(`${B}/conversations/${conversationId}/messages/${messageId}/react`, { emoji }),

  getMessagableUsers: () =>
    get<MessagableUser[]>(`${B}/users`),

  /** Bookings offered after typing "@" (only those the user may see). */
  searchMentionableBookings: (q: string) =>
    get<MentionableBooking[]>(`${B}/booking-mentions`, { q }),

  /** Details cards for mentioned booking numbers; ones the user can't see are left out. */
  getBookingMentionDetails: (refs: string[]) =>
    get<BookingMentionDetails[]>(`${B}/booking-mentions/details`, { refs: refs.join(',') }),

  getGroups: () =>
    get<GroupRaw[]>(`${B}/groups`),

  createGroup: (payload: { name: string; member_ids: string[] }) =>
    post<{ group_id: string }>(`${B}/groups`, payload),

  renameGroup: (groupId: string, name: string) =>
    patch<{ name: string }>(`${B}/groups/${groupId}`, { name }),

  // The creator adds directly; anyone else's choice becomes a request for the creator.
  addGroupMembers: (groupId: string, memberIds: string[]) =>
    post<{ added: number; requested: number }>(`${B}/groups/${groupId}/members`, { member_ids: memberIds }),

  // Only the group's creator may remove someone.
  removeGroupMember: (groupId: string, userId: string) =>
    del<{ removed: boolean; requested: boolean }>(`${B}/groups/${groupId}/members/${userId}`),

  // The creator's queue of add/remove requests from other members.
  getGroupMemberRequests: (groupId: string) =>
    get<GroupMemberRequest[]>(`${B}/groups/${groupId}/requests`),

  decideGroupMemberRequest: (groupId: string, requestId: string, approve: boolean) =>
    post<void>(`${B}/groups/${groupId}/requests/${requestId}/decide`, { approve }),

  respondToGroupInvite: (groupId: string, accept: boolean) =>
    patch<void>(`${B}/groups/${groupId}/invite/respond`, { accept }),

  getGroupMessages: (groupId: string, query?: { limit?: number; before?: string }) =>
    get<GroupMessageRaw[]>(`${B}/groups/${groupId}/messages`, {
      limit: query?.limit,
      before: query?.before,
    }),

  sendGroupMessage: (groupId: string, payload: { content: string; attachment_url?: string; reply_to_message_id?: string }) =>
    post<GroupMessageRaw>(`${B}/groups/${groupId}/messages`, payload),

  markGroupRead: (groupId: string) =>
    patch<void>(`${B}/groups/${groupId}/read`),

  // Delete for me: hides a group message from the caller only.
  hideGroupMessage: (groupId: string, messageId: string, scope: 'me' | 'everyone' = 'me') =>
    del<void>(`${B}/groups/${groupId}/messages/${messageId}${scope === 'everyone' ? '?scope=everyone' : ''}`),

  reactToGroupMessage: (groupId: string, messageId: string, emoji: string) =>
    post<{ action: 'added' | 'removed' }>(`${B}/groups/${groupId}/messages/${messageId}/react`, { emoji }),
}
export interface GroupMemberRequest {
  request_id:   string
  action:       'add' | 'remove'
  requested_by: { user_id: string; name: string }
  target:       { user_id: string; name: string }
  created_at:   string
}
