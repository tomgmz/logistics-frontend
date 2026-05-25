'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { Conversation } from '@/app/types/messaging/messaging.types'
import { MOCK_CONVERSATIONS, MOCK_MESSAGES } from '@/lib/data/messaging.mock'
import ConversationList from './ConversationList'
import ChatWindow from './ChatWindow'

const CURRENT_USER_ID = 'current'

export default function MessagingShell() {
  const [conversations, setConversations] = useState(MOCK_CONVERSATIONS)
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const selectedConv = conversations.find(c => c.id === selectedConvId) ?? null

  const filteredConvs = conversations.filter(c => {
    const p = c.participants[0]
    const name = `${p.first_name} ${p.last_name}`.toLowerCase()
    const role = p.role.toLowerCase()
    const q = search.toLowerCase()
    return name.includes(q) || role.includes(q)
  })

  const handleSelectConv = (conv: Conversation) => {
    setSelectedConvId(conv.id)
    setConversations(prev =>
      prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
    )
  }

  const handleBack = () => setSelectedConvId(null)

  const messages = selectedConvId ? (MOCK_MESSAGES[selectedConvId] ?? []) : []

  return (
    <div className="flex flex-1 min-h-0 h-full overflow-hidden">
      <div className={`
        shrink-0 border-r border-white/[0.07] bg-[var(--color-bg)] flex flex-col
        w-full lg:w-[300px]
        ${selectedConvId ? 'hidden lg:flex' : 'flex'}
      `}>
        <ConversationList
          conversations={filteredConvs}
          selectedId={selectedConvId}
          search={search}
          onSearchChange={setSearch}
          onSelect={handleSelectConv}
          currentUserId={CURRENT_USER_ID}
        />
      </div>

      <div className={`
        flex-1 min-w-0 flex flex-col
        ${selectedConvId ? 'flex' : 'hidden lg:flex'}
        bg-[var(--color-surface)]
      `}>
        {selectedConv ? (
          <ChatWindow
            conversation={selectedConv}
            messages={messages}
            currentUserId={CURRENT_USER_ID}
            onBack={handleBack}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
      <div className="w-14 h-14 rounded-full glass border border-white/10 flex items-center justify-center">
        <MessageCircle size={24} className="text-[var(--color-cyan)]/40" />
      </div>
      <div className="space-y-1">
        <p className="font-spartan text-white/50 text-xs tracking-[0.2em] uppercase">
          Select a conversation
        </p>
        <p className="font-body text-white/20 text-xs">
          Choose from your list to start messaging
        </p>
      </div>
    </div>
  )
}