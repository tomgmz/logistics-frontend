'use client'

import { AnimatePresence } from 'framer-motion'
import { useMessengerStore } from '@/lib/store/messenger.store'
import MessengerChatBubble from './MessengerChatBubble'

export default function MessengerBubbleContainer() {
  const { openChatIds } = useMessengerStore()

  return (
    <AnimatePresence>
      {openChatIds.map((id, i) => (
        <MessengerChatBubble
          key={id}
          conversationId={id}
          index={openChatIds.length - 1 - i}
        />
      ))}
    </AnimatePresence>
  )
}