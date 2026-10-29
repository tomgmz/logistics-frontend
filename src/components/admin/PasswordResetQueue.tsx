'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useEffect, useState } from 'react'
import { AlertTriangle, MailCheck } from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
import FilterBar, { type FilterValues } from '@/components/ui/FilterBar'
import type { DateRange } from '@/components/ui/untitled/date-range-picker'
import ReusableModal from '@/components/layout/ReusableModal'
import { useModuleAccess } from '@/components/layout/ModuleAccess'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { useRecordLock, useRecordLocks } from '@/lib/hooks/useRecordLock'
import { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import {
  passwordResetService,
  type PasswordResetRequest,
  type ResetRequestStatus,
} from '@/lib/services/admin/password-reset.service'
import { useServerTable } from '@/lib/hooks/useServerTable'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'

/**
 * The pending-reset queue on the IT Admin's User Management page. Since
 * 2026-10-24 the IT Admin handles every reset (staff, clients and drivers); the
 * API derives the queue from the caller's role, so nobody else gets one.
 * First in, first out: the API returns the longest-waiting request first.
 */

const ROLE_LABELS: Record<string, string> = {
  admin:              'Company Administrator',
  it_admin:           'IT Administrator',
  general_manager:    'General Manager',
  fleet_manager:      'Fleet Manager',
  operations_manager: 'Operations Manager',
  driver:             'Driver',
  client:             'Client',
}

// Status pills as the Figma draws them (node 3144:1276).
const STATUS_CFG: Record<ResetRequestStatus, { label: string; cls: string }> = {
  pending:   { label: 'Awaiting Link', cls: 'bg-[#ffea00]/20 text-[#ffea00] border-[#ffea00]'     },
  sent:      { label: 'Link Sent',     cls: 'bg-[#4df9ed]/10 text-[#4df9ed] border-[#4df9ed]'     },
  completed: { label: 'Reset Done',    cls: 'bg-[#3af626]/10 text-[#3af626] border-[#3af626]'     },
  cancelled: { label: 'Rejected',      cls: 'bg-[#f62626]/[0.13] text-[#f62626] border-[#f62626]' },
  expired:   { label: 'Link Expired',  cls: 'bg-[#ff7a30]/10 text-[#ff7a30] border-[#ff7a30]'     },
}

// Rows an admin can still issue a link for. 'expired' counts: the previous link
// timed out unused and the person behind it is still locked out.
const SENDABLE: ResetRequestStatus[] = ['pending', 'expired']
// Only an untouched request can be rejected. Once a link has gone out the
// decision stands (the API refuses too), so Reject stays disabled from then on.
const CANCELLABLE: ResetRequestStatus[] = ['pending']

// Rows per page: 10 on a phone, 20 on anything wider (the user's call, 2026-10-25).

const STATUS_OPTIONS = (Object.keys(STATUS_CFG) as ResetRequestStatus[])
  .map((s) => ({ value: s, label: STATUS_CFG[s].label }))

// Every role that can ask for a reset, listed even before any of them has. Company
// drivers reset by email link; vendor drivers have no password (passkey only), and
// the IT Administrator resets their own by emailed code, so neither is here.
const ROLE_OPTIONS = ['client', 'driver', 'admin', 'general_manager', 'operations_manager', 'fleet_manager']
  .map((r) => ({ value: r, label: ROLE_LABELS[r] }))

// "Requested" is one window at a time, counted back from now.
/** The request's day on this device's calendar, inside the picked range (inclusive). */
const REQUESTED_OPTIONS = [
  { value: '1d',  label: 'Last 24 hours' },
  { value: '7d',  label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

// Action buttons: live, or greyed out once the request has been decided.
// Figma 3234:1681: 28px, 10px corners, bold small caps.
const BTN_BASE =
  'ff-sc flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-2 3xl:px-2.5 text-[13px] 3xl:text-[15px] font-bold transition disabled:cursor-not-allowed'

function fullName(r: PasswordResetRequest): string {
  return [r.first_name, r.last_name].filter(Boolean).join(' ') || '—'
}

/** "Oct 22, 2026, 9:41 AM" in Philippine time. */
function requestedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/** Minutes left on a sent link, or null once it is past due. */
function minutesLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null
  const left = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000)
  return left > 0 ? left : null
}

type PendingAction =
  | { kind: 'send';   request: PasswordResetRequest }
  | { kind: 'cancel'; request: PasswordResetRequest }

export default function PasswordResetQueue({
  focusRequestId,
  onPendingCountChange,
  regularData = false,
  cardHeader = false,
}: {
  // Set from ?request= on a notification deep-link, so the row the admin was
  // notified about is highlighted instead of lost in the list.
  focusRequestId?: string | null
  // Reports how many requests still need action, so the tab this panel lives
  // behind can carry the badge. The parent seeds its own count on mount (this
  // panel only mounts when its tab is open); this keeps that number honest once
  // the admin starts working through the queue.
  onPendingCountChange?: (count: number) => void
  // Small-caps headers over regular Alegreya Sans cells (User Management's look).
  regularData?: boolean
  // Untitled UI's table-card header (title + count) and its split filter row:
  // search, Filters (Status, Role, Requested) and Refresh on the right.
  cardHeader?: boolean
}) {
  // Sending a link is a create, dismissing a request an edit (user-management tier).
  const { canCreate, canEdit } = useModuleAccess()
  const [busyId,        setBusyId]        = useState<string | null>(null)
  const [pending,       setPending]       = useState<PendingAction | null>(null)
  const [search,        setSearch]        = useState('')
  const [filters,       setFilters]       = useState<FilterValues>([])
  // The card layout's "Select dates": the day the request came in.
  const [dateRange,     setDateRange]     = useState<DateRange | null>(null)

  // The whole history is listed (decided rows keep their buttons, greyed out),
  // one server page at a time: filters, search and the pending count are
  // worked out on the server (10 rows on phones, 20 from tablet up).
  const debouncedSearch = useDebouncedValue(search.trim())
  const table = useServerTable(
    (q) => passwordResetService.listPage({
      ...q,
      ...(filters.length   && { filters: JSON.stringify(filters) }),
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(dateRange       && { from: dateRange.from, to: dateRange.to }),
    }),
    `${JSON.stringify(filters)}|${debouncedSearch}|${dateRange?.from ?? ''}|${dateRange?.to ?? ''}`,
    { errorMessage: 'Failed to load reset requests.' },
  )
  const { rows: pageRows, loading, error, page, setPage, pageSize, total, totalPages } = table

  useLiveTable(['live:password_resets'], () => { void table.reload(true) })

  // Two admins working the queue must not both send a link for one request:
  // the confirm dialog holds the request's lock, and a request someone else is
  // acting on shows their name instead of its buttons.
  const heldLocks = useRecordLocks('password_reset')
  const actionLock = useRecordLock({
    type:    'password_reset',
    id:      pending?.request.request_id ?? null,
    onStale: () => void table.reload(),
  })
  useEffect(() => {
    if (actionLock.status !== 'locked' || !pending) return
    appToast.info(`${actionLock.holderName ?? 'Another admin'} is already handling this request.`, {
      action: 'password-reset-locked', entityId: pending.request.request_id,
    })
    setPending(null)
  }, [actionLock.status, actionLock.holderName, pending])

  async function runAction(action: PendingAction) {
    const { kind, request } = action
    setBusyId(request.request_id)
    try {
      await appToast.promise(
        kind === 'send'
          ? passwordResetService.send(request.request_id)
          : passwordResetService.cancel(request.request_id),
        {
          loading: kind === 'send' ? 'Sending reset link…' : 'Rejecting request…',
          success: kind === 'send'
            ? `Reset link sent to ${request.email}`
            : 'Request rejected',
          error: (e) => getApiErrorMessage(
            e,
            kind === 'send' ? 'Failed to send reset link.' : 'Failed to reject request.',
          ),
        },
        { action: `password-reset-${kind}`, entityId: request.request_id },
      )
      await table.reload()
    } catch {
      /* surfaced by the toast */
    } finally {
      setBusyId(null)
      setPending(null)
    }
  }

  // Anything an admin still has to act on, not just untouched requests (counted by the server).
  const pendingCount = table.meta?.pendingCount ?? 0
  const unfiltered   = table.meta?.unfiltered ?? 0

  useEffect(() => {
    // Only meaningful once a load has finished — reporting 0 from the empty
    // initial state would blank the badge the parent just seeded.
    if (!loading) onPendingCountChange?.(pendingCount)
  }, [loading, pendingCount, onPendingCountChange])

  return (
    <>
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">
        <FilterBar
          layout={cardHeader ? 'split' : 'inline'}
          search={{ value: search, onChange: setSearch, placeholder: 'Search name or email' }}
          fields={[
            { key: 'status',    label: 'Status',    options: STATUS_OPTIONS },
            { key: 'role',      label: 'Role',      options: ROLE_OPTIONS },
            // The card layout picks dates with "Select dates" instead.
            ...(cardHeader ? [] : [{ key: 'requested', label: 'Requested', options: REQUESTED_OPTIONS, single: true, anyLabel: 'Any time' }]),
          ]}
          dateRange={cardHeader ? { value: dateRange, onChange: setDateRange } : undefined}
          values={filters}
          onChange={setFilters}
          // Untitled UI's "Dropdowns" filter bar: Status, Role and Requested each their own dropdown.
          variant="dropdowns"
          summary={!cardHeader && <span className="text-[#4df9ed]">{total} Request{total !== 1 ? 's' : ''}</span>}
          className={regularData ? 'ff-regular' : ''}
        />
        {error && (
          <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400 shrink-0">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Table */}
        <div className="flex-[1_0_auto] lg:flex-1 overflow-auto lg:min-h-0">
          {/* Sized like the Users table. Desktop (lg+): fixed layout, a fixed-width
              actions column and five equal ones; phones and tablets: at least 960px
              wide, scrolling sideways. */}
          <table className="data-table max-lg:min-w-[960px] lg:min-w-[1080px] lg:table-fixed">
            <thead className="sticky top-0 z-10">
              <tr>
                {['name', 'email', 'Role', 'Requested', 'Status', 'actions'].map((h, i) => (
                  <th key={i} className={i === 5 ? 'text-right lg:w-[300px] 3xl:w-[340px]' : 'text-left'}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`max-lg:whitespace-nowrap ${regularData ? 'ff-regular' : ''}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#4df9ed]" />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-20 text-center">
                    <div className="mb-4 inline-flex rounded-full border border-[#2a2a2a] bg-[#1b1b1b] p-4">
                      <MailCheck size={26} className="text-[#818181]" />
                    </div>
                    <p className="text-base font-semibold text-white">{unfiltered > 0 ? 'No records found' : 'Nothing to action'}</p>
                    <p className="mt-1 text-sm text-[#818181]">
                      {unfiltered > 0
                        ? 'No requests match your search or filters.'
                        : 'No password reset requests on record.'}
                    </p>
                    <ClearFiltersLink
                      show={unfiltered > 0}
                      onClear={() => { setSearch(''); setFilters([]); setDateRange(null); setPage(1) }}
                      className="mt-4"
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const cfg     = STATUS_CFG[r.status]
                  const isFocus = focusRequestId === r.request_id
                  const lockedBy = heldLocks.get(r.request_id)
                  const busy    = busyId === r.request_id || !!lockedBy
                  const left    = r.status === 'sent' ? minutesLeft(r.token_expires_at) : null

                  return (
                    <tr
                      key={r.request_id}
                      className={`transition-colors ${
                        isFocus ? 'bg-[#4df9ed]/[0.06]' : '[@media(hover:hover)]:hover:bg-[#2a2a2a]/40'
                      }`}
                    >
                      {/* Figma 3234:1681: the name white, the rest grey. */}
                      <td><p className="t-name text-white">{fullName(r)}</p></td>
                      <td title={r.email} className="truncate text-[#818181]">{r.email}</td>
                      <td className="text-[#818181]">
                        {ROLE_LABELS[r.requested_role] ?? r.requested_role.replace(/_/g, ' ')}
                      </td>
                      <td className="text-[#818181] whitespace-nowrap">
                        {requestedAt(r.created_at)}
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <span className={`t-badge min-w-[90px] 3xl:min-w-[102px] ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                          {r.status === 'sent' && left !== null && (
                            <span className="text-[10px] text-[#818181]">expires in {left}m</span>
                          )}
                          {(r.status === 'expired' || (r.status === 'sent' && left === null)) && (
                            <span className="text-[10px] text-orange-400/70">
                              never used — send a new link
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {/* Desktop gives this column a fixed width (set on its header) so both
                            buttons sit on one line; the other five share the rest equally. */}
                        <div className="flex flex-nowrap items-center justify-end gap-1.5">
                          <RecordLockBadge holder={lockedBy} />
                          {canCreate && (() => {
                            const live  = SENDABLE.includes(r.status) && !busy
                            const label = r.status === 'expired' ? 'Send a new link'
                              : r.status === 'sent' || r.status === 'completed' ? 'Reset link Sent'
                              : 'Send reset link'
                            return (
                              <button
                                type="button"
                                onClick={() => setPending({ kind: 'send', request: r })}
                                disabled={!live}
                                className={`${BTN_BASE} ${live
                                  ? 'bg-[#4df9ed] text-black hover:bg-[#7bfbf5]'
                                  : 'border border-[#424242] text-[#424242]'}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={live ? '/icons/password-reset/send.svg' : '/icons/password-reset/send-disabled.svg'} alt="" width={16} height={16} draggable={false} />
                                {label}
                              </button>
                            )
                          })()}
                          {canEdit && (() => {
                            const live = CANCELLABLE.includes(r.status) && !busy
                            return (
                              <button
                                type="button"
                                onClick={() => setPending({ kind: 'cancel', request: r })}
                                disabled={!live}
                                title={live ? 'Reject this request' : undefined}
                                className={`${BTN_BASE} border ${live
                                  ? 'border-[#818181] text-[#818181] hover:border-[#f62626] hover:text-[#f62626]'
                                  : 'border-[#424242] text-[#424242]'}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={live ? '/icons/password-reset/reject.svg' : '/icons/password-reset/reject-disabled.svg'} alt="" width={16} height={16} draggable={false} />
                                Reject
                              </button>
                            )
                          })()}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && total > 0 && (
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} disabled={table.fetching} />
        )}
      </div>

      <ReusableModal
        open={!!pending}
        title={
          pending?.kind !== 'send'
            ? 'Reject this request?'
            : pending.request.status === 'expired'
              ? 'Send a new reset link?'
              : 'Send reset link?'
        }
        description={
          pending?.kind === 'send'
            ? `${pending.request.status === 'expired'
                 ? `The previous link expired unused. A fresh one will be emailed to ${pending.request.email}, and the old one stops working.`
                 : `A one-time reset link will be emailed to ${pending.request.email}.`
               } It works once and expires 60 minutes after it is sent. Once sent, this request can no longer be rejected.`
            : pending
              ? `${fullName(pending.request)} will not get a reset link, and this cannot be undone. They can request again from the sign-in screen.`
              : undefined
        }
        confirmLabel={
          pending?.kind !== 'send'
            ? 'Reject request'
            : pending.request.status === 'expired' ? 'Send new link' : 'Send link'
        }
        onConfirm={() => { if (pending) void runAction(pending) }}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
