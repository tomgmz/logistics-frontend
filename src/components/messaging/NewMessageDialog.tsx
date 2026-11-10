'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, Loader2, Users, MessageCirclePlus, CircleCheck, Circle } from 'lucide-react'
import { messagingService } from '@/lib/services/messaging.service'
import type { MessagableUser } from '@/lib/services/messaging.service'
import { roleLabel, matchesPersonSearch } from '@/lib/roles'
import { cachedFetch } from '@/lib/query/useApiQuery'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

/**
 * New Message, per the Figma (docs/figma/messaging "new message [direct]" and
 * "[group]"), the same design as the driver app: DIRECT / GROUP tabs, search,
 * people with their role; on GROUP a group name, round ticks, the Members
 * strip (ringed initials, × to remove, name under) and Create Group.
 *
 * Behaviour is the old two dialogs' (NewConversationModal + NewGroupModal):
 * a direct pick opens the chat, or a draft when none exists yet; clients
 * can't be put in groups (the API refuses them), so GROUP leaves them out.
 */
export type NewMessageTab = 'direct' | 'group'

interface Props {
  initialTab:          NewMessageTab
  onClose:             () => void
  onConversationReady: (conversationId: string) => void
  onDraftReady:        (user: MessagableUser) => void
  onGroupCreated:      (groupId: string) => void
}

function initials(u: MessagableUser): string {
  return `${u.first_name?.[0] ?? '?'}${u.last_name?.[0] ?? ''}`.toUpperCase()
}

