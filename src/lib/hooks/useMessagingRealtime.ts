'use client'

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  MessageRow,
  GroupMessageRaw,
  ReadReceiptPayload,
  GroupReadReceiptPayload,
  GroupInvitePayload,
  ReactionTogglePayload,
} from '@/app/types/messaging/messaging.types'

interface PresenceState { user_id: string; online_at: string }

export interface UseMessagingRealtimeOptions {
  currentUserId: string
  conversationId?: string
  onNewMessage?:        (msg:     MessageRow)              => void
  onReadReceipt?:       (payload: ReadReceiptPayload)      => void
  onGroupMessage?:      (msg:     GroupMessageRaw)         => void
  onGroupReadReceipt?:  (payload: GroupReadReceiptPayload) => void
  onGroupInvite?:       (payload: GroupInvitePayload)      => void
  onReactionToggle?:    (payload: ReactionTogglePayload)   => void
  onTyping?:            (userId: string, isTyping: boolean) => void
  onPresenceChange?:    (onlineUserIds: string[])          => void
}

export function useMessagingRealtime(opts: UseMessagingRealtimeOptions) {
  // Single ref holds the whole options bag — only ever read inside effects/handlers,
  // never during render. useLayoutEffect is allowed to write refs (it's not render).
  const optsRef = useRef(opts)
  useLayoutEffect(() => { optsRef.current = opts })

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const { currentUserId, conversationId } = opts

  useEffect(() => {
    if (!currentUserId) return

    const isGroup     = conversationId?.startsWith('group:') ?? false
    const channelName = isGroup
      ? `messaging:group:${conversationId!.replace('group:', '')}`
      : conversationId
        ? `messaging:conv:${conversationId}`
        : `messaging:user:${currentUserId}`

    const channel = supabase.channel(channelName, {
      config: { presence: { key: currentUserId } },
    })

    channel
      .on('broadcast', { event: 'new_message' }, ({ payload }: { payload: MessageRow }) => {
        if (!isGroup && conversationId && payload.conversation_id !== conversationId) return
        optsRef.current.onNewMessage?.(payload)
      })
      .on('broadcast', { event: 'read_receipt' }, ({ payload }: { payload: ReadReceiptPayload }) => {
        optsRef.current.onReadReceipt?.(payload)
      })
      .on('broadcast', { event: 'new_group_message' }, ({ payload }: { payload: GroupMessageRaw }) => {
        optsRef.current.onGroupMessage?.(payload)
      })
      .on('broadcast', { event: 'group_read_receipt' }, ({ payload }: { payload: GroupReadReceiptPayload }) => {
        if (payload.user_id === currentUserId) return
        optsRef.current.onGroupReadReceipt?.(payload)
      })
      .on('broadcast', { event: 'group_invite' }, ({ payload }: { payload: GroupInvitePayload }) => {
        optsRef.current.onGroupInvite?.(payload)
      })
      .on('broadcast', { event: 'reaction_toggle' }, ({ payload }: { payload: ReactionTogglePayload }) => {
        if (payload.user_id === currentUserId) return
        optsRef.current.onReactionToggle?.(payload)
      })
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: { user_id: string; is_typing: boolean } }) => {
        if (payload.user_id === currentUserId) return
        optsRef.current.onTyping?.(payload.user_id, payload.is_typing)
      })

    channel
      .on('presence', { event: 'sync' }, () => {
        optsRef.current.onPresenceChange?.(Object.keys(channel.presenceState<PresenceState>()))
      })
      .on('presence', { event: 'join' }, () => {
        optsRef.current.onPresenceChange?.(Object.keys(channel.presenceState<PresenceState>()))
      })
      .on('presence', { event: 'leave' }, () => {
        optsRef.current.onPresenceChange?.(Object.keys(channel.presenceState<PresenceState>()))
      })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: currentUserId, online_at: new Date().toISOString() })
      }
    })

    channelRef.current = channel

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [currentUserId, conversationId])

  const broadcastTyping = useCallback((isTyping: boolean) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: currentUserId, is_typing: isTyping },
    })
  }, [currentUserId])

  return { broadcastTyping }
}