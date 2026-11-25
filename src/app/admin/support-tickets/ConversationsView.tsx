'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowUp, Bot, CheckCircle2, ChevronRight, Eye, Hand, ImagePlus, Loader2, Mail, MessagesSquare, Ticket, UserRound } from 'lucide-react'
import ReusableModal from '@/components/layout/ReusableModal'
import Dropdown from '@/components/ui/Dropdown'
import { FieldError, errorBorder } from '@/components/ui/FieldError'
import { TICKET_CATEGORY_LABEL, type TicketCategory } from '@/lib/services/support.service'
import TableEmptyState from '@/components/ui/TableEmptyState'
import SidePanel from '@/components/ui/SidePanel'
import { useModuleAccess, writeAccess } from '@/components/layout/ModuleAccess'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useServerTable } from '@/lib/hooks/useServerTable'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { useSupportConversationChannel } from '@/lib/hooks/useSupportChat'
import { useAuthStore } from '@/lib/store/auth.store'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { roleLabel } from '@/lib/roles'
import { formatDate, formatDateTime, formatTime } from '@/app/utils/timeFormat'
import Pagination from '@/components/ui/Pagination'
import FilterBar from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import { TruncatedText } from '@/components/ui/TruncatedText'
import { ORDER_LABELS, isReversed, orderField, orderRules } from '@/lib/table-order'
import MessagePhoto from '@/components/messaging/MessagePhoto'
import PhotoSendDialog, { MAX_PHOTO_BYTES } from '@/components/messaging/PhotoSendDialog'
import { useDiscardDraftGuard } from './useDiscardDraftGuard'
import {
  supportChatService, CHAT_STATUS_LABEL,
  type ChatDetail, type ChatMessage, type ChatStatus, type InboxStatus,
} from '@/lib/services/support-chat.service'

/**
 * Client conversations, the staff side (2026-11-22): what the help assistant
 * passed to the team, answered here by any Operations Manager or Company
 * Administrator (the client sees who). Waiting = the team owes a reply;
 * Team replied = the client does (reminder at 3 quiet days, closed at 7); Resolved; All (also
 * what the assistant answered alone). Replies the client misses for 15
 * minutes are emailed to them; their emailed answers land here marked "by email".
 *
 * Collisions, as Zendesk does it: the first to reply owns the conversation
 * ("Handled by …", Mine tab); others read it and "Take over" to reply;
 * "… is viewing" / "… is typing" show live; a reply sent after a colleague's
 * unseen reply asks to confirm first.
 */

const STATUS_TABS: { key: InboxStatus; label: string }[] = [
  { key: 'waiting',  label: 'Waiting for team' },
  { key: 'mine',     label: 'Mine' },
  { key: 'replied',  label: 'Team replied' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all',      label: 'All' },
]

const STATUS_STYLE: Record<ChatStatus, { color: string; border: string; bg: string }> = {
  assistant: { color: '#c4c4c4', border: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.04)' },
  waiting:   { color: '#FFEA00', border: 'rgba(255,234,0,0.35)', bg: 'rgba(255,234,0,0.08)' },
  replied:   { color: '#4DF9ED', border: 'rgba(77,249,237,0.35)', bg: 'rgba(77,249,237,0.08)' },
  resolved:  { color: '#3AF626', border: 'rgba(58,246,38,0.35)', bg: 'rgba(58,246,38,0.08)' },
}

function StatusBadge({ status }: { status: ChatStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ color: s.color, borderColor: s.border, background: s.bg }}>
      {CHAT_STATUS_LABEL[status]}
    </span>
  )
}

