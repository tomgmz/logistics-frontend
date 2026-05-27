'use client'

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MessageRow } from '@/lib/services/messaging.service'
import type { GroupMessageRaw } from '@/app/types/messaging/messaging.types'

interface ReadReceiptPayload {
  conversation_id: string
  read_at: string
}

// Fired when any member reads a group — used to update seen-by avatars in real time
export interface GroupReadReceiptPayload {
  group_id: string
  user_id: string
  read_at: string
}

interface GroupInvitePayload {
  group_id: string
  group_name: string
}

interface PresenceState {
  user_id: string
  online_at: string
}

interface UseMessagingRealtimeOptions {
  currentUserId: string
  onNewMessage?: (message: MessageRow) => void
  onReadReceipt?: (payload: ReadReceiptPayload) => void
  onGroupMessage?: (message: GroupMessageRaw) => void
  onGroupReadReceipt?: (payload: GroupReadReceiptPayload) => void
  onGroupInvite?: (payload: GroupInvitePayload) => void
  onTyping?: (userId: string, isTyping: boolean) => void
  onPresenceChange?: (onlineUserIds: string[]) => void
  conversationId?: string
}

export function useMessagingRealtime({
  currentUserId,
  onNewMessage,
  onReadReceipt,
  onGroupMessage,
  onGroupReadReceipt,
  onGroupInvite,
  onTyping,
  onPresenceChange,
  conversationId,
}: UseMessagingRealtimeOptions) {
  const onNewMessageRef       = useRef(onNewMessage)
  const onReadReceiptRef      = useRef(onReadReceipt)
  const onGroupMessageRef     = useRef(onGroupMessage)
  const onGroupReadReceiptRef = useRef(onGroupReadReceipt)
  const onGroupInviteRef      = useRef(onGroupInvite)
  const onTypingRef           = useRef(onTyping)
  const onPresenceChangeRef   = useRef(onPresenceChange)
  const channelRef            = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => { onNewMessageRef.current       = onNewMessage },       [onNewMessage])
  useEffect(() => { onReadReceiptRef.current      = onReadReceipt },      [onReadReceipt])
  useEffect(() => { onGroupMessageRef.current     = onGroupMessage },     [onGroupMessage])
  useEffect(() => { onGroupReadReceiptRef.current = onGroupReadReceipt }, [onGroupReadReceipt])
  useEffect(() => { onGroupInviteRef.current      = onGroupInvite },      [onGroupInvite])
  useEffect(() => { onTypingRef.current           = onTyping },           [onTyping])
  useEffect(() => { onPresenceChangeRef.current   = onPresenceChange },   [onPresenceChange])

  useEffect(() => {
    if (!currentUserId) return

    const isGroupChannel = conversationId?.startsWith('group:')
    const channelName = isGroupChannel
      ? `messaging:group:${conversationId!.replace('group:', '')}`
      : conversationId
        ? `messaging:conv:${conversationId}`
        : `messaging:user:${currentUserId}`

    const channel = supabase
      .channel(channelName, {
        config: { presence: { key: currentUserId } },
      })
      .on('broadcast', { event: 'new_message' }, ({ payload }: { payload: MessageRow }) => {
        if (conversationId && !isGroupChannel && payload.conversation_id !== conversationId) return
        onNewMessageRef.current?.(payload)
      })
      .on('broadcast', { event: 'read_receipt' }, ({ payload }: { payload: ReadReceiptPayload }) => {
        onReadReceiptRef.current?.(payload)
      })
      .on('broadcast', { event: 'new_group_message' }, ({ payload }: { payload: GroupMessageRaw }) => {
        onGroupMessageRef.current?.(payload)
      })
      // ── Seen-by: fired by server when any member calls markGroupRead ──────
      .on('broadcast', { event: 'group_read_receipt' }, ({ payload }: { payload: GroupReadReceiptPayload }) => {
        if (payload.user_id === currentUserId) return // ignore own echoes
        onGroupReadReceiptRef.current?.(payload)
      })
      .on('broadcast', { event: 'group_invite' }, ({ payload }: { payload: GroupInvitePayload }) => {
        onGroupInviteRef.current?.(payload)
      })
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: { user_id: string; is_typing: boolean } }) => {
        if (payload.user_id === currentUserId) return
        onTypingRef.current?.(payload.user_id, payload.is_typing)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>()
        onPresenceChangeRef.current?.(Object.keys(state))
      })
      .on('presence', { event: 'join' }, () => {
        const state = channel.presenceState<PresenceState>()
        onPresenceChangeRef.current?.(Object.keys(state))
      })
      .on('presence', { event: 'leave' }, () => {
        const state = channel.presenceState<PresenceState>()
        onPresenceChangeRef.current?.(Object.keys(state))
      })
      .subscribe(async (status) => {
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