import { getApiUrl } from '@/lib/api/api-url'
import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import type { PagedResponse, PageRequest } from '@/lib/hooks/useServerTable'

/**
 * Client support tickets, raised from the help assistant when the FAQ doesn't
 * answer. Resolved by email; staff mark them resolved from their dashboard.
 */

export type TicketCategory = 'booking' | 'delivery' | 'tracking' | 'documents' | 'account' | 'other'

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  booking:   'Booking',
  delivery:  'Delivery',
  tracking:  'Tracking',
  documents: 'Documents',
  account:   'Account',
  other:     'Something else',
}

export interface ChatLine {
  from: 'client' | 'bot'
  text: string
}

export interface SupportTicket {
  ticket_id:       string
  reference:       string
  category:        TicketCategory
  subject:         string
  message:         string
  status:          'open' | 'resolved'
  created_at:      string
  resolved_at:     string | null
  resolution_note: string | null
  /** The client's account (`users`) is the ticket's contact, whoever opened it. */
  clients?:        {
    company_name: string | null
    user_id?:     string | null
    users?:       { first_name: string | null; last_name: string | null; email: string | null } | null
  } | null
  /** Who opened it: the client, or a staff member who opened it for them. */
  opened_by?:      string | null
  opener?:         { first_name: string | null; last_name: string | null; email: string } | null
  bookings?:       { booking_id: string; reference_number: string | null } | null
  /** Staff reads only: the help-assistant chat that led to the ticket. */
  chat_transcript?: ChatLine[] | null
  resolver?:       { first_name: string | null; last_name: string | null } | null
  /** Email replies recorded from the reply address (staff reads only, 2026-11-18). */
  client_last_reply_at?: string | null
  staff_last_reply_at?:  string | null
  reopened_at?:          string | null
  reopen_count?:         number
  support_ticket_replies?: TicketReply[] | null
}

export interface TicketReply {
  reply_id:    string
  /** client = the client's account email; staff = the support inbox; other = any other address. */
  direction:   'client' | 'staff' | 'other'
  from_email:  string
  from_name:   string | null
  body_text:   string
  received_at: string
}

/**
 * Where an open ticket stands in the email conversation (Zendesk's New /
 * Pending / Open): null when replies aren't recorded or the ticket is resolved.
 */
export type ReplyState = 'new' | 'client_replied' | 'waiting_for_client'
export function replyStateOf(t: SupportTicket, tracking: boolean): ReplyState | null {
  if (!tracking || t.status !== 'open') return null
  const client = t.client_last_reply_at ? Date.parse(t.client_last_reply_at) : 0
  const staff  = t.staff_last_reply_at ? Date.parse(t.staff_last_reply_at) : 0
  if (client && client >= staff) return 'client_replied'
  if (staff) return 'waiting_for_client'
  return 'new'
}

export interface TicketClientOption {
  client_id:    string
  company_name: string | null
  contact_name: string | null
  email:        string | null
}

export interface TicketBookingOption {
  booking_id:       string
  reference_number: string | null
  status:           string
  schedule_date:    string | null
}

/** What POST /support/assistant answers. */
export type AssistantAnswer =
  | { status: 'answered'; answer: string; source_ids: string[] }
  | { status: 'off_topic' }
  | { status: 'not_in_knowledge' }
  | { status: 'unavailable' }

/** The office opened it for the client (the opener is not the client's account). */
export function openedByStaff(t: SupportTicket): boolean {
  return !!t.opened_by && !!t.clients?.user_id && t.opened_by !== t.clients.user_id
}

