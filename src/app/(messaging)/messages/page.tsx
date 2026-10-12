'use client'

import MessagingShell from '@/components/messaging/MessagingShell'

export default function MessagesPage() {
  return (
    <div className="ff-chat flex flex-1 min-h-0 overflow-hidden">
      <MessagingShell />
    </div>
  )
}