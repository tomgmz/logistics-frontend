import proxyApi, { initCsrf } from '@/lib/api/auth.api'

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

  async list(status: 'open' | 'resolved' | 'all' = 'open'): Promise<SupportTicket[]> {
    const { data } = await proxyApi.get<{ data: SupportTicket[] }>('/support/tickets', { params: { status } })
    return data.data ?? []
  },

  async resolve(ticketId: string, note: string | null): Promise<SupportTicket> {
    await initCsrf()
    const { data } = await proxyApi.patch<{ data: SupportTicket }>(`/support/tickets/${ticketId}/resolve`, { note })
    return data.data
  },
}

/** Ask the help assistant to open, from anywhere in the client portal. */
export const OPEN_HELP_EVENT = 'open-help-assistant'
export function openHelpAssistant(tab: 'chat' | 'tickets' = 'chat'): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_HELP_EVENT, { detail: { tab } }))
}
