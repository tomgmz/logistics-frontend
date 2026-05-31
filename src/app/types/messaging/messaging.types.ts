// ─── Shared ───────────────────────────────────────────────────────────────────

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

export interface MessageReaction  { emoji: string; user_id: string }
export interface MessageReplyTo   { message_id: string; content: string; sender_id: string }

// ─── DM raw (mirrors backend API) ────────────────────────────────────────────

export interface ConversationWithDetails {
  conversation_id: string
  participant_a_id: string
  participant_b_id: string
  context_type: ConversationContextType
  booking_id: string | null
  created_at: string
  updated_at: string
  last_message_at: string | null
  participant_a_last_read_at: string | null
  participant_b_last_read_at: string | null
  other_user: {
    user_id: string
    first_name: string | null
    last_name: string | null
    role: UserRole
    email: string
  }
  last_message: { message_id: string; content: string; sent_at: string; sender_id: string } | null
  unread_count: number
}

export interface MessageRow {
  message_id: string
  conversation_id: string
  sender_id: string
  receiver_id: string
  content: string
  sent_at: string
  deleted_by_sender: boolean
  deleted_by_receiver: boolean
  reply_to_message_id: string | null
  reply_to: MessageReplyTo | null
  reactions: MessageReaction[]
}

export interface MessagableUser {
  user_id: string
  first_name: string | null
  last_name: string | null
  role: UserRole
  email: string
  booking_id?: string
}

// ─── DM UI ────────────────────────────────────────────────────────────────────

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
  reply_to: MessageReplyTo | null
  reactions: MessageReaction[]
}

export interface Conversation {
  id: string
  participant_a_id: string
  participant_b_id: string
  participant_a_last_read_at: string | null
  participant_b_last_read_at: string | null
  participants: MessageParticipant[]
  last_message: { message_id: string; body: string; created_at: string; sender_id: string } | null
  unread_count: number
  context_type: ConversationContextType
  booking_id: string | null
}

export function toConversation(raw: ConversationWithDetails): Conversation {
  return {
    id:                         raw.conversation_id,
    participant_a_id:           raw.participant_a_id,
    participant_b_id:           raw.participant_b_id,
    participant_a_last_read_at: raw.participant_a_last_read_at,
    participant_b_last_read_at: raw.participant_b_last_read_at,
    participants: [{
      user_id:    raw.other_user.user_id,
      first_name: raw.other_user.first_name ?? '',
      last_name:  raw.other_user.last_name  ?? '',
      role:       raw.other_user.role,
      email:      raw.other_user.email,
      is_online:  false,
    }],
    last_message: raw.last_message ? {
      message_id: raw.last_message.message_id,
      body:       raw.last_message.content,
      created_at: raw.last_message.sent_at,
      sender_id:  raw.last_message.sender_id,
    } : null,
    unread_count: raw.unread_count,
    context_type: raw.context_type,
    booking_id:   raw.booking_id,
  }
}

export function toMessage(raw: MessageRow): Message {
  return {
    id:              raw.message_id,
    conversation_id: raw.conversation_id,
    sender_id:       raw.sender_id,
    body:            raw.content,
    created_at:      raw.sent_at,
    // Guard against PostgREST returning {} instead of null for null FK joins
    reply_to:        raw.reply_to?.message_id ? raw.reply_to : null,
    reactions:       raw.reactions ?? [],
  }
}

// ─── Group raw (mirrors backend API) ─────────────────────────────────────────

export interface GroupMessageRaw {
  message_id: string
  group_id: string
  sender_id: string
  content: string
  sent_at: string
  reply_to_message_id: string | null
  reply_to: MessageReplyTo | null
  reactions: MessageReaction[]
}

export interface GroupMemberRaw {
  status: 'pending' | 'accepted' | 'declined'
  invited_by: string
  last_read_at: string | null        // Used for seen-by UI
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
  last_message: { message_id: string; content: string; sent_at: string; sender_id: string } | null
  unread_count: number
  my_status: 'pending' | 'accepted' | 'declined'
}

// ─── Group UI ─────────────────────────────────────────────────────────────────

export interface GroupMessage {
  id: string
  group_id: string
  sender_id: string
  body: string
  created_at: string
  reply_to: MessageReplyTo | null
  reactions: MessageReaction[]
}

export interface GroupMember {
  user_id: string
  first_name: string
  last_name: string
  role: UserRole
  email: string
  status: 'pending' | 'accepted' | 'declined'
  invited_by: string
  last_read_at: string | null
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

export function toGroup(raw: GroupRaw): Group {
  return {
    id:         raw.group_id,
    name:       raw.name,
    created_by: raw.created_by,
    created_at: raw.created_at,
    members: raw.members.map(m => ({
      user_id:      m.user.user_id,
      first_name:   m.user.first_name ?? '',
      last_name:    m.user.last_name  ?? '',
      role:         m.user.role,
      email:        m.user.email,
      status:       m.status,
      invited_by:   m.invited_by,
      last_read_at: m.last_read_at ?? null,
    })),
    last_message: raw.last_message ? {
      message_id: raw.last_message.message_id,
      body:       raw.last_message.content,
      created_at: raw.last_message.sent_at,
      sender_id:  raw.last_message.sender_id,
    } : null,
    unread_count: raw.unread_count ?? 0,
    my_status:    raw.my_status   ?? 'pending',
  }
}

export function toGroupMessage(raw: GroupMessageRaw): GroupMessage {
  return {
    id:         raw.message_id,
    group_id:   raw.group_id,
    sender_id:  raw.sender_id,
    body:       raw.content,
    created_at: raw.sent_at,
    reply_to:   raw.reply_to?.message_id ? raw.reply_to : null,
    reactions:  raw.reactions  ?? [],
  }
}

// ─── Unified list ─────────────────────────────────────────────────────────────

export type UnifiedListItem =
  | { kind: 'dm';    data: Conversation }
  | { kind: 'group'; data: Group }

// ─── Realtime payloads ────────────────────────────────────────────────────────

export interface ReadReceiptPayload      { conversation_id: string; reader_id: string; last_read_at: string }
export interface GroupReadReceiptPayload { group_id: string; user_id: string; read_at: string }
export interface GroupInvitePayload      { group_id: string; group_name: string }
export interface ReactionTogglePayload   { message_id: string; user_id: string; emoji: string; action: 'added' | 'removed'; group_id?: string }