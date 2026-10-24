'use client'

import { Phone } from 'lucide-react'

import { useAuthStore } from '@/lib/store/auth.store'
import { useChatCallStore } from '@/lib/store/chatCall.store'

/**
 * The phone button in a direct conversation's header. Hidden for a chat that
 * doesn't exist yet (a draft), for a client on either end, and where no
 * ChatCallProvider is mounted. The server enforces the client rule too.
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

  if (!conversationId || !placeCall || myRole === 'client' || !peerRole || peerRole === 'client') return null

  return (
    <button
      type="button"
      onClick={() => placeCall({ conversationId, peerName, peerRole })}
      disabled={inCall}
      className={`shrink-0 rounded-lg p-1.5 text-[var(--color-cyan)]/80 transition-colors disabled:opacity-40 [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-[var(--color-cyan)] ${className}`}
      aria-label={`Call ${peerName}`}
      title={inCall ? 'You are already on a call' : `Call ${peerName}`}
    >
      <Phone size={size} />
    </button>
  )
}
