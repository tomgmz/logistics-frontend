'use client'

import { useState, type ReactNode } from 'react'
import { CheckCircle2, ExternalLink, Mail, Ticket } from 'lucide-react'

import { RemarksModal } from '@/components/layout/ReusableModal'
import { READ_ONLY_HINT, writeAccess } from '@/components/layout/ModuleAccess'
import { useAuthStore } from '@/lib/store/auth.store'
import { moduleFlags } from '@/lib/permissions'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { formatDateTime } from '@/app/utils/timeFormat'
import { supportService, TICKET_CATEGORY_LABEL, type TicketCategory } from '@/lib/services/support.service'
import type { DashboardTicket } from '@/lib/services/admin/staff-dashboard.service'

/**
 * Client support tickets waiting on a reply, oldest first: the queue the help
 * assistant feeds. Answered by email, in Gmail on the web (a `mailto:` link only
 * works where a desktop mail program is set up, which is why the old "Reply by
 * email" did nothing for staff who use Gmail in the browser):
 *   Open in Gmail  the ticket's thread in the support inbox — press REPLY ALL
 *                  there. The ticket email went to the client with the inbox
 *                  CC'd, so Reply all reaches the client inside the thread they
 *                  already have (plain Reply would only address the inbox)
 *   New email      a Gmail compose window to the client, ticket ref in the subject
 * Then marked resolved here, which emails the client the note.
 */

/** Gmail URLs, opened in the support inbox's account (`authuser`). */
export function gmailThreadUrl(inbox: string, reference: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(inbox)}#search/${encodeURIComponent(`"${reference}"`)}`
}
export function gmailComposeUrl(inbox: string, to: string, subject: string): string {
  const q = new URLSearchParams({ authuser: inbox, view: 'cm', fs: '1', to, su: subject })
  return `https://mail.google.com/mail/?${q.toString()}`
}
/**
 * A Gmail action (Reply all / New email). A link can't be disabled, so a Read
 * Only Tickets tier gets a look-alike that does nothing, with the hint.
 */
export function MailAction({ href, title, allowed, children }: {
  href:     string
  title:    string
  allowed:  boolean
  children: ReactNode
}) {
  const cls = 'inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/5'
  if (!allowed) {
    return (
      <span role="link" aria-disabled="true" title={READ_ONLY_HINT} className={`${cls} cursor-not-allowed opacity-40 hover:bg-transparent`}>
        {children}
      </span>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={cls}>
      {children}
    </a>
  )
}

export default function SupportTicketsPanel({
  count, items, inbox, onChanged,
}: {
  count:     number
  items:     DashboardTicket[]
  /** The support inbox (a Gmail address) the tickets were sent to. */
  inbox:     string
  onChanged: () => void
}) {
  const [resolving, setResolving] = useState<DashboardTicket | null>(null)
  const [busy,      setBusy]      = useState(false)
  // The dashboard is not the Tickets module's own page, so read its tier directly.
  const user    = useAuthStore((s) => s.user)
  const allowed = moduleFlags(user, 'support-tickets').can_edit

  async function resolve(note: string) {
    if (!resolving) return
    setBusy(true)
    try {
      await supportService.resolve(resolving.ticket_id, note)
      appToast.success(`${resolving.reference} marked resolved. The client was emailed your note.`, {
        action: 'support-resolve', entityId: resolving.ticket_id,
      })
      setResolving(null)
      onChanged()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Could not mark the ticket resolved.'), {
        action: 'support-resolve', entityId: resolving.ticket_id,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="support-tickets" className="scroll-mt-4 rounded-xl border border-white/[0.08] bg-[var(--color-surface)]">
      <header className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Ticket size={14} className="text-[var(--color-cyan)]" /> Client support tickets
        </h2>
        <span className="text-[11px] tabular-nums text-white/40">{count} open</span>
      </header>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-3.5 py-6 text-xs text-white/40">
          <CheckCircle2 size={14} className="text-[var(--color-cyan)]" /> No open tickets.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {items.map((t) => {
            const compose = t.email ? gmailComposeUrl(inbox, t.email, `[${t.reference}] ${t.subject}`) : null
            return (
              <li key={t.ticket_id} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs">
                    <span className="font-mono font-bold text-white/80">{t.reference}</span>
                    <span className="ml-2 text-white">{t.subject}</span>
                  </p>
                  <p className="truncate text-[11px] text-white/45">
                    {[t.client, TICKET_CATEGORY_LABEL[t.category as TicketCategory] ?? t.category, t.booking, formatDateTime(t.created_at)]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <MailAction
                    href={gmailThreadUrl(inbox, t.reference)}
                    title={`Opens the ${t.reference} thread in ${inbox}. Use Reply all so your answer reaches the client in the same thread.`}
                    allowed={allowed}
                  >
                    <ExternalLink size={12} /> Reply all in Gmail
                  </MailAction>
                  {compose && (
                    <MailAction href={compose} title={`New email to ${t.email}`} allowed={allowed}>
                      <Mail size={12} /> New email
                    </MailAction>
                  )}
                  <button
                    type="button"
                    onClick={() => setResolving(t)}
                    {...writeAccess(allowed)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--color-cyan)' }}
                  >
                    <CheckCircle2 size={12} /> Mark resolved
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <RemarksModal
        open={!!resolving}
        title={resolving ? `Resolve ${resolving.reference}?` : 'Resolve ticket?'}
        description="The client is emailed that the ticket is resolved, with this note. Answer them first in Gmail (Reply all on the ticket email) if you haven't."
        remarksLabel="Note to the client"
        remarksPlaceholder="e.g. We corrected the drop-off address on your booking."
        confirmLabel={busy ? 'Saving…' : 'Mark resolved'}
        busy={busy}
        onConfirm={(note) => { void resolve(note) }}
        onCancel={() => { if (!busy) setResolving(null) }}
      />
    </section>
  )
}
