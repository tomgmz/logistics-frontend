'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import { Fragment, useState } from 'react'
import { CheckCircle2, ChevronDown, ExternalLink, Mail, Ticket } from 'lucide-react'

import { RemarksModal } from '@/components/layout/ReusableModal'
import { MailAction, gmailComposeUrl, gmailThreadUrl } from '@/components/dashboard/SupportTicketsPanel'
import { useModuleAccess, writeAccess } from '@/components/layout/ModuleAccess'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { formatDate, formatDateTime, formatTime } from '@/app/utils/timeFormat'
import {
  supportService, TICKET_CATEGORY_LABEL, type SupportTicket, type TicketCategory,
} from '@/lib/services/support.service'

import Pagination from '@/components/ui/Pagination'
import { useServerTable } from '@/lib/hooks/useServerTable'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import FilterBar from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
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
  // Tickets tier: Read Only sees the reply and resolve actions, disabled.
  const { canEdit } = useModuleAccess()
  const [inbox,   setInbox]   = useState('')

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const debouncedSearch = useDebouncedValue(search.trim())
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [resolving,    setResolving]    = useState<SupportTicket | null>(null)
  const [busy,         setBusy]         = useState(false)

  // Server-side pages: the server applies the tab and search, counts every
  // ticket for the header, and sends only the rows on screen.
  const table = useServerTable(
    async (q) => {
      const res = await supportService.listPage({
        ...q,
        status: statusFilter,
        ...(debouncedSearch && { search: debouncedSearch }),
      })
      setInbox(res.inbox)
      return res
    },
    `${statusFilter}|${debouncedSearch}`,
    { errorMessage: 'Could not load tickets. Please try again.' },
  )
  const { rows: tickets, loading, error, page, setPage, pageSize: PAGE_SIZE, total, totalPages } = table
  const load = table.reload
  useLiveTable(['live:support_tickets'], () => { void load(true) })

  const counts = table.meta?.counts ?? { all: 0, open: 0, resolved: 0 }

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

  const TH = 'px-4 md:px-6 py-2 text-left text-xs font-semibold whitespace-nowrap text-[#818181]'
  const TD = 'px-4 md:px-6 py-4'

  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 lg:px-4 gap-6 lg:overflow-hidden">
        <div className="shrink-0">
          <p className="text-xs text-[#818181]">
            Client support tickets · {counts.open} open · {counts.resolved} resolved
          </p>
        </div>

        {/* Untitled UI's table card, as on Reports and Audit Logs: the header
            (title + count), then the filter row with the status tabs on the
            left (a dropdown on phones), search and Refresh. */}
        <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">
          <FilterBar
            layout="split"
            search={{ value: search, onChange: setSearch, placeholder: 'Search ticket, client, subject or booking' }}
            leading={
              <TabsMinimal
                label="Ticket status"
                items={STATUS_FILTERS.map(({ key, label }) => ({
                  id: key,
                  label: `${label} (${counts[key]})`,
                }))}
                selectedKey={statusFilter}
                onSelectionChange={setStatusFilter}
              />
            }
          />

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
          ) : tickets.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
              <Ticket size={40} className="text-white/20" />
              <p className="text-sm text-white/45">
                {counts.all === 0
                  ? 'No client has raised a ticket yet.'
                  : statusFilter === 'open' && !search.trim()
                    ? 'No open tickets.'
                    : 'No tickets match your filters.'}
              </p>
              {/* Clearing shows every ticket, resolved ones too. */}
              <ClearFiltersLink
                show={counts.all > 0}
                onClear={() => { setSearch(''); setStatusFilter('all'); setPage(1) }}
                className="mt-0"
              />
            </div>
          ) : (
            <>
            <div className="flex-[1_0_auto] lg:flex-1 overflow-x-auto lg:overflow-auto lg:min-h-0">
              <table className="data-table min-w-[960px]">
                <thead className="sticky top-0 z-10">
                  <tr className="h-11 border-b border-[#424242]">
                    {['Ticket', 'Subject', 'Client', 'Category', 'Booking', 'Raised', 'Status'].map((h) => (
                      <th key={h} className={TH}>{h}</th>
                    ))}
                    <th className={`${TH} w-12`}><span className="sr-only">open</span></th>
                  </tr>
                </thead>
                {/* Headers keep the small caps face; the data rows are regular Alegreya Sans. */}
                <tbody className="ff-regular">
                  {tickets.map((t) => {
                    const isOpen   = expanded === t.ticket_id
                    const opener   = personName(t.opener)
                    const resolver = personName(t.resolver)
                    const compose  = t.opener?.email && inbox
                      ? gmailComposeUrl(inbox, t.opener.email, `[${t.reference}] ${t.subject}`)
                      : null
                    const toggle = () => setExpanded(isOpen ? null : t.ticket_id)
                    return (
                      <Fragment key={t.ticket_id}>
                        <tr
                          role="button"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          onClick={toggle}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
                          className={`border-b border-[#424242] cursor-pointer transition-colors ${
                            isOpen ? 'bg-[rgba(77,249,237,0.06)]' : '[@media(hover:hover)]:hover:bg-[#222222]'
                          }`}
                        >
                          <td className={`${TD} whitespace-nowrap font-mono font-medium text-white`}>{t.reference}</td>
                          <td className={`${TD} max-w-[280px] truncate text-white`}>{t.subject}</td>
                          <td className={TD}>
                            <p className="text-[#c4c4c4]">{t.clients?.company_name ?? '—'}</p>
                            {opener && <p className="text-[#818181]">{opener}</p>}
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>{TICKET_CATEGORY_LABEL[t.category as TicketCategory] ?? t.category}</td>
                          <td className={`${TD} whitespace-nowrap`}>{t.bookings?.reference_number ?? '—'}</td>
                          <td className={`${TD} whitespace-nowrap`}>
                            <div className="text-white">{formatDate(t.created_at)}</div>
                            <div className="text-[#818181]">{formatTime(t.created_at)}</div>
                          </td>
                          <td className={`${TD} font-[family-name:var(--font-alegreya-sc)]`}><StatusBadge status={t.status} /></td>
                          <td className={TD}>
                            <ChevronDown size={18} className={`text-[#818181] transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                          </td>
                        </tr>

                        {isOpen && (
                          <tr className="border-b border-[#424242] bg-[#141414]">
                            <td colSpan={8} className="px-4 md:px-6 py-4">
                              {/* Pinned to the left edge so it stays in view while a phone slides the table. */}
                              <div className="sticky left-0 flex flex-col gap-3 text-xs max-w-[calc(100vw-3.5rem)] lg:max-w-4xl">
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-white/60">
                                  <div><dt className="inline text-white/35">Client: </dt><dd className="inline">{t.clients?.company_name ?? '—'}</dd></div>
                                  <div><dt className="inline text-white/35">Raised by: </dt><dd className="inline">{[opener, t.opener?.email].filter(Boolean).join(' · ') || '—'}</dd></div>
                                  <div><dt className="inline text-white/35">Category: </dt><dd className="inline">{TICKET_CATEGORY_LABEL[t.category] ?? t.category}</dd></div>
                                  <div><dt className="inline text-white/35">Booking: </dt><dd className="inline">{t.bookings?.reference_number ?? '—'}</dd></div>
                                  <div className="sm:col-span-2"><dt className="inline text-white/35">Subject: </dt><dd className="inline">{t.subject}</dd></div>
                                  <div><dt className="inline text-white/35">Raised: </dt><dd className="inline">{formatDateTime(t.created_at)}</dd></div>
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
                                  {/* Replying is a write; reading a resolved thread is not. */}
                                  {inbox && (
                                    <MailAction
                                      href={gmailThreadUrl(inbox, t.reference)}
                                      title={`Opens the ${t.reference} thread in ${inbox}. Use Reply all so your answer reaches the client in the same thread.`}
                                      allowed={canEdit || t.status !== 'open'}
                                    >
                                      <ExternalLink size={12} /> {t.status === 'open' ? 'Reply all in Gmail' : 'Open thread in Gmail'}
                                    </MailAction>
                                  )}
                                  {compose && t.status === 'open' && (
                                    <MailAction href={compose} title={`New email to ${t.opener?.email}`} allowed={canEdit}>
                                      <Mail size={12} /> New email
                                    </MailAction>
                                  )}
                                  {t.status === 'open' && (
                                    <button
                                      type="button"
                                      onClick={() => setResolving(t)}
                                      {...writeAccess(canEdit)}
                                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-40"
                                      style={{ background: 'var(--color-cyan)' }}
                                    >
                                      <CheckCircle2 size={12} /> Mark resolved
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={table.fetching} />
            </>
          )}
        </TableCard.Root>
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
