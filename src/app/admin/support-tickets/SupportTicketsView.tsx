'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ExternalLink, Mail, Search, Ticket } from 'lucide-react'

import { RemarksModal } from '@/components/layout/ReusableModal'
import { gmailComposeUrl, gmailThreadUrl } from '@/components/dashboard/SupportTicketsPanel'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/app/utils/timeFormat'
import {
  supportService, TICKET_CATEGORY_LABEL, type SupportTicket, type TicketCategory,
} from '@/lib/services/support.service'

import RefreshButton from '@/components/ui/RefreshButton'
import Pagination from '@/components/ui/Pagination'
/**
 * Tickets — the Company Administrator's full view of client support tickets.
 *
 * The dashboard only shows the oldest open few; this page has every ticket,
 * open and resolved, with the client's message, the help-assistant chat that
 * led to it and, once closed, who resolved it and the note the client got.
 * Answering still happens by email (Reply all in Gmail on the ticket thread),
 * then the ticket is marked resolved here, which emails the client the note.
 */

type StatusFilter = 'open' | 'resolved' | 'all'

const PAGE_SIZE = 15

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'open',     label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all',      label: 'All' },
]

function personName(p: { first_name: string | null; last_name: string | null } | null | undefined): string | null {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || null
}

function StatusBadge({ status }: { status: SupportTicket['status'] }) {
  const open = status === 'open'
  return (
    <span
      className={`inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${
        open
          ? 'text-amber-300 border-amber-400/35 bg-amber-400/10'
          : 'text-[var(--color-cyan)] border-[var(--color-cyan)]/35 bg-[rgba(77,249,237,0.08)]'
      }`}
    >
      {open ? 'Open' : 'Resolved'}
    </span>
  )
}

