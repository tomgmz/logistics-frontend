export interface MessageParticipant {
  user_id: string
  first_name: string
  last_name: string
  role: string
  is_online?: boolean
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  read_at?: string | null
}

export interface Conversation {
  id: string
  participants: MessageParticipant[]
  last_message?: Message
  unread_count: number
  updated_at: string
}