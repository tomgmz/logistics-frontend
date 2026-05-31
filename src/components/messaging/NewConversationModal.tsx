'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, Loader2, MessageCirclePlus } from 'lucide-react'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessagableUser } from '@/lib/services/messaging.service'

interface NewConversationModalProps {
  onClose: () => void
  onConversationReady: (conversationId: string) => void
  onDraftReady: (user: MessagableUser) => void
}

export default function NewConversationModal({
  onClose,
  onConversationReady,
  onDraftReady,
}: NewConversationModalProps) {
  const [users, setUsers] = useState<MessagableUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [starting, setStarting] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagingService
      .getMessagableUsers()
      .then(setUsers)
      .catch(() => setError('Could not load contacts'))
      .finally(() => setLoading(false))

    setTimeout(() => searchRef.current?.focus(), 80)
  }, [])

  const filtered = users.filter(u => {
    const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.toLowerCase()
    const role = u.role.toLowerCase()
    const q = search.toLowerCase()
    return name.includes(q) || role.includes(q)
  })

  const handleSelect = async (user: MessagableUser) => {
    if (starting) return
    setStarting(user.user_id)
    try {
      const { conversation_id } = await messagingService.resolveConversation(user.user_id)
      if (conversation_id) onConversationReady(conversation_id)
      else onDraftReady(user)
    } catch {
      setStarting(null)
    }
  }

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        onClick={handleBackdrop}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="
            w-full max-w-sm bg-[var(--color-bg)] border border-white/[0.09]
            rounded-2xl shadow-2xl overflow-hidden flex flex-col
          "
          style={{ maxHeight: '75vh' }}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <MessageCirclePlus size={15} className="text-[var(--color-cyan)]/70" />
              <h3 className="font-spartan text-white text-sm tracking-[0.15em] uppercase">
                New Message
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-3 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or role…"
                className="
                  w-full bg-white/[0.04] border border-white/[0.07] rounded-xl
                  pl-9 pr-3 py-2.5 ff-body text-sm text-white placeholder:text-white/20
                  focus:outline-none focus:border-[var(--color-cyan)]/30 focus:bg-white/[0.06]
                  transition-all
                "
              />
            </div>
          </div>

          {/* List */}
          <div className="
            flex-1 overflow-y-auto px-2 pb-3 min-h-0
            [&::-webkit-scrollbar]:w-[3px]
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:bg-white/10
            [&::-webkit-scrollbar-thumb]:rounded-full
            hover:[&::-webkit-scrollbar-thumb]:bg-white/20
          ">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={18} className="animate-spin text-[var(--color-cyan)]/40" />
              </div>
            )}

            {!loading && error && (
              <p className="ff-body text-white/30 text-xs text-center py-12">{error}</p>
            )}

            {!loading && !error && filtered.length === 0 && (
              <p className="ff-body text-white/20 text-xs text-center py-12">
                {search ? 'No contacts match your search' : 'No contacts available'}
              </p>
            )}

            {!loading && !error && filtered.map(user => {
              const initials = `${user.first_name?.[0] ?? '?'}${user.last_name?.[0] ?? '?'}`.toUpperCase()
              const isStarting = starting === user.user_id

              return (
                <motion.button
                  key={user.user_id}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelect(user)}
                  disabled={!!starting}
                  className="
                    w-full flex items-center gap-3 px-3 py-3 rounded-xl
                    text-left transition-colors disabled:opacity-60
                  "
                >
                  <div className="w-9 h-9 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0">
                    <span className="font-card text-[0.62rem] text-white/75">{initials}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="ff-body text-sm text-white truncate">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="ff-body text-[11px] text-white/35 capitalize truncate">
                      {user.role.replace(/_/g, ' ')}
                    </p>
                  </div>

                  {isStarting && (
                    <Loader2 size={14} className="animate-spin text-[var(--color-cyan)]/60 shrink-0" />
                  )}
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}