import type { Metadata } from 'next'
import SupportDeskView from './SupportDeskView'

export const metadata: Metadata = {
  title: 'Support',
}

export default function SupportTickets() {
  return <SupportDeskView />
}
