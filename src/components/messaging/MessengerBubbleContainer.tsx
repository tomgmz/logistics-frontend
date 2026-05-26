'use client'

import { AnimatePresence } from 'framer-motion'
import { useMessengerStore } from '@/lib/store/messenger.store'
import MessengerChatBubble from './MessengerChatBubble'
import MessengerGroupBubble from './MessengerGroupBubble'
import MessengerMinimizedBubbles from './MessengerMinimizedBubble'

export default function MessengerBubbleContainer() {
  const { openChats } = useMessengerStore()

  return (
    <>
      <MessengerMinimizedBubbles />
      <AnimatePresence>
        {openChats.map((chat, i) => {
          const index = openChats.length - 1 - i
          return chat.kind === 'group' ? (
            <MessengerGroupBubble
              key={chat.id}
              groupId={chat.id}
              index={index}
            />
          ) : (
            <MessengerChatBubble
              key={chat.id}
              conversationId={chat.id}
              index={index}
            />
          )
        })}
      </AnimatePresence>
    </>
  )
}