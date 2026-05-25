'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, Loader2, Users, Check } from 'lucide-react'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessagableUser } from '@/lib/services/messaging.service'

interface NewGroupModalProps {
  onClose: () => void
  onGroupCreated: (groupId: string) => void
}

export default function NewGroupModal({ onClose, onGroupCreated }: NewGroupModalProps) {
  const [users, setUsers] = useState<MessagableUser[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupName, setGroupName] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagingService.getMessagableUsers()
      .then(setUsers)
      .catch(() => setError('Could not load contacts'))
      .finally(() => setLoading(false))
    setTimeout(() => searchRef.current?.focus(), 80)
  }, [])

  const filtered = users.filter(u => {
    const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.toLowerCase()
    return name.includes(search.toLowerCase()) || u.role.toLowerCase().includes(search.toLowerCase())
  })

  const toggleSelect = (userId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) { next.delete(userId) } else { next.add(userId) }
      return next
    })
  }

  const handleCreate = async () => {
    if (!groupName.trim() || selected.size === 0 || creating) return
    setCreating(true)
    try {
      const result = await messagingService.createGroup({
        name: groupName.trim(),
        member_ids: [...selected],
      })
      onGroupCreated(result.group_id)
    } catch {
      setError('Failed to create group')
      setCreating(false)
    }
  }

  const selectedUsers = users.filter(u => selected.has(u.user_id))

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-sm bg-[var(--color-bg)] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxHeight: '80vh' }}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-[var(--color-cyan)]/70" />
              <h3 className="font-spartan text-white text-sm tracking-[0.15em] uppercase">New Group</h3>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Group name */}
          <div className="px-3 pt-3 pb-2 shrink-0">
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Group name…"
              maxLength={100}
              className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 ff-body text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--color-cyan)]/30 transition-all"
            />
          </div>

          {/* Selected chips */}
          {selectedUsers.length > 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {selectedUsers.map(u => (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => toggleSelect(u.user_id)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--color-cyan)]/10 border border-[var(--color-cyan)]/20 text-[var(--color-cyan)] ff-body text-[11px]"
                >
                  {u.first_name} {u.last_name}
                  <X size={10} />
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="px-3 pb-2 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search people…"
                className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-3 py-2 ff-body text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--color-cyan)]/30 transition-all"
              />
            </div>
          </div>

          {/* User list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={18} className="animate-spin text-[var(--color-cyan)]/40" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="ff-body text-white/20 text-xs text-center py-12">No contacts found</p>
            ) : (
              filtered.map(user => {
                const isSelected = selected.has(user.user_id)
                const initials = `${user.first_name?.[0] ?? '?'}${user.last_name?.[0] ?? '?'}`.toUpperCase()
                return (
                  <motion.button
                    key={user.user_id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleSelect(user.user_id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="w-9 h-9 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0">
                      <span className="font-card text-[0.62rem] text-white/75">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="ff-body text-sm text-white truncate">{user.first_name} {user.last_name}</p>
                      <p className="ff-body text-[11px] text-white/35 capitalize truncate">{user.role.replace(/_/g, ' ')}</p>
                    </div>
                    <div className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-[var(--color-cyan)] border-[var(--color-cyan)]' : 'border-white/20'}`}>
                      {isSelected && <Check size={11} className="text-[var(--color-bg)]" />}
                    </div>
                  </motion.button>
                )
              })
            )}
          </div>

          {/* Error */}
          {error && <p className="px-4 pb-2 ff-body text-xs text-red-400">{error}</p>}

          {/* Footer */}
          <div className="px-3 py-3 border-t border-white/[0.06] shrink-0">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!groupName.trim() || selected.size === 0 || creating}
              className="w-full py-2.5 rounded-xl ff-body text-sm font-medium transition-all bg-[var(--color-cyan)] text-[var(--color-bg)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
              {creating ? 'Creating…' : `Create group${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}