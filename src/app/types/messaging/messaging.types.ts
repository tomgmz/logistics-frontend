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

export interface MessageParticipant {
  user_id: string
  first_name: string
  last_name: string
  role: UserRole
  email: string
  is_online?: boolean
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  read_at: string | null
}

export interface Conversation {
  id: string
  participants: MessageParticipant[]
  last_message: {
    message_id: string
    body: string
    created_at: string
    sender_id: string
  } | null
  unread_count: number
  context_type: ConversationContextType
  booking_id: string | null
}

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
        is_online: false,
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

// ─── Group raw shapes (mirrors backend API response) ─────────────────────────

export interface GroupMessageRaw {
  message_id: string
  group_id: string
  sender_id: string
  content: string
  sent_at: string
}

export interface GroupMemberRaw {
  status: 'pending' | 'accepted' | 'declined'
  invited_by: string
  user: {
    user_id: string
    first_name: string | null
    last_name: string | null
    role: UserRole
    email: string
  }
}

export interface GroupRaw {
  group_id: string
  name: string
  created_by: string
  created_at: string
  members: GroupMemberRaw[]
  last_message: {
    message_id: string
    content: string
    sent_at: string
    sender_id: string
  } | null
  unread_count: number
  my_status: 'pending' | 'accepted' | 'declined'
}

// ─── Group UI shapes ──────────────────────────────────────────────────────────

export interface GroupMessage {
  id: string
  group_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface GroupMember {
  user_id: string
  first_name: string
  last_name: string
  role: UserRole
  email: string
  status: 'pending' | 'accepted' | 'declined'
  invited_by: string
}

export interface Group {
  id: string
  name: string
  created_by: string
  members: GroupMember[]
  last_message: { message_id: string; body: string; created_at: string; sender_id: string } | null
  unread_count: number
  my_status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

// ─── Group adapters ───────────────────────────────────────────────────────────

export function toGroup(raw: GroupRaw): Group {
  return {
    id: raw.group_id,
    name: raw.name,
    created_by: raw.created_by,
    members: raw.members.map((m: GroupMemberRaw) => ({
      user_id: m.user.user_id,
      first_name: m.user.first_name ?? '',
      last_name: m.user.last_name ?? '',
      role: m.user.role,
      email: m.user.email,
      status: m.status,
      invited_by: m.invited_by,
    })),
    last_message: raw.last_message
      ? {
          message_id: raw.last_message.message_id,
          body: raw.last_message.content,
          created_at: raw.last_message.sent_at,
          sender_id: raw.last_message.sender_id,
        }
      : null,
    unread_count: raw.unread_count ?? 0,
    my_status: raw.my_status ?? 'pending',
    created_at: raw.created_at,
  }
}

export function toGroupMessage(raw: GroupMessageRaw): GroupMessage {
  return {
    id: raw.message_id,
    group_id: raw.group_id,
    sender_id: raw.sender_id,
    body: raw.content,
    created_at: raw.sent_at,
  }
}

export type UnifiedListItem =
  | { kind: 'dm'; data: Conversation }
  | { kind: 'group'; data: Group }

export function unifiedLastMessageAt(item: UnifiedListItem): string | null {
  const msg = item.kind === 'dm' ? item.data.last_message : item.data.last_message
  return msg?.created_at ?? null
}