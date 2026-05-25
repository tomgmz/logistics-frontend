'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { MessageRow } from '@/lib/services/messaging.service'

interface UseMessagingRealtimeOptions {
  currentUserId: string
  onNewMessage: (message: MessageRow) => void
  conversationId?: string
}

export function useMessagingRealtime({
  currentUserId,
  onNewMessage,
  conversationId,
}: UseMessagingRealtimeOptions) {
  const callbackRef = useRef(onNewMessage)
  useEffect(() => {
    callbackRef.current = onNewMessage
  }, [onNewMessage])

  useEffect(() => {
    if (!currentUserId) return

    const channelName = conversationId
      ? `messaging:conv:${conversationId}`
      : `messaging:user:${currentUserId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'broadcast',
        { event: 'new_message' },
        ({ payload }: { payload: MessageRow }) => {
          const msg = payload
          if (conversationId && msg.conversation_id !== conversationId) return
          callbackRef.current(msg)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, conversationId])
}