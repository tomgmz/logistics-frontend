'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import ConversationsView from './ConversationsView'
import SupportTicketsView from './SupportTicketsView'

/**
 * The Tickets page (Company Administrator + Operations Manager): client
 * Conversations (assistant → team chats, 2026-11-22) and Tickets (formal,
 * email-tracked) side by side, as Intercom and Zendesk keep chats and tickets
 * in one inbox. ?tab=tickets opens Tickets; notifications link
 * ?tab=conversations.
 */
type Section = 'conversations' | 'tickets'

export default function SupportDeskView() {
  return <Suspense fallback={null}><SupportDesk /></Suspense>
}

function SupportDesk() {
  const asked = useSearchParams().get('tab')
  const [section, setSection] = useState<Section>(asked === 'tickets' ? 'tickets' : 'conversations')

  const switcher = (
    <TabsMinimal
      label="Support section"
      items={[{ id: 'conversations', label: 'Conversations' }, { id: 'tickets', label: 'Tickets' }]}
      selectedKey={section}
      onSelectionChange={(k) => {
        setSection(k)
        const url = new URL(window.location.href)
        url.searchParams.set('tab', k)
        window.history.replaceState(null, '', url.toString())
      }}
    />
  )

  return section === 'conversations' ? <ConversationsView switcher={switcher} /> : <SupportTicketsView switcher={switcher} />
}
