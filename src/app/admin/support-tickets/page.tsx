import type { Metadata } from 'next'
import SupportTicketsView from './SupportTicketsView'

export const metadata: Metadata = {
  title: 'Tickets',
}

export default function SupportTickets() {
  return <SupportTicketsView />
}
