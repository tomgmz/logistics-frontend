'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { ChatMessage } from '@/lib/services/support-chat.service'

/**
 * Live updates for client support conversations (2026-11-22):
 *   - `support:conv:<id>`  new messages in the open conversation + "typing"
 *                          (both the client and staff listen and send here)
 *   - `support:user:<id>`  the client's list changed (status, new message)
 * The staff inbox list itself follows the live:support_conversations signal.
 */
export function useSupportConversationChannel(opts: {
  conversationId: string | null
  userId:         string | undefined
  onMessage?:     (m: ChatMessage) => void
  onTyping?:      (userId: string, isTyping: boolean) => void
  /** Staff only: announce yourself as viewing, and hear who else is. */
  presenceName?:  string
  onViewers?:     (viewers: { user_id: string; name: string }[]) => void
  onAssigned?:    (p: { assigned_to: string; name: string }) => void
}) {
  const ref = useRef(opts)
  useLayoutEffect(() => { ref.current = opts })
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const { conversationId, userId, presenceName } = opts

  useEffect(() => {
    if (!conversationId || !userId) return
    const channel = supabase.channel(`support:conv:${conversationId}`, presenceName ? { config: { presence: { key: userId } } } : undefined)
    const viewers = () => {
      const state = channel.presenceState<{ user_id: string; name: string }>()
      const list = Object.values(state).flat().filter((p) => p.user_id !== userId)
      ref.current.onViewers?.([...new Map(list.map((p) => [p.user_id, p])).values()])
    }
    channel
      .on('broadcast', { event: 'new_message' }, ({ payload }: { payload: ChatMessage }) => ref.current.onMessage?.(payload))
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: { user_id: string; is_typing: boolean } }) => {
        if (payload.user_id !== userId) ref.current.onTyping?.(payload.user_id, payload.is_typing)
      })
      .on('broadcast', { event: 'assigned' }, ({ payload }: { payload: { assigned_to: string; name: string } }) => ref.current.onAssigned?.(payload))
    if (presenceName) {
      channel.on('presence', { event: 'sync' }, viewers).on('presence', { event: 'join' }, viewers).on('presence', { event: 'leave' }, viewers)
    }
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && presenceName) await channel.track({ user_id: userId, name: presenceName })
    })
    channelRef.current = channel
    return () => {
      if (presenceName) void channel.untrack()
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [conversationId, userId, presenceName])

  const sendTyping = useCallback((isTyping: boolean) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, is_typing: isTyping } })
  }, [userId])

  return { sendTyping }
}

/** The client's own list: any change to one of their conversations. */
export function useSupportUserChannel(userId: string | undefined, onChange: (conversationId: string) => void) {
  const ref = useRef(onChange)
  useLayoutEffect(() => { ref.current = onChange })
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(`support:user:${userId}`)
    channel
      .on('broadcast', { event: 'conversation_updated' }, ({ payload }: { payload: { conversation_id: string } }) => ref.current(payload.conversation_id))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])
}
