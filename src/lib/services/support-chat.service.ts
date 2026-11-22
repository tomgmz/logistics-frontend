import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import type { PagedResponse, PageRequest } from '@/lib/hooks/useServerTable'
import type { SupportTicket, TicketCategory } from '@/lib/services/support.service'

/**
 * Client support conversations (2026-11-22): the help assistant, our team and
 * email in one thread, the Intercom / Zendesk model.
 *
 *   assistant  the client is with the help assistant (staff don't see it in Waiting)
 *   waiting    handed to the team, or the client wrote again: the team owes a reply
 *   replied    the team answered; the client owes one (3 quiet days → resolved)
 *   resolved   closed; a client message within 7 days reopens it
 */

export type ChatStatus = 'assistant' | 'waiting' | 'replied' | 'resolved'
export type ChatAuthor = 'client' | 'assistant' | 'staff' | 'system'

export interface ChatMessage {
  message_id:         string
  conversation_id:    string
  author:             ChatAuthor
  author_id:          string | null
  content:            string
  attachment_url:     string | null
  attachment_stamped: boolean
  via:                'chat' | 'email'
  meta:               { ai?: boolean; faq_id?: string; event?: string } | null
  created_at:         string
}

export interface ChatConversation {
  conversation_id:     string
  conversation_number: number
  reference:           string
  client_id:           string
  client_user_id:      string
  title:               string
  status:              ChatStatus
  handed_over_at:      string | null
  last_message_at:     string
  last_staff_replier_id: string | null
  /** The staff member handling it (first to reply; "Take over" moves it). */
  assigned_to:         string | null
  assignee_name?:      string | null
  resolved_at:         string | null
  resolved_reason:     'staff' | 'auto' | null
  ticket_id:           string | null
  /** The ticket it was turned into (reference only; the conversation closed then). */
  ticket_reference?:   string | null
  created_at:          string
  /** List rows only. */
  last_message?:       { author: ChatAuthor; content: string; created_at: string } | null
  unread_count?:       number
  /** Staff rows. */
  company_name?:       string | null
  client_name?:        string | null
}

export interface ChatDetail extends ChatConversation {
  messages: ChatMessage[]
  authors:  Record<string, { name: string; role: string }>
  client_email?: string | null
}

export type InboxStatus = 'waiting' | 'mine' | 'replied' | 'resolved' | 'all'
export interface InboxCounts { waiting: number; mine: number; replied: number; resolved: number; all: number }

export const CHAT_STATUS_LABEL: Record<ChatStatus, string> = {
  assistant: 'Answered by assistant',
  waiting:   'Waiting for team',
  replied:   'Team replied',
  resolved:  'Resolved',
}

/** How many days after resolving a client message still reopens it. */
export const REOPEN_DAYS = 7

export function canStillReopen(c: Pick<ChatConversation, 'status' | 'resolved_at'>): boolean {
  if (c.status !== 'resolved' || !c.resolved_at) return true
  return Date.now() - new Date(c.resolved_at).getTime() <= REOPEN_DAYS * 86_400_000
}

export const supportChatService = {
  // ── Client ──
  async mine(): Promise<ChatConversation[]> {
    const { data } = await proxyApi.get<{ data: ChatConversation[] }>('/support/conversations')
    return data.data ?? []
  },
  async start(title: string): Promise<ChatConversation> {
    await initCsrf()
    const { data } = await proxyApi.post<{ data: ChatConversation }>('/support/conversations', { title })
    return data.data
  },
  async get(id: string): Promise<ChatDetail> {
    const { data } = await proxyApi.get<{ data: ChatDetail }>(`/support/conversations/${id}`)
    return data.data
  },
  /** The assistant part: the question and the answer the client was shown. */
  async lines(id: string, lines: { author: 'client' | 'assistant'; text: string; meta?: { ai?: boolean; faq_id?: string } | null }[]): Promise<void> {
    await initCsrf()
    await proxyApi.post(`/support/conversations/${id}/lines`, { lines })
  },
  async handOver(id: string): Promise<ChatConversation> {
    await initCsrf()
    const { data } = await proxyApi.post<{ data: ChatConversation }>(`/support/conversations/${id}/handover`)
    return data.data
  },
  async send(id: string, body: { content: string; attachment_url?: string }): Promise<ChatMessage> {
    await initCsrf()
    const { data } = await proxyApi.post<{ data: ChatMessage }>(`/support/conversations/${id}/messages`, body)
    return data.data
  },
  async read(id: string): Promise<void> {
    await initCsrf()
    await proxyApi.patch(`/support/conversations/${id}/read`)
  },

  // ── Staff ──
  async inboxPage(params: PageRequest & { status: InboxStatus; search?: string; sort?: 'asc' | 'desc' }): Promise<PagedResponse<ChatConversation, { counts: InboxCounts }>> {
    const { data } = await proxyApi.get<PagedResponse<ChatConversation, { counts: InboxCounts }>>('/support/inbox', { params })
    return { data: data.data, meta: data.meta }
  },
  async inboxGet(id: string): Promise<ChatDetail> {
    const { data } = await proxyApi.get<{ data: ChatDetail }>(`/support/inbox/${id}`)
    return data.data
  },
  /**
   * A staff reply. `last_seen_message_id` lets the server refuse it (409, code
   * 'updated') when a colleague replied after that; `force` sends anyway.
   * Refused with code 'assigned' when a colleague is handling it.
   */
  async reply(id: string, body: { content: string; attachment_url?: string; last_seen_message_id?: string | null; force?: boolean }): Promise<ChatMessage> {
    await initCsrf()
    const { data } = await proxyApi.post<{ data: ChatMessage }>(`/support/inbox/${id}/messages`, body)
    return data.data
  },
  /** Turn the conversation into a ticket; the conversation closes ("Continued as ticket …"). */
  async toTicket(id: string, input: { category: TicketCategory; subject: string; booking_id?: string | null }): Promise<SupportTicket> {
    await initCsrf()
    const { data } = await proxyApi.post<{ data: SupportTicket }>(`/support/inbox/${id}/ticket`, input)
    return data.data
  },
  async takeOver(id: string): Promise<ChatConversation> {
    await initCsrf()
    const { data } = await proxyApi.post<{ data: ChatConversation }>(`/support/inbox/${id}/take-over`)
    return data.data
  },
  async staffRead(id: string): Promise<void> {
    await initCsrf()
    await proxyApi.patch(`/support/inbox/${id}/read`)
  },
  async resolve(id: string): Promise<ChatConversation> {
    await initCsrf()
    const { data } = await proxyApi.post<{ data: ChatConversation }>(`/support/inbox/${id}/resolve`)
    return data.data
  },
}