/** "12 min", "3 h", "2 days" since a time. */
function since(iso: string | null | undefined): string {
  if (!iso) return '—'
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return `${mins} min`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} days`
}

export default function ConversationsView({ switcher }: { switcher?: ReactNode }) {
  // Tickets tier: Read Only can read, not reply, resolve or open a ticket.
  const { canEdit } = useModuleAccess()
  const me = useAuthStore((s) => s.user)

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<InboxStatus>('waiting')
  // Oldest first is the queue order (longest waiting); newest first by default.
  const [sort,         setSort]         = useState<'desc' | 'asc'>('desc')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  // An unsent reply asks before the panel closes or another row opens.
  const draft = useDiscardDraftGuard()

  const table = useServerTable(
    (q) => supportChatService.inboxPage({ ...q, status: statusFilter, sort, ...(debouncedSearch && { search: debouncedSearch }) }),
    `${statusFilter}|${debouncedSearch}|${sort}`,
    { errorMessage: 'Could not load conversations. Please try again.', cacheKey: 'support-conversations' },
  )
  const { rows, loading, error, page, setPage, pageSize: PAGE_SIZE, total, totalPages } = table
  const load = table.reload
  useLiveTable(['live:support_conversations'], () => { void load(true) })
  const counts = table.meta?.counts ?? { waiting: 0, mine: 0, replied: 0, resolved: 0, all: 0 }

  const TH = 'px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]'
  const TD = 'px-4 md:px-6 py-4'

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
      <div className="flex flex-[1_0_auto] lg:flex-1 lg:min-h-0 lg:overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 lg:min-h-0 px-3 py-3 lg:px-4 gap-3 lg:overflow-hidden">
        {switcher}
        <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">
          <FilterBar
            layout="split"
            search={{ value: search, onChange: setSearch, placeholder: 'Search conversation, client or message' }}
            fields={[orderField(ORDER_LABELS.newest)]}
            values={orderRules(sort === 'asc')}
            onChange={(v) => setSort(isReversed(v) ? 'asc' : 'desc')}
            leading={
              <TabsMinimal
                label="Conversation status"
                items={STATUS_TABS.map(({ key, label }) => ({ id: key, label: `${label} (${counts[key]})` }))}
                selectedKey={statusFilter}
                onSelectionChange={setStatusFilter}
              />
            }
          />

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
              <p className="text-sm text-white/45">Loading conversations…</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <p className="text-red-400 text-sm text-center">{error}</p>
              <button type="button" onClick={() => void load()} className="text-[var(--color-cyan)] text-sm font-semibold">Try again</button>
            </div>
          ) : (
            <>
            <div className="flex flex-col flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto lg:min-h-0">
              <table className="data-table min-w-[960px]">
                <thead className="sticky top-0 z-10">
                  <tr className="h-11 border-b border-[#424242]">
                    {['Conversation', 'Question', 'Client', 'Latest', 'Waiting', 'Handled by', 'Status'].map((h) => (
                      <th key={h} className={TH}>{h}</th>
                    ))}
                    <th className={`${TH} w-12`}><span className="sr-only">open</span></th>
                  </tr>
                </thead>
                <tbody className="ff-regular">
                  {rows.map((c) => {
                    const isOpen = selectedId === c.conversation_id
                    const unread = (c.unread_count ?? 0) > 0
                    const open   = () => { if (!isOpen) draft.guard(() => setSelectedId(c.conversation_id)) }
                    return (
                      <tr
                        key={c.conversation_id}
                        role="button"
                        tabIndex={0}
                        onClick={open}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
                        className={`border-b border-[#424242] cursor-pointer transition-colors ${
                          isOpen ? 'bg-[rgba(77,249,237,0.06)]' : '[@media(hover:hover)]:hover:bg-[#222222]'
                        }`}
                      >
                        <td className={`${TD} whitespace-nowrap font-mono font-medium text-white`}>
                          <span className="inline-flex items-center gap-2">
                            {unread && <span className="h-2 w-2 rounded-full bg-[var(--color-cyan)]" aria-label="Unread" />}
                            {c.reference}
                          </span>
                        </td>
                        <td className={`${TD} max-w-[260px] truncate ${unread ? 'text-white font-semibold' : 'text-white'}`}><TruncatedText>{c.title || '—'}</TruncatedText></td>
                        <td className={TD}>
                          <p className="text-[#c4c4c4]">{c.company_name ?? '—'}</p>
                          {c.client_name && <p className="text-[#818181]">{c.client_name}</p>}
                        </td>
                        <td className={`${TD} max-w-[260px] truncate text-[#c4c4c4]`}>
                          <TruncatedText>{c.last_message ? `${c.last_message.author === 'client' ? '' : c.last_message.author === 'staff' ? 'Team: ' : 'Assistant: '}${c.last_message.content}` : '—'}</TruncatedText>
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>
                          <div className="text-white">{c.status === 'waiting' ? since(c.last_message_at) : '—'}</div>
                          <div className="text-[#818181]">{formatDate(c.last_message_at)} {formatTime(c.last_message_at)}</div>
                        </td>
                        <td className={`${TD} whitespace-nowrap ${c.assigned_to === me?.user_id ? 'text-[var(--color-cyan)]' : 'text-[#c4c4c4]'}`}>
                          {c.assigned_to ? (c.assigned_to === me?.user_id ? 'You' : c.assignee_name ?? 'A colleague') : <span className="text-[#818181]">Nobody yet</span>}
                        </td>
                        <td className={TD}>
                          <StatusBadge status={c.status} />
                        </td>
                        <td className={TD}><ChevronRight size={18} className="text-[#818181]" aria-hidden /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <TableEmptyState
                  icon={MessagesSquare}
                  filtered={counts.all > 0}
                  title={counts.all === 0 ? 'No conversations yet'
                    : statusFilter === 'waiting' && !search.trim() ? 'Nobody is waiting' : undefined}
                  message={counts.all === 0
                    ? 'When a client taps "Talk to our team" in the help assistant, the conversation appears here.'
                    : statusFilter === 'waiting' && !search.trim()
                      ? 'Every client who asked for the team has an answer.'
                      : 'No conversations match your search or filters.'}
                  onClear={() => { setSearch(''); setStatusFilter('all'); setSort('desc'); setPage(1) }}
                />
              )}
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={table.fetching} />
            </>
          )}
        </TableCard.Root>
      </div>

      <ConversationPanel
        id={selectedId}
        meId={me?.user_id}
        meName={`${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim() || 'A colleague'}
        canEdit={canEdit}
        onClose={() => draft.guard(() => setSelectedId(null))}
        onChanged={() => { void load(true) }}
        onDraftChange={draft.setDirty}
      />
      {draft.modal}
      </div>
    </div>
  )
}

function ConversationPanel({ id, meId, meName, canEdit, onClose, onChanged, onDraftChange }: {
  id: string | null; meId: string | undefined; meName: string; canEdit: boolean; onClose: () => void; onChanged: () => void
  /** True while the reply box shows unsent text, so closing asks first. */
  onDraftChange: (dirty: boolean) => void
}) {
  const [viewers,  setViewers]  = useState<{ user_id: string; name: string }[]>([])
  // A colleague replied after what was on screen: their reply is shown, yours waits.
  const [stale,    setStale]    = useState<string | null>(null)
  const [taking,   setTaking]   = useState(false)
  const [detail,  setDetail]  = useState<ChatDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [input,   setInput]   = useState('')
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [photo,   setPhoto]   = useState<File | null>(null)
  const [typingName, setTypingName] = useState<string | null>(null)
  const [resolving,  setResolving]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  const fetchDetail = useCallback(async (conversationId: string, quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const d = await supportChatService.inboxGet(conversationId)
      setDetail(d)
      void supportChatService.staffRead(conversationId).catch(() => {})
    } catch (e) {
      setError(getApiErrorMessage(e, 'This conversation could not be opened.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setDetail(null); setInput(''); setError(null); setTypingName(null); setStale(null); setViewers([])
    if (id) void fetchDetail(id)
  }, [id, fetchDetail])

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [detail?.messages.length, typingName])

  const { sendTyping } = useSupportConversationChannel({
    conversationId: id,
    userId: meId,
    presenceName: meName,
    onViewers: setViewers,
    onAssigned: () => { if (id) { void fetchDetail(id, true); onChanged() } },
    onMessage: (m: ChatMessage) => {
      if (!id) return
      // Names, photo links (made per reader) and the status come with a re-read.
      if (m.attachment_url || (m.author_id && !detail?.authors[m.author_id]) || m.author === 'system') { void fetchDetail(id, true); return }
      setTypingName(null)
      setDetail((d) => (d && !d.messages.some((x) => x.message_id === m.message_id)
        ? { ...d, messages: [...d.messages, m], status: m.author === 'client' ? 'waiting' : m.author === 'staff' ? 'replied' : d.status }
        : d))
      if (m.author === 'client') void supportChatService.staffRead(id).catch(() => {})
    },
    onTyping: (who, isTyping) => {
      if (!detail) return
      setTypingName(isTyping ? (who === detail.client_user_id ? (detail.client_name ?? 'The client') : (detail.authors[who]?.name ?? 'A colleague')) : null)
    },
  })

  async function send(content: string, attachmentUrl?: string, force = false) {
    if (!id || sending) return
    setSending(true)
    setError(null)
    try {
      const lastSeen = detail?.messages[detail.messages.length - 1]?.message_id ?? null
      await supportChatService.reply(id, {
        content, ...(attachmentUrl ? { attachment_url: attachmentUrl } : {}),
        last_seen_message_id: lastSeen, ...(force ? { force: true } : {}),
      })
      sendTyping(false)
      setInput('')
      setStale(null)
      await fetchDetail(id, true)
      onChanged()
    } catch (e) {
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'updated') { setStale(getApiErrorMessage(e, 'A colleague replied while you were writing.')); await fetchDetail(id, true) }
      else if (code === 'assigned') { setError(getApiErrorMessage(e, 'A colleague is handling this conversation.')); await fetchDetail(id, true) }
      else setError(getApiErrorMessage(e, 'The reply could not be sent. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  async function takeOver() {
    if (!id) return
    setTaking(true)
    try {
      await supportChatService.takeOver(id)
      appToast.success('You are handling this conversation now.', { action: 'support-chat-take-over', entityId: id })
      await fetchDetail(id, true)
      onChanged()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Could not take it over.'), { action: 'support-chat-take-over', entityId: id })
      await fetchDetail(id, true)
    } finally {
      setTaking(false)
    }
  }

  async function resolve() {
    if (!id) return
    setResolving(true)
    try {
      await supportChatService.resolve(id)
      appToast.success(`${detail?.reference ?? 'Conversation'} marked resolved. The client was told.`, { action: 'support-chat-resolve', entityId: id })
      await fetchDetail(id, true)
      onChanged()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Could not mark it resolved.'), { action: 'support-chat-resolve', entityId: id })
    } finally {
      setResolving(false)
    }
  }

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Only photos can be sent'); return }
    if (file.size > MAX_PHOTO_BYTES) { setError('Photos can be up to 10 MB'); return }
    setError(null)
    setPhoto(file)
  }

  const inAssistant = detail?.status === 'assistant'
  // Someone else owns it: read it, or take it over to reply.
  const ownedByOther = !!detail?.assigned_to && detail.assigned_to !== meId
  const [ticketOpen, setTicketOpen] = useState(false)
  // Only a reply the composer is showing counts as a draft.
  const hasDraft = !!id && !!detail && !inAssistant && !ownedByOther && input.trim().length > 0
  useEffect(() => { onDraftChange(hasDraft) }, [hasDraft, onDraftChange])

  return (
    <>
      <SidePanel
        open={!!id}
        onClose={onClose}
        label="Conversation"
        // Darker Grotesque, as in the client's chat (user 2026-11-22).
        className="ff-darker"
        title={detail ? `${detail.reference} · ${detail.company_name ?? 'Client'}` : 'Conversation'}
        subtitle={detail ? `${detail.client_name ?? ''}${detail.client_email ? ` · ${detail.client_email}` : ''}` : undefined}
        footer={detail && (
          // Same frame as the ticket panel's footer: padded, divider on top (user 2026-11-25).
          <div className="flex w-full shrink-0 flex-col gap-2 border-t border-white/[0.07] px-4 py-3">
            {stale && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#FFEA00]/30 bg-[#FFEA00]/[0.06] px-3 py-2 text-xs text-[#FFEA00]">
                <AlertTriangle size={13} /> <span className="flex-1">{stale}</span>
                <button type="button" onClick={() => { if (input.trim()) void send(input.trim(), undefined, true) }} {...writeAccess(canEdit && !!input.trim() && !sending)}
                  className="rounded-md border border-[#FFEA00]/40 px-2 py-1 font-semibold hover:bg-[#FFEA00]/10 disabled:opacity-40">Send anyway</button>
                <button type="button" onClick={() => setStale(null)} className="rounded-md px-2 py-1 text-white/60 hover:bg-white/5">Keep editing</button>
              </div>
            )}
            {inAssistant ? (
              <p className="text-xs text-white/45">The assistant answered this client; they didn&apos;t ask for the team, so there is nothing to reply to.</p>
            ) : ownedByOther ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60">
                <Hand size={13} /> <span className="flex-1">{detail.assignee_name ?? 'A colleague'} is handling this conversation. Take it over to reply.</span>
                <button type="button" onClick={() => void takeOver()} {...writeAccess(canEdit && !taking)}
                  className="rounded-md px-2.5 py-1 font-bold text-[#0a0a0a] disabled:opacity-40" style={{ background: 'var(--color-cyan)' }}>
                  {taking ? 'Taking over…' : 'Take over'}
                </button>
              </div>
            ) : (
              // Same composer as the client's help panel: one rounded box, photo
              // button and a round send button inside (user 2026-11-22).
              <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) void send(input.trim()) }}
                className={`flex items-end gap-2 rounded-2xl border border-white/10 bg-[#111] py-1.5 pl-3.5 pr-1.5 transition-colors focus-within:border-[var(--color-cyan)]/60 ${canEdit ? '' : 'opacity-50'}`}>
                <textarea
                  value={input}
                  onChange={(e) => { setInput(e.target.value); sendTyping(e.target.value.length > 0) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) void send(input.trim()) } }}
                  rows={1}
                  maxLength={4000}
                  placeholder={canEdit ? 'Reply to the client… (they see your name)' : 'Read Only: you can read this conversation'}
                  aria-label="Reply"
                  disabled={!canEdit}
                  className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-white outline-none [field-sizing:content] placeholder:text-white/30"
                />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                <button type="button" onClick={() => fileRef.current?.click()} aria-label="Send a photo" {...writeAccess(canEdit)}
                  className="mb-0.5 shrink-0 rounded-md p-1.5 text-white/40 hover:bg-white/5 hover:text-white/75 disabled:opacity-30">
                  <ImagePlus size={17} />
                </button>
                <button type="submit" aria-label="Send reply" {...writeAccess(canEdit && !!input.trim() && !sending)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-cyan)] text-[#0a0a0a] transition-colors disabled:bg-white/[0.06] disabled:text-white/30">
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} />}
                </button>
              </form>
            )}
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
            {/* The buttons share the full width, as on the ticket panel (user 2026-11-25). */}
            <div className="flex items-center gap-2 [&>*]:flex-1 [&>*]:justify-center">
              {/* Simple hand-off (2026-11-22): the ticket carries the conversation, which closes. */}
              {!detail.ticket_id && !inAssistant && (
                <button type="button" onClick={() => setTicketOpen(true)} {...writeAccess(canEdit)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">
                  <Ticket size={12} /> Turn into ticket
                </button>
              )}
              {detail.status !== 'resolved' && !inAssistant && (
                <button type="button" onClick={() => void resolve()} {...writeAccess(canEdit && !resolving)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-cyan)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--color-cyan)] hover:bg-[var(--color-cyan)]/10 disabled:cursor-not-allowed disabled:opacity-40">
                  {resolving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Mark resolved
                </button>
              )}
            </div>
          </div>
        )}
      >
        {loading || !detail ? (
          <p className="flex items-center gap-2 text-sm text-white/45"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
              <StatusBadge status={detail.status} />
              <span className={detail.assigned_to === meId ? 'text-[var(--color-cyan)]' : ''}>
                {detail.assigned_to ? `Handled by ${detail.assigned_to === meId ? 'you' : detail.assignee_name ?? 'a colleague'}` : 'Not handled by anyone yet'}
              </span>
              <span>· Started {formatDateTime(detail.created_at)}</span>
              {detail.handed_over_at && <span>· Asked for the team {formatDateTime(detail.handed_over_at)}</span>}
              {detail.ticket_reference && <span className="text-[#FF7A30]">· Continued as ticket {detail.ticket_reference}</span>}
            </div>
            {viewers.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-[#FFEA00]/80">
                <Eye size={12} /> {viewers.map((v) => v.name).join(', ')} {viewers.length === 1 ? 'is' : 'are'} viewing this conversation
              </p>
            )}
            {detail.messages.map((m) => <Bubble key={m.message_id} m={m} authors={detail.authors} clientName={detail.client_name} />)}
            {typingName && <p className="text-xs text-white/45">{typingName} is typing…</p>}
            <div ref={bottomRef} />
          </div>
        )}
      </SidePanel>

      <PhotoSendDialog file={photo} onCancel={() => setPhoto(null)} onSend={(url, caption) => { setPhoto(null); void send(caption, url) }} />

      {detail && (
        <TicketFromConversation
          open={ticketOpen}
          detail={detail}
          onClose={() => setTicketOpen(false)}
          onDone={() => { setTicketOpen(false); if (id) void fetchDetail(id, true); onChanged() }}
        />
      )}
    </>
  )
}

