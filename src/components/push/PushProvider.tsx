'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { registerWebPush } from '@/lib/push/web-push'
import { clientMessagesHref, openHelpAssistant } from '@/lib/services/support.service'

/**
 * Registers web push for the signed-in user and routes notification taps to the
 * right destination. Booking-workflow taps carry a deep-link (action_url) into
 * the correct module + booking; chat taps fall back to the messages view.
 * Mounted once inside the authenticated shell.
 */
export default function PushProvider() {
  const userId   = useAuthStore((s) => s.user?.user_id ?? null)
  const isClient = useAuthStore((s) => s.user?.role === 'client')
  const router = useRouter()

  useEffect(() => {
    if (!userId) return
    registerWebPush().catch(() => {})
  }, [userId])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    // A client's chats open in the help assistant, which is already mounted in
    // their portal; from anywhere else, go there.
    const openChat = (conversationId?: string) => {
      if (!isClient) router.push('/messages')
      else if (window.location.pathname.startsWith('/client')) openHelpAssistant('messages', conversationId)
      else router.push(clientMessagesHref(conversationId))
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_NOTIFICATION') {
        const url = typeof event.data.url === 'string' ? event.data.url : '/messages'
        if (url === '/messages') openChat(event.data.data?.conversation_id)
        else router.push(url)
      } else if (event.data?.type === 'OPEN_CONVERSATION') {
        openChat(event.data.conversation_id)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router, isClient])

  return null
}
