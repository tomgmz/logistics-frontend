'use client'

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MessageRow } from '@/lib/services/messaging.service'
import type { GroupMessageRaw } from '@/app/types/messaging/messaging.types'

interface ReadReceiptPayload { conversation_id: string; read_at: string }
export interface GroupReadReceiptPayload { group_id: string; user_id: string; read_at: string }
interface GroupInvitePayload { group_id: string; group_name: string }

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
  // Stable refs so subscriptions don't re-fire when callbacks change identity
  const onNewMessageRef       = useRef(onNewMessage)
  const onReadReceiptRef      = useRef(onReadReceipt)
  const onGroupMessageRef     = useRef(onGroupMessage)
  const onGroupReadReceiptRef = useRef(onGroupReadReceipt)
  const onGroupInviteRef      = useRef(onGroupInvite)
  const onTypingRef           = useRef(onTyping)
  const onPresenceChangeRef   = useRef(onPresenceChange)

  useEffect(() => { onNewMessageRef.current       = onNewMessage },       [onNewMessage])
  useEffect(() => { onReadReceiptRef.current      = onReadReceipt },      [onReadReceipt])
  useEffect(() => { onGroupMessageRef.current     = onGroupMessage },     [onGroupMessage])
  useEffect(() => { onGroupReadReceiptRef.current = onGroupReadReceipt }, [onGroupReadReceipt])
  useEffect(() => { onGroupInviteRef.current      = onGroupInvite },      [onGroupInvite])
  useEffect(() => { onTypingRef.current           = onTyping },           [onTyping])
  useEffect(() => { onPresenceChangeRef.current   = onPresenceChange },   [onPresenceChange])

  const primaryChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!currentUserId) return

    const isGroupChannel = conversationId?.startsWith('group:')
    const groupId = isGroupChannel ? conversationId!.replace('group:', '') : null

    // ── Single channel per hook instance, unique name so no collisions ──────
    const channelName = isGroupChannel
      ? `pg-group-${groupId}-user-${currentUserId}`
      : conversationId
        ? `pg-conv-${conversationId}-user-${currentUserId}`
        : `pg-user-${currentUserId}`

    const channel = supabase.channel(channelName, {
      config: { presence: { key: currentUserId } },
    })

    // ── 1. DM new messages via Postgres changes ──────────────────────────────
    // Filter: only rows where THIS user is sender OR receiver
    if (!isGroupChannel) {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          // Supabase client-side filter — also filtered by RLS on the server
          filter: conversationId
            ? `conversation_id=eq.${conversationId}`
            : `receiver_id=eq.${currentUserId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow
          // Don't echo back the sender's own optimistic message
          if (row.sender_id === currentUserId && !conversationId) return
          onNewMessageRef.current?.(row)
        }
      )

      // ── 2. Read receipts: when messages are updated (is_read flips) ────────
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: conversationId
            ? `conversation_id=eq.${conversationId}`
            : `sender_id=eq.${currentUserId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow
          if (row.is_read && row.sender_id === currentUserId) {
            onReadReceiptRef.current?.({
              conversation_id: row.conversation_id,
              read_at: row.read_at ?? new Date().toISOString(),
            })
          }
        }
      )
    }

    // ── 3. Group messages via Postgres changes ───────────────────────────────
    if (isGroupChannel && groupId) {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as GroupMessageRaw
          onGroupMessageRef.current?.(row)
        }
      )

      // ── 4. Group member last_read_at updates (seen-by) ───────────────────
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_members',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as { group_id: string; user_id: string; last_read_at: string | null }
          if (row.user_id !== currentUserId && row.last_read_at) {
            onGroupReadReceiptRef.current?.({
              group_id: row.group_id,
              user_id: row.user_id,
              read_at: row.last_read_at,
            })
          }
        }
      )
    }

    // ── 5. Group invites (new group_members row for this user) ───────────────
    if (!isGroupChannel && !conversationId) {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_members',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          // A new invite row — fire onGroupInvite so shell re-fetches groups
          onGroupInviteRef.current?.({ group_id: '', group_name: '' })
        }
      )
    }

    // ── 6. Typing indicators + Presence (broadcast — these are ephemeral, OK) 
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id === currentUserId) return
        onTypingRef.current?.(payload.user_id, payload.is_typing)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        onPresenceChangeRef.current?.(Object.keys(state))
      })
      .on('presence', { event: 'join' }, () => {
        const state = channel.presenceState()
        onPresenceChangeRef.current?.(Object.keys(state))
      })
      .on('presence', { event: 'leave' }, () => {
        const state = channel.presenceState()
        onPresenceChangeRef.current?.(Object.keys(state))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: currentUserId, online_at: new Date().toISOString() })
        }
      })

    primaryChannelRef.current = channel

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [currentUserId, conversationId])

  const broadcastTyping = useCallback((isTyping: boolean) => {
    primaryChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: currentUserId, is_typing: isTyping },
    })
  }, [currentUserId])

  return { broadcastTyping }
}