import type { Metadata } from 'next'
import SupportTicketsView from '@/app/admin/support-tickets/SupportTicketsView'

export const metadata: Metadata = {
  title: 'Tickets',
}

export default function SupportTickets() {
  return <SupportTicketsView />
}
