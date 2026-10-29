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
  clients?:        { company_name: string | null } | null
  opener?:         { first_name: string | null; last_name: string | null; email: string } | null
  bookings?:       { booking_id: string; reference_number: string | null } | null
  /** Staff reads only: the help-assistant chat that led to the ticket. */
  chat_transcript?: ChatLine[] | null
  resolver?:       { first_name: string | null; last_name: string | null } | null
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
  async listPage(params: PageRequest & { status: 'open' | 'resolved' | 'all'; search?: string }): Promise<
    PagedResponse<SupportTicket, { counts: { all: number; open: number; resolved: number } }> & { inbox: string }
  > {
    const { data } = await proxyApi.get<
      PagedResponse<SupportTicket, { counts: { all: number; open: number; resolved: number } }> & { inbox?: string }
    >('/support/tickets', { params })
    return { data: data.data, meta: data.meta, inbox: data.inbox ?? '' }
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