export const supportService = {
  async open(input: {
    category:    TicketCategory
    subject:     string
    message:     string
    booking_id?: string | null
    transcript?: ChatLine[]
  }): Promise<SupportTicket> {
    await initCsrf()
    const { data } = await proxyApi.post<{ data: SupportTicket }>('/support/tickets', input)
    return data.data
  },

  /**
   * The assistant's AI answer (Gemini, grounded in the FAQ), asked when the
   * keyword matcher has no confident answer. Signed-in clients only. Any
   * failure reads as 'unavailable', so the chat falls back to keyword answers.
   */
  async ask(question: string, earlier: string[]): Promise<AssistantAnswer> {
    try {
      await initCsrf()
      const { data } = await proxyApi.post<{ data: AssistantAnswer }>('/support/assistant', { question, earlier })
      return data.data ?? { status: 'unavailable' }
    } catch {
      return { status: 'unavailable' }
    }
  },

  /**
   * The same for a visitor on the landing page (not signed in): public
   * knowledge only, a Turnstile token per question, no cookies. Any failure
   * (limit, captcha, server) reads as 'unavailable'.
   */
  async askPublic(question: string, earlier: string[], captchaToken: string | undefined): Promise<AssistantAnswer> {
    try {
      const res = await fetch(`${getApiUrl()}/public/assistant`, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body:        JSON.stringify({ question, earlier, captcha_token: captchaToken }),
      })
      if (!res.ok) return { status: 'unavailable' }
      const body = await res.json().catch(() => null) as { data?: AssistantAnswer } | null
      return body?.data ?? { status: 'unavailable' }
    } catch {
      return { status: 'unavailable' }
    }
  },

  async mine(): Promise<SupportTicket[]> {
    const { data } = await proxyApi.get<{ data: SupportTicket[] }>('/support/tickets/mine')
    return data.data ?? []
  },

  /** Staff queue, with the support inbox the tickets were emailed to. */
  async list(status: 'open' | 'resolved' | 'all' = 'open'): Promise<{ tickets: SupportTicket[]; inbox: string }> {
    const { data } = await proxyApi.get<{ data: SupportTicket[]; inbox?: string }>('/support/tickets', { params: { status } })
    return { tickets: data.data ?? [], inbox: data.inbox ?? '' }
  },

  /** One page of the Tickets table; status, search and counts are server-side. */
  async listPage(params: PageRequest & { status: 'open' | 'resolved' | 'all'; search?: string; sort?: 'asc' | 'desc' }): Promise<
    PagedResponse<SupportTicket, { counts: { all: number; open: number; resolved: number } }> & { inbox: string; replyTracking: boolean; replyAddress: string | null }
  > {
    const { data } = await proxyApi.get<
      PagedResponse<SupportTicket, { counts: { all: number; open: number; resolved: number } }> & { inbox?: string; reply_tracking?: boolean; reply_address?: string | null }
    >('/support/tickets', { params })
    return { data: data.data, meta: data.meta, inbox: data.inbox ?? '', replyTracking: !!data.reply_tracking, replyAddress: data.reply_address ?? null }
  },

  /** Staff open a ticket for a client (a call, an email, a walk-in). It is emailed to the client as usual. */
  async openForClient(input: {
    client_id:   string
    category:    TicketCategory
    subject:     string
    message:     string
    booking_id?: string | null
  }): Promise<SupportTicket> {
    await initCsrf()
    const { data } = await proxyApi.post<{ data: SupportTicket }>('/support/tickets/staff', input)
    return data.data
  },

  async searchClients(search: string): Promise<TicketClientOption[]> {
    const { data } = await proxyApi.get<{ data: TicketClientOption[] }>('/support/clients', { params: { search } })
    return data.data ?? []
  },

  async clientBookings(clientId: string): Promise<TicketBookingOption[]> {
    const { data } = await proxyApi.get<{ data: TicketBookingOption[] }>(`/support/clients/${clientId}/bookings`)
    return data.data ?? []
  },

  async resolve(ticketId: string, note: string | null): Promise<SupportTicket> {
    await initCsrf()
    const { data } = await proxyApi.patch<{ data: SupportTicket }>(`/support/tickets/${ticketId}/resolve`, { note })
    return data.data
  },
}

/**
 * Ask the help assistant to open, from anywhere in the client portal. The
 * client's messages live in it too: tab 'messages', optionally on one
 * conversation.
 */
export type HelpTab = 'chat' | 'messages' | 'tickets'
export const OPEN_HELP_EVENT = 'open-help-assistant'
export function openHelpAssistant(tab: HelpTab = 'chat', conversationId?: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_HELP_EVENT, { detail: { tab, conversationId } }))
}

/**
 * The help-assistant tab a link asks for (`/client/...?chat=tickets`), or null.
 * The assistant is mounted once in the client layout and only reads `?chat=`
 * on its first render, so a link into it from inside the portal is opened with
 * openHelpAssistant() instead of a navigation that would do nothing.
 */
export function helpTabFromUrl(url: string): HelpTab | null {
  const u = new URL(url, 'http://local')
  if (!u.pathname.startsWith('/client')) return null
  const tab = u.searchParams.get('chat')
  return tab === 'chat' || tab === 'messages' || tab === 'tickets' ? tab : null
}

/** Where the client's messages open from outside the portal (e.g. /messages, a push tap). */
export function clientMessagesHref(conversationId?: string): string {
  return `/client/dashboard?chat=messages${conversationId ? `&conversation=${encodeURIComponent(conversationId)}` : ''}`
}
