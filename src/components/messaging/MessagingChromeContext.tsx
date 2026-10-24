'use client'

import { createContext, useContext } from 'react'

// Lets MessagingShell tell the /messages layout that a DM or group chat is open,
// so the layout can drop its top bar on phones/tablets (the chat has its own header).
export const MessagingChromeContext = createContext<(chatOpen: boolean) => void>(() => {})

export const useSetMessagingChatOpen = () => useContext(MessagingChromeContext)