export default function NewMessageDialog({ initialTab, onClose, onConversationReady, onDraftReady, onGroupCreated }: Props) {
  useBodyScrollLock(true)

  const [tab, setTab]             = useState<NewMessageTab>(initialTab)
  const [users, setUsers]         = useState<MessagableUser[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [starting, setStarting]   = useState<string | null>(null)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating]   = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const stripRef  = useRef<HTMLDivElement>(null)
  const hasMembers = selected.size > 0

  // Members strip: a mouse wheel (up / down) scrolls it sideways (user
  // 2026-11-10). A trackpad's own sideways swipe is left alone, and at either
  // end the wheel is not held. Native listener: React's wheel handler is
  // passive, so it could not stop the vertical scroll.
  useEffect(() => {
    const el = stripRef.current
    if (!el || !hasMembers) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0
      const atEnd   = el.scrollLeft >= max - 1 && e.deltaY > 0
      if (atStart || atEnd) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hasMembers])

  useEffect(() => {
    cachedFetch(['messaging', 'contacts'], () => messagingService.getMessagableUsers(), (us) => { setUsers(us); setLoading(false) })
      .then(setUsers)
      .catch(() => setError('Could not load contacts'))
      .finally(() => setLoading(false))
    const t = setTimeout(() => searchRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  // Clients talk one-to-one only.
  const pool     = useMemo(() => (tab === 'group' ? users.filter(u => u.role !== 'client') : users), [users, tab])
  const filtered = useMemo(() => pool.filter(u => matchesPersonSearch(search, u)), [pool, search])
  const members  = useMemo(() => users.filter(u => selected.has(u.user_id)), [users, selected])

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const startDirect = async (u: MessagableUser) => {
    if (starting) return
    setStarting(u.user_id)
    setError(null)
    try {
      const { conversation_id } = await messagingService.resolveConversation(u.user_id)
      if (conversation_id) onConversationReady(conversation_id)
      else onDraftReady(u)
    } catch {
      setError('Could not start the conversation')
      setStarting(null)
    }
  }

  const createGroup = async () => {
    if (!groupName.trim() || selected.size === 0 || creating) return
    setCreating(true)
    setError(null)
    try {
      const result = await messagingService.createGroup({ name: groupName.trim(), member_ids: [...selected] })
      onGroupCreated(result.group_id)
    } catch {
      setError('Failed to create group')
      setCreating(false)
    }
  }

  const canCreate = !!groupName.trim() && selected.size > 0 && !creating

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="ff-darker fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-4"
        style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          role="dialog" aria-modal="true" aria-label="New Message"
          className="w-full sm:max-w-[360px] bg-[#0e1010] border border-[#3a3a3a] rounded-t-[18px] sm:rounded-[18px] shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[min(615px,90dvh)]"
        >
          {/* Header */}
          <div className="px-4 pt-2.5 pb-2 flex items-center justify-between border-b border-[#3a3a3a] shrink-0">
            <div className="flex items-center gap-1.5">
              <MessageCirclePlus size={18} className="text-[var(--color-cyan)]" />
              <h3 className="text-white text-[18px] font-bold leading-none">New Message</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md text-white/45 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* DIRECT / GROUP */}
          <div className="flex gap-1.5 mx-[18px] mt-2.5 mb-3.5 shrink-0">
            {(['direct', 'group'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`flex-1 h-[29px] rounded-[4px] text-[14px] font-bold tracking-wide text-white border transition-colors ${tab === t ? 'bg-[#033330] border-[var(--color-cyan)]' : 'border-transparent hover:bg-white/[0.04]'}`}>
                {t === 'direct' ? 'DIRECT' : 'GROUP'}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mx-4 mb-3 shrink-0">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55 pointer-events-none" />
            <input
              ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, role..."
              className="w-full h-[29px] bg-transparent border border-[#2f2f2f] rounded-[10px] pl-9 pr-3 text-[15px] font-medium text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--color-cyan)]/40"
            />
          </div>

          {/* Group name */}
          {tab === 'group' && (
            <input
              type="text" value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={100}
              placeholder="Group Name"
              className="mx-4 mb-1.5 h-[29px] bg-transparent border border-[var(--color-cyan)] rounded-[10px] px-2 text-[15px] font-medium text-white placeholder:text-white/40 focus:outline-none shrink-0"
            />
          )}

          {/* People */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 size={18} className="animate-spin text-[var(--color-cyan)]" /></div>
            ) : error && users.length === 0 ? (
              <p className="text-center text-white/45 text-[15px] font-medium py-12">{error}</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-white/45 text-[15px] font-medium py-12">{search ? 'No contacts match' : 'No contacts available'}</p>
            ) : filtered.map(u => {
              const isSel = selected.has(u.user_id)
              return (
                <button
                  key={u.user_id} type="button" disabled={!!starting}
                  onClick={() => (tab === 'direct' ? startDirect(u) : toggle(u.user_id))}
                  className="w-full flex items-center gap-2.5 pl-[19px] pr-4 py-[5px] text-left hover:bg-white/[0.03] transition-colors disabled:opacity-60"
                >
                  <span className="w-[35px] h-[35px] rounded-full border border-[#5a5a5a] flex items-center justify-center shrink-0 text-[15px] font-medium text-white">{initials(u)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[18px] leading-[21px] font-medium text-white truncate">{u.first_name} {u.last_name}</span>
                    <span className="block text-[13px] leading-[15px] font-medium text-white/45 truncate">{roleLabel(u.role)}</span>
                  </span>
                  {tab === 'direct'
                    ? starting === u.user_id && <Loader2 size={16} className="animate-spin text-[var(--color-cyan)] shrink-0" />
                    : isSel
                      ? <CircleCheck size={20} className="text-[var(--color-cyan)] shrink-0" strokeWidth={1.8} />
                      : <Circle size={20} className="text-white/45 shrink-0" strokeWidth={1.6} />}
                </button>
              )
            })}
          </div>

          {/* Direct: an error under the list. Group: Members + Create Group. */}
          {tab === 'direct' ? (
            error && users.length > 0 && <p className="px-4 pb-3 text-[14px] font-medium text-[#f62626]">{error}</p>
          ) : (
            <div className="border-t border-[#3a3a3a] px-4 pt-1.5 pb-4 shrink-0">
              <p className="text-white text-[15px] font-medium ml-[3px] mb-1">Members</p>
              {members.length === 0 ? (
                <p className="text-white/45 text-[13px] font-medium ml-[3px] mb-2">Tick the people to add.</p>
              ) : (
                <div ref={stripRef} className="flex gap-[22px] overflow-x-auto overscroll-x-contain pl-[11px] pr-2 pt-1 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {members.map(u => (
                    <div key={u.user_id} className="flex flex-col items-center w-10 shrink-0">
                      <span className="relative w-[35px] h-[35px] rounded-full border-[1.5px] border-[var(--color-cyan)] bg-[#0e1010] flex items-center justify-center text-[15px] font-medium text-white">
                        {initials(u)}
                        <button type="button" onClick={() => toggle(u.user_id)}
                          aria-label={`Remove ${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()}
                          className="absolute -top-1 -right-[5px] w-3.5 h-3.5 rounded-full bg-[#5a5a5a] border border-[#0e1010] flex items-center justify-center text-white">
                          <X size={8} strokeWidth={3} />
                        </button>
                      </span>
                      <span className="mt-0.5 max-w-[52px] truncate text-[12px] font-medium text-white">{u.first_name}</span>
                    </div>
                  ))}
                </div>
              )}
              {error && users.length > 0 && <p className="text-[14px] font-medium text-[#f62626] mb-1.5">{error}</p>}
              <button
                type="button" onClick={createGroup} disabled={!canCreate}
                className="mt-1 w-full h-10 rounded-[10px] bg-[#1d3d3a] border border-[var(--color-cyan)] flex items-center justify-center gap-2 text-[var(--color-cyan)] text-[18px] font-bold transition-opacity disabled:opacity-45"
              >
                {creating ? <Loader2 size={18} className="animate-spin" /> : <Users size={20} />}
                {creating ? 'Creating…' : 'Create Group'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
