// ─── Backend shapes (mirrors what the API returns) ───────────────────────────

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

export interface ConversationWithDetails {
  conversation_id: string
  participant_a_id: string
  participant_b_id: string
  context_type: ConversationContextType
  booking_id: string | null
  created_at: string
  updated_at: string
  last_message_at: string | null
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

// ─── Frontend UI shapes (used by all components) ─────────────────────────────

export interface MessageParticipant {
  user_id: string
  first_name: string
  last_name: string
  role: UserRole
  email: string
  /** Populated client-side / via presence; not from REST */
  is_online?: boolean
}

export interface Message {
  /** message_id from backend */
  id: string
  conversation_id: string
  sender_id: string
  /** content from backend */
  body: string
  /** sent_at from backend */
  created_at: string
  read_at: string | null
}

export interface Conversation {
  /** conversation_id from backend */
  id: string
  /** Always a single-element array (the other participant) */
  participants: MessageParticipant[]
  last_message: {
    message_id: string
    /** content from backend */
    body: string
    /** sent_at from backend */
    created_at: string
    sender_id: string
  } | null
  unread_count: number
  context_type: ConversationContextType
  booking_id: string | null
}

// ─── Adapter helpers ─────────────────────────────────────────────────────────

export function toConversation(raw: ConversationWithDetails): Conversation {
  return {
    id: raw.conversation_id,
    participants: [
      {
        user_id: raw.other_user.user_id,
        first_name: raw.other_user.first_name ?? '',
        last_name: raw.other_user.last_name ?? '',
        role: raw.other_user.role,
        email: raw.other_user.email,
        is_online: false, // presence via WebSocket/polling, default false
      },
    ],
    last_message: raw.last_message
      ? {
          message_id: raw.last_message.message_id,
          body: raw.last_message.content,
          created_at: raw.last_message.sent_at,
          sender_id: raw.last_message.sender_id,
        }
      : null,
    unread_count: raw.unread_count,
    context_type: raw.context_type,
    booking_id: raw.booking_id,
  }
}

export function toMessage(raw: MessageRow): Message {
  return {
    id: raw.message_id,
    conversation_id: raw.conversation_id,
    sender_id: raw.sender_id,
    body: raw.content,
    created_at: raw.sent_at,
    read_at: raw.read_at,
  }
}