function Bubble({ m, authors, clientName }: { m: ChatMessage; authors: ChatDetail['authors']; clientName?: string | null }) {
  if (m.author === 'system') {
    return <p className="mx-auto max-w-[90%] rounded-lg bg-white/[0.04] px-3 py-2 text-center text-xs leading-snug text-white/55">{m.content}</p>
  }
  const mine   = m.author === 'staff'
  const a      = m.author_id ? authors[m.author_id] : undefined
  const who    = m.author === 'client' ? (clientName ?? 'Client')
    : m.author === 'assistant' ? 'Help assistant'
    : a ? `${a.name} · ${roleLabel(a.role)}` : 'Our team'
  return (
    <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      <p className="flex items-center gap-1 text-xs text-white/45">
        {m.author === 'assistant' ? <Bot size={11} /> : m.author === 'client' ? <UserRound size={11} /> : null}
        {who} · {formatTime(m.created_at)}
        {m.via === 'email' && <span className="inline-flex items-center gap-0.5"> · <Mail size={11} /> by email</span>}
        {m.meta?.ai && <span> · AI answer</span>}
      </p>
      <div className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        mine ? 'rounded-br-md bg-[var(--color-cyan)] text-[#0a0a0a]'
          : m.author === 'assistant' ? 'rounded-bl-md border border-white/10 bg-transparent text-white/70'
          : 'rounded-bl-md bg-white/[0.07] text-white/90'}`}>
        <MessagePhoto body={m.content} attachmentUrl={m.attachment_url} stamped={m.attachment_stamped} />
      </div>
    </div>
  )
}

/** "Turn into ticket": topic + subject; the ticket carries the conversation and is emailed to the client. */
function TicketFromConversation({ open, detail, onClose, onDone }: {
  open: boolean; detail: ChatDetail; onClose: () => void; onDone: () => void
}) {
  const [category, setCategory] = useState<TicketCategory>('other')
  const [subject,  setSubject]  = useState('')
  const [tried,    setTried]    = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [seen,     setSeen]     = useState<string | null>(null)
  // Fill the subject from the conversation each time it opens (adjust-state-on-prop pattern).
  if (open && seen !== detail.conversation_id) {
    setSeen(detail.conversation_id)
    setSubject((detail.title || '').slice(0, 150)); setCategory('other'); setTried(false); setError(null)
  }
  if (!open && seen !== null) setSeen(null)
  const subjectError = tried && subject.trim().length < 3 ? 'Add a short subject.' : undefined

  async function confirm() {
    setTried(true)
    if (subject.trim().length < 3) return
    setBusy(true)
    setError(null)
    try {
      const t = await supportChatService.toTicket(detail.conversation_id, { category, subject: subject.trim() })
      appToast.success(`Ticket ${t.reference} opened and emailed to the client; the conversation is closed.`, { action: 'support-chat-ticket', entityId: detail.conversation_id })
      onDone()
    } catch (e) {
      setError(getApiErrorMessage(e, 'The ticket could not be opened.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ReusableModal
      open={open}
      title="Turn into a ticket?"
      description="For something that needs a formal record. The ticket carries this whole conversation and is emailed to the client; replies continue by email. This conversation closes."
      confirmLabel={busy ? 'Opening…' : 'Open ticket'}
      cancelLabel="Cancel"
      disableBackdropClose={busy}
      onConfirm={() => { void confirm() }}
      onCancel={() => { if (!busy) onClose() }}
    >
      <div className="mt-3 flex flex-col gap-3 text-left">
        <label className="block">
          <span className="text-xs font-semibold text-white/60">Topic</span>
          <Dropdown value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-2.5 py-2 text-sm text-white outline-none">
            {(Object.keys(TICKET_CATEGORY_LABEL) as TicketCategory[]).map((c) => (
              <option key={c} value={c}>{TICKET_CATEGORY_LABEL[c]}</option>
            ))}
          </Dropdown>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-white/60">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} aria-invalid={!!subjectError}
            className={`mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-2.5 py-2 text-sm text-white outline-none focus:border-[var(--color-cyan)]/50 ${errorBorder(subjectError)}`} />
          <FieldError>{subjectError}</FieldError>
        </label>
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      </div>
    </ReusableModal>
  )
}
