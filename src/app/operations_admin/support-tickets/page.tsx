import type { Metadata } from 'next'
import SupportDeskView from '@/app/admin/support-tickets/SupportDeskView'

export const metadata: Metadata = {
  title: 'Tickets',
}

export default function SupportTickets() {
  return <SupportDeskView />
}
