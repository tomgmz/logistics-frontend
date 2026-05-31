'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface PresenceState { user_id: string; online_at: string }

let channel:  ReturnType<typeof supabase.channel> | null = null
let refCount = 0
let onlineIds: string[] = []
const listeners = new Set<(ids: string[]) => void>()

function emit() { listeners.forEach(l => l(onlineIds)) }

function ensureChannel(currentUserId: string) {
  if (channel) return
  const ch = supabase.channel('messaging:presence:global', {
    config: { presence: { key: currentUserId } },
  })
  const sync = () => { onlineIds = Object.keys(ch.presenceState<PresenceState>()); emit() }
  ch
    .on('presence', { event: 'sync' },  sync)
    .on('presence', { event: 'join' },  sync)
    .on('presence', { event: 'leave' }, sync)
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ user_id: currentUserId, online_at: new Date().toISOString() })
      }
    })
  channel = ch
}

function teardown() {
  if (!channel) return
  channel.untrack()
  supabase.removeChannel(channel)
  channel   = null
  onlineIds = []
}

export function useGlobalPresence(currentUserId: string): string[] {
  const [ids, setIds] = useState<string[]>(onlineIds)

  useEffect(() => {
    if (!currentUserId) return

    ensureChannel(currentUserId)
    refCount++

    const listener = (next: string[]) => setIds(next)
    listeners.add(listener)
    setIds(onlineIds)

    return () => {
      listeners.delete(listener)
      refCount--
      if (refCount === 0) teardown()
    }
  }, [currentUserId])

  return ids
}
