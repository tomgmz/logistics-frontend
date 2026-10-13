'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Search, Loader2, Users, Check, UserPlus, Pencil, UserMinus, Inbox } from 'lucide-react'
import { messagingService, type MessagableUser, type GroupMemberRequest } from '@/lib/services/messaging.service'
import { appToast } from '@/lib/toast'
import { roleLabel, matchesPersonSearch } from '@/lib/roles'
import { getApiErrorMessage } from '@/lib/api-error'
import type { Group, GroupMember } from '@/app/types/messaging/messaging.types'

export type GroupOptionsView = 'members' | 'add' | 'rename' | 'requests'

const REQUEST_SENT = 'Request sent. The group creator will approve or decline it.'

// Same frame as the New Group pop-up, so the group dialogs read as one family.
function ModalFrame({ title, icon, onClose, children }: {
  title:    string
  icon:     React.ReactNode
  onClose:  () => void
  children: React.ReactNode
}) {
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
          <div className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              {icon}
              <h3 className="font-spartan text-white text-sm tracking-[0.15em] uppercase">{title}</h3>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function PersonRow({ first, last, role, right }: {
  first: string; last: string; role: string; right?: React.ReactNode
}) {
  const initials = `${first?.[0] ?? '?'}${last?.[0] ?? '?'}`.toUpperCase()
  return (
    <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl">
      <div className="w-9 h-9 rounded-full bg-[var(--color-surface-dark)] border border-white/10 flex items-center justify-center shrink-0">
        <span className="font-card text-[0.62rem] text-white/75">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="ff-body text-sm text-white truncate">{first} {last}</p>
        <p className="ff-body text-[11px] text-white/35 truncate">{roleLabel(role)}</p>
      </div>
      {right}
    </div>
  )
}

const LIST_CLASS = 'flex-1 overflow-y-auto px-2 pb-2 min-h-0 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full'
const INPUT_CLASS = 'w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 ff-body text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--color-cyan)]/30 transition-all'
const PRIMARY_CLASS = 'w-full py-2.5 rounded-xl ff-body text-sm font-medium transition-all bg-[var(--color-cyan)] text-[var(--color-bg)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2'

/**
 * Everyone in the group: who has joined, and who has been invited but not yet.
 * The group's creator removes people from here; any other member asks the
 * creator to remove them.
 */
function MembersModal({ group, currentUserId, onClose, onChanged }: {
  group: Group; currentUserId: string; onClose: () => void; onChanged: () => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [removing,  setRemoving]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const isCreator = group.created_by === currentUserId

  const remove = async (userId: string) => {
    setRemoving(true)
    setError(null)
    try {
      const result = await messagingService.removeGroupMember(group.id, userId)
      setConfirmId(null)
      if (result?.requested) appToast.success(REQUEST_SENT)
      onChanged()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not remove this person'))
    } finally {
      setRemoving(false)
    }
  }

  const removeControl = (m: GroupMember) => {
    // Nobody removes themselves or the creator.
    if (m.user_id === currentUserId || m.user_id === group.created_by) return null
    if (confirmId === m.user_id) {
      return (
        <div className="shrink-0 flex items-center gap-1">
          <button type="button" disabled={removing} onClick={() => void remove(m.user_id)}
            className="px-2 py-1 rounded-lg bg-red-500/80 hover:bg-red-500 ff-body text-[11px] text-white disabled:opacity-50">
            {removing ? <Loader2 size={11} className="animate-spin" /> : isCreator ? 'Remove' : 'Ask to remove'}
          </button>
          <button type="button" disabled={removing} onClick={() => setConfirmId(null)}
            className="px-2 py-1 rounded-lg border border-white/10 ff-body text-[11px] text-white/60 hover:text-white">
            Keep
          </button>
        </div>
      )
    }
    return (
      <button type="button" title={isCreator ? 'Remove from group' : 'Ask the creator to remove'}
        aria-label={`${isCreator ? 'Remove' : 'Ask to remove'} ${m.first_name} ${m.last_name}`}
        onClick={() => setConfirmId(m.user_id)}
        className="shrink-0 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors">
        <UserMinus size={14} />
      </button>
    )
  }

  const joined  = group.members.filter(m => m.status === 'accepted')
  const invited = group.members.filter(m => m.status === 'pending')
  const sortByName = (a: GroupMember, b: GroupMember) =>
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)

  const tag = (m: GroupMember) => (
    <span className="shrink-0 ff-body text-[10px] text-white/35">
      {m.user_id === currentUserId ? 'You' : m.user_id === group.created_by ? 'Created the group' : ''}
    </span>
  )

  return (
    <ModalFrame title="Members" icon={<Users size={15} className="text-[var(--color-cyan)]/70" />} onClose={onClose}>
      <div className={`${LIST_CLASS} pt-2`}>
        <p className="px-3 pt-1 pb-1 ff-body text-[10px] uppercase tracking-widest text-white/30">
          In the group · {joined.length}
        </p>
        {[...joined].sort(sortByName).map(m => (
          <PersonRow key={m.user_id} first={m.first_name} last={m.last_name} role={m.role}
            right={<>{tag(m)}{removeControl(m)}</>} />
        ))}
        {invited.length > 0 && (
          <>
            <p className="px-3 pt-3 pb-1 ff-body text-[10px] uppercase tracking-widest text-white/30">
              Invited · {invited.length}
            </p>
            {[...invited].sort(sortByName).map(m => (
              <PersonRow key={m.user_id} first={m.first_name} last={m.last_name} role={m.role}
                right={<><span className="shrink-0 ff-body text-[10px] text-amber-400/80">Invite pending</span>{removeControl(m)}</>} />
            ))}
          </>
        )}
      </div>
      {error && <p className="px-4 pb-3 ff-body text-xs text-red-400">{error}</p>}
    </ModalFrame>
  )
}

/**
 * Invite more people. Anyone already in or invited is left out of the list.
 * The creator adds them straight away; anyone else sends a request.
 */
function AddMembersModal({ group, isCreator, onClose, onDone }: {
  group: Group; isCreator: boolean; onClose: () => void; onDone: () => void
}) {
  const [users,    setUsers]    = useState<MessagableUser[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const inGroup = new Set(group.members.filter(m => m.status !== 'declined').map(m => m.user_id))
    messagingService.getMessagableUsers()
      // Clients talk one-to-one only; the API refuses them in groups.
      .then(us => setUsers(us.filter(u => u.role !== 'client' && !inGroup.has(u.user_id))))
      .catch(() => setError('Could not load contacts'))
      .finally(() => setLoading(false))
    setTimeout(() => searchRef.current?.focus(), 80)
  }, [group.members])

  const filtered = users.filter(u => matchesPersonSearch(search, u))

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const save = async () => {
    if (!selected.size || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await messagingService.addGroupMembers(group.id, [...selected])
      if (result?.requested) appToast.success(REQUEST_SENT)
      onDone()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not add people to the group'))
      setSaving(false)
    }
  }

  return (
    <ModalFrame title={isCreator ? 'Add People' : 'Ask to Add People'} icon={<UserPlus size={15} className="text-[var(--color-cyan)]/70" />} onClose={onClose}>
      {!isCreator && (
        <p className="px-4 pt-3 ff-body text-[11px] text-white/45">
          The group creator approves who joins. They will see your request in the chat.
        </p>
      )}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
          <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or role…" className={`${INPUT_CLASS} pl-9 py-2`} />
        </div>
      </div>

      <div className={LIST_CLASS}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={18} className="animate-spin text-[var(--color-cyan)]/40" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="ff-body text-white/20 text-xs text-center py-12">
            {search ? 'No contacts match your search' : 'Everyone you can add is already in this group'}
          </p>
        ) : filtered.map(u => {
          const on = selected.has(u.user_id)
          return (
            <motion.button key={u.user_id} type="button" whileTap={{ scale: 0.98 }} onClick={() => toggle(u.user_id)}
              className="w-full text-left rounded-xl transition-colors hover:bg-white/[0.04]">
              <PersonRow first={u.first_name ?? ''} last={u.last_name ?? ''} role={u.role} right={
                <div className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${on ? 'bg-[var(--color-cyan)] border-[var(--color-cyan)]' : 'border-white/20'}`}>
                  {on && <Check size={11} className="text-[var(--color-bg)]" />}
                </div>
              } />
            </motion.button>
          )
        })}
      </div>

      {error && <p className="px-4 pb-2 ff-body text-xs text-red-400">{error}</p>}

      <div className="px-3 py-3 border-t border-white/[0.06] shrink-0">
        <button type="button" onClick={save} disabled={!selected.size || saving} className={PRIMARY_CLASS}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          {saving
            ? (isCreator ? 'Adding…' : 'Sending…')
            : `${isCreator ? 'Add to group' : 'Send request'}${selected.size ? ` (${selected.size})` : ''}`}
        </button>
      </div>
    </ModalFrame>
  )
}

function RenameModal({ group, onClose, onDone }: {
  group: Group; onClose: () => void; onDone: () => void
}) {
  const [name,   setName]   = useState(group.name)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const unchanged = name.trim() === group.name.trim()

  const save = async () => {
    if (!name.trim() || unchanged || saving) return
    setSaving(true)
    setError(null)
    try {
      await messagingService.renameGroup(group.id, name.trim())
      onDone()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not rename the group'))
      setSaving(false)
    }
  }

  return (
    <ModalFrame title="Edit Group Name" icon={<Pencil size={15} className="text-[var(--color-cyan)]/70" />} onClose={onClose}>
      <div className="px-3 pt-3 pb-2">
        <input type="text" value={name} autoFocus maxLength={100}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save() }}
          placeholder="Group name…" className={INPUT_CLASS} />
      </div>
      {error && <p className="px-4 pb-2 ff-body text-xs text-red-400">{error}</p>}
      <div className="px-3 py-3 border-t border-white/[0.06]">
        <button type="button" onClick={save} disabled={!name.trim() || unchanged || saving} className={PRIMARY_CLASS}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Saving…' : 'Save name'}
        </button>
      </div>
    </ModalFrame>
  )
}

/** The creator's queue: approve or decline each add/remove request. */
function RequestsModal({ group, requests, onClose, onChanged }: {
  group: Group; requests: GroupMemberRequest[]; onClose: () => void; onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  const decide = async (r: GroupMemberRequest, approve: boolean) => {
    setBusyId(r.request_id)
    setError(null)
    try {
      await messagingService.decideGroupMemberRequest(group.id, r.request_id, approve)
      onChanged()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save your decision'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ModalFrame title="Member Requests" icon={<Inbox size={15} className="text-[var(--color-cyan)]/70" />} onClose={onClose}>
      <div className={`${LIST_CLASS} pt-2`}>
        {requests.length === 0 ? (
          <p className="ff-body text-white/25 text-xs text-center py-12">No requests waiting.</p>
        ) : requests.map(r => (
          <div key={r.request_id} className="px-3 py-3 rounded-xl flex flex-col gap-2 border-b border-white/[0.05] last:border-b-0">
            <p className="ff-body text-sm text-white/85 leading-snug">
              <span className="text-white">{r.requested_by.name}</span>
              {r.action === 'add' ? ' wants to add ' : ' wants to remove '}
              <span className="text-white">{r.target.name}</span>
              {r.action === 'add' ? ' to the group.' : ' from the group.'}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" disabled={busyId === r.request_id} onClick={() => void decide(r, true)}
                className="flex-1 py-1.5 rounded-lg bg-[var(--color-cyan)] text-[var(--color-bg)] ff-body text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5">
                {busyId === r.request_id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve
              </button>
              <button type="button" disabled={busyId === r.request_id} onClick={() => void decide(r, false)}
                className="flex-1 py-1.5 rounded-lg border border-white/10 ff-body text-xs text-white/70 hover:text-white disabled:opacity-50 flex items-center justify-center gap-1.5">
                <X size={12} /> Decline
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="px-4 pb-3 ff-body text-xs text-red-400">{error}</p>}
    </ModalFrame>
  )
}

export default function GroupOptionsModals({ view, group, currentUserId, requests = [], onClose, onChanged }: {
  view:          GroupOptionsView | null
  group:         Group
  currentUserId: string
  /** Pending add/remove requests; only the creator is given these. */
  requests?:     GroupMemberRequest[]
  onClose:       () => void
  /** Called after a rename or an invite, so the caller can reload the group. */
  onChanged:     () => void
}) {
  const done = () => { onChanged(); onClose() }
  const isCreator = group.created_by === currentUserId
  // Stays open after a removal, so several people can be removed in a row.
  if (view === 'members') return <MembersModal group={group} currentUserId={currentUserId} onClose={onClose} onChanged={onChanged} />
  if (view === 'add')     return <AddMembersModal group={group} isCreator={isCreator} onClose={onClose} onDone={done} />
  // Only the creator renames the group or decides requests.
  if (view === 'rename' && isCreator)   return <RenameModal group={group} onClose={onClose} onDone={done} />
  if (view === 'requests' && isCreator) return <RequestsModal group={group} requests={requests} onClose={onClose} onChanged={onChanged} />
  return null
}