export default function SupportTicketsView() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [inbox,   setInbox]   = useState('')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [page,         setPage]         = useState(1)
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [resolving,    setResolving]    = useState<SupportTicket | null>(null)
  const [busy,         setBusy]         = useState(false)

  // Always read every ticket; the status filter is applied here so the counts
  // in the header stay right whichever tab is showing.
  const load = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true)
      setError(null)
      const res = await supportService.list('all')
      setTickets(res.tickets)
      setInbox(res.inbox)
    } catch (e) {
      if (!quiet) setError(getApiErrorMessage(e, 'Could not load tickets. Please try again.'))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useLiveTable(['live:support_tickets'], () => { void load(true) })

  const counts = useMemo(() => {
    let open = 0
    for (const t of tickets) if (t.status === 'open') open++
    return { open, resolved: tickets.length - open }
  }, [tickets])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (!q) return true
      return [
        t.reference,
        t.subject,
        t.message,
        t.clients?.company_name,
        personName(t.opener),
        t.opener?.email,
        t.bookings?.reference_number,
        TICKET_CATEGORY_LABEL[t.category],
      ].some((v) => v?.toLowerCase().includes(q))
    })
    // Open tickets oldest first (who has waited longest); otherwise newest first.
    return rows.sort((a, b) => (statusFilter === 'open'
      ? a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at)))
  }, [tickets, search, statusFilter])

  // A new search or filter starts again from the first page.
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  async function resolve(note: string) {
    if (!resolving) return
    setBusy(true)
    try {
      await supportService.resolve(resolving.ticket_id, note)
      appToast.success(`${resolving.reference} marked resolved. The client was emailed your note.`, {
        action: 'support-resolve', entityId: resolving.ticket_id,
      })
      setResolving(null)
      await load(true)
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Could not mark the ticket resolved.'), {
        action: 'support-resolve', entityId: resolving.ticket_id,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden ff-sc bg-[var(--color-bg)]">
      <header className="shrink-0 px-3 py-3 lg:px-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Tickets</h1>
          <p className="text-xs text-white/40 mt-0.5">
            Client support tickets · {counts.open} open · {counts.resolved} resolved
          </p>
        </div>
        <RefreshButton onClick={() => void load()} className="self-start sm:self-auto" />
      </header>

      <div className="flex flex-1 min-h-0 flex-col p-3 lg:p-4 gap-3 overflow-hidden">
        <div className="flex flex-col xl:flex-row gap-2 xl:items-center shrink-0">
          <div className="flex items-center gap-2 rounded-[10px] px-3 py-2 flex-1 max-w-md" style={{ background: '#2a2828' }}>
            <Search size={16} className="text-white/40 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket, client, subject, booking…"
              className="bg-transparent border-none outline-none text-sm flex-1 text-white/80 placeholder:text-white/35"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/35 self-center mr-1">Status</span>
            {STATUS_FILTERS.map(({ key, label }) => {
              const active = statusFilter === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors"
                  style={{
                    background:  active ? 'rgba(77,249,237,0.12)' : 'transparent',
                    borderColor: active ? 'rgba(77,249,237,0.35)' : 'rgba(255,255,255,0.08)',
                    color:       active ? 'var(--color-cyan)' : '#888',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-xl border border-white/[0.08] overflow-hidden flex flex-col bg-[#0f0f0f]">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-cyan)' }} />
              <p className="text-sm text-white/45">Loading tickets…</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <p className="text-red-400 text-sm text-center">{error}</p>
              <button type="button" onClick={() => void load()} className="text-[var(--color-cyan)] text-sm font-semibold">
                Try again
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
              <Ticket size={40} className="text-white/20" />
              <p className="text-sm text-white/45">
                {tickets.length === 0
                  ? 'No client has raised a ticket yet.'
                  : statusFilter === 'open' && !search.trim()
                    ? 'No open tickets.'
                    : 'No tickets match your filters.'}
              </p>
            </div>
          ) : (
            <>
            <ul className="overflow-auto flex-1 min-h-0 divide-y divide-white/[0.05]">
              {pageRows.map((t) => {
                const isOpen   = expanded === t.ticket_id
                const opener   = personName(t.opener)
                const resolver = personName(t.resolver)
                const compose  = t.opener?.email && inbox
                  ? gmailComposeUrl(inbox, t.opener.email, `[${t.reference}] ${t.subject}`)
                  : null
                return (
                  <li key={t.ticket_id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : t.ticket_id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <span className="font-mono font-bold text-white/80">{t.reference}</span>
                          <span className="ml-2 text-white">{t.subject}</span>
                        </p>
                        <p className="truncate text-[11px] text-white/45 mt-0.5">
                          {[
                            t.clients?.company_name ?? opener,
                            TICKET_CATEGORY_LABEL[t.category as TicketCategory] ?? t.category,
                            t.bookings?.reference_number,
                            formatDateTime(t.created_at),
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                      <ChevronDown size={16} className={`shrink-0 text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="px-3.5 pb-4 flex flex-col gap-3 text-xs">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-white/60">
                          <div><dt className="inline text-white/35">Client: </dt><dd className="inline">{t.clients?.company_name ?? '—'}</dd></div>
                          <div><dt className="inline text-white/35">Raised by: </dt><dd className="inline">{[opener, t.opener?.email].filter(Boolean).join(' · ') || '—'}</dd></div>
                          <div><dt className="inline text-white/35">Category: </dt><dd className="inline">{TICKET_CATEGORY_LABEL[t.category] ?? t.category}</dd></div>
                          <div><dt className="inline text-white/35">Booking: </dt><dd className="inline">{t.bookings?.reference_number ?? '—'}</dd></div>
                        </dl>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-white/35 mb-1">Message</p>
                          <p className="whitespace-pre-wrap rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-white/80">{t.message}</p>
                        </div>

                        {t.chat_transcript && t.chat_transcript.length > 0 && (
                          <details className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                            <summary className="cursor-pointer text-white/55">Help assistant chat before the ticket ({t.chat_transcript.length} messages)</summary>
                            <ul className="mt-2 flex flex-col gap-1.5 ff-chat">
                              {t.chat_transcript.map((line, i) => (
                                <li key={i} className={line.from === 'client' ? 'text-white/80' : 'text-white/45'}>
                                  <span className="font-bold">{line.from === 'client' ? 'Client' : 'Assistant'}:</span> {line.text}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}

                        {t.status === 'resolved' && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-white/35 mb-1">
                              Resolved{resolver ? ` by ${resolver}` : ''}{t.resolved_at ? ` · ${formatDateTime(t.resolved_at)}` : ''}
                            </p>
                            <p className="whitespace-pre-wrap rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-white/70">
                              {t.resolution_note || 'No note was added.'}
                            </p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {inbox && (
                            <a
                              href={gmailThreadUrl(inbox, t.reference)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Opens the ${t.reference} thread in ${inbox}. Use Reply all so your answer reaches the client in the same thread.`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/5"
                            >
                              <ExternalLink size={12} /> {t.status === 'open' ? 'Reply all in Gmail' : 'Open thread in Gmail'}
                            </a>
                          )}
                          {compose && t.status === 'open' && (
                            <a
                              href={compose}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`New email to ${t.opener?.email}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/5"
                            >
                              <Mail size={12} /> New email
                            </a>
                          )}
                          {t.status === 'open' && (
                            <button
                              type="button"
                              onClick={() => setResolving(t)}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#0a0a0a]"
                              style={{ background: 'var(--color-cyan)' }}
                            >
                              <CheckCircle2 size={12} /> Mark resolved
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            <Pagination page={safePage} totalPages={totalPages} total={visible.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            </>
          )}
        </div>
      </div>

      <RemarksModal
        open={!!resolving}
        title={resolving ? `Resolve ${resolving.reference}?` : 'Resolve ticket?'}
        description="The client is emailed that the ticket is resolved, with this note. Answer them first in Gmail (Reply all on the ticket email) if you haven't."
        remarksLabel="Note to the client"
        remarksPlaceholder="e.g. We corrected the drop-off address on your booking."
        confirmLabel={busy ? 'Saving…' : 'Mark resolved'}
        cancelLabel="Cancel"
        busy={busy}
        disableBackdropClose={busy}
        onConfirm={(note) => { void resolve(note) }}
        onCancel={() => { if (!busy) setResolving(null) }}
      />
    </div>
  )
}
