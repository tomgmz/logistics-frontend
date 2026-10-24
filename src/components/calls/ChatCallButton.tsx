'use client'

import { Phone } from 'lucide-react'

import { useAuthStore } from '@/lib/store/auth.store'
import { useChatCallStore } from '@/lib/store/chatCall.store'

/**
 * The phone button in a direct conversation's header. Hidden for a chat that
 * doesn't exist yet (a draft), for a client on either end, and where no
 * ChatCallProvider is mounted. The server enforces the client rule too.
 *
 * Off while this browser is already on a call with this person. Pressed during
 * a call with someone else, the provider says it can't call instead.
 */
export default function ChatCallButton({
  conversationId, peerName, peerRole, size = 16, className = '',
}: {
  conversationId: string | null | undefined
  peerName:       string
  peerRole:       string | null | undefined
  size?:          number
  className?:     string
}) {
  const myRole    = useAuthStore((s) => s.user?.role)
  const placeCall = useChatCallStore((s) => s.placeCall)
  const inCall    = useChatCallStore((s) => s.inCall)
  const callConv  = useChatCallStore((s) => s.callConversationId)

  if (!conversationId || !placeCall || myRole === 'client' || !peerRole || peerRole === 'client') return null

  // On a call with this very person: the button does nothing. On a call with
  // someone else it stays live, so pressing it says why it can't call.
  const withThem = inCall && callConv === conversationId

  return (
    <button
      type="button"
      onClick={() => placeCall({ conversationId, peerName, peerRole })}
      disabled={withThem}
      className={`shrink-0 rounded-lg p-1.5 text-[var(--color-cyan)]/80 transition-colors disabled:opacity-40 [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-[var(--color-cyan)] ${className}`}
      aria-label={`Call ${peerName}`}
      title={withThem ? `You are on a call with ${peerName}` : `Call ${peerName}`}
    >
      <Phone size={size} />
    </button>
  )
}
