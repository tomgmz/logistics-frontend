'use client'

import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, MailCheck } from 'lucide-react'
import Pagination from '@/components/ui/Pagination'
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

/**
 * The pending-reset queue, shared by the Company Admin's User Management page and
 * the IT Admin's Administrator Management page.
 *
 * It takes no "which queue" prop: the API derives that from the caller's role, so
 * each admin sees only the requests they are allowed to act on (drivers and
 * clients for the Company Admin, staff for the IT Admin) and there is no way to
 * ask for the other one.
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

const PAGE_SIZE = 10

// Action buttons: live, or greyed out once the request has been decided.
const BTN_BASE =
  'flex h-7 3xl:h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-2 text-[12px] 3xl:text-[13px] font-bold ' +
  'transition active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100'

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
}) {
  // Sending a link is a create, dismissing a request an edit (user-management tier).
  const { canCreate, canEdit } = useModuleAccess()
  const [rows,          setRows]          = useState<PasswordResetRequest[]>([])
  const [loading,       setLoading]       = useState(true)
  const [busyId,        setBusyId]        = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  // The whole history is listed; decided rows keep their buttons, greyed out.
  const includeClosed = true
  const [page,          setPage]          = useState(1)
  const [pending,       setPending]       = useState<PendingAction | null>(null)

  // `quiet` re-reads in place (a live signal): no spinner, and a failed re-read
  // keeps the rows already on screen instead of replacing them with an error.
  const load = useCallback(async (closed: boolean, quiet = false) => {
    if (!quiet) {
      setLoading(true)
      setError(null)
    }
    try {
      setRows(await passwordResetService.list(closed))
    } catch (err) {
      if (!quiet) setError(getApiErrorMessage(err, 'Failed to load reset requests.'))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => { void load(includeClosed) }, [includeClosed, load])

  useLiveTable(['live:password_resets'], () => { void load(includeClosed, true) })

  // Two admins working the queue must not both send a link for one request:
  // the confirm dialog holds the request's lock, and a request someone else is
  // acting on shows their name instead of its buttons.
  const heldLocks = useRecordLocks('password_reset')
  const actionLock = useRecordLock({
    type:    'password_reset',
    id:      pending?.request.request_id ?? null,
    onStale: () => void load(includeClosed),
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
      await load(includeClosed)
    } catch {
      /* surfaced by the toast */
    } finally {
      setBusyId(null)
      setPending(null)
    }
  }

  // Anything an admin still has to act on, not just untouched requests.
  const pendingCount = rows.filter((r) => SENDABLE.includes(r.status)).length

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    // Only meaningful once a load has finished — reporting 0 from the empty
    // initial state would blank the badge the parent just seeded.
    if (!loading) onPendingCountChange?.(pendingCount)
  }, [loading, pendingCount, onPendingCountChange])

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0">
        {error && (
          <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400 shrink-0">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {/* Sized like the Users table. Desktop (lg+): fixed layout, a fixed-width
              actions column and five equal ones; phones and tablets: at least 960px
              wide, scrolling sideways. */}
          <table className="w-full max-lg:min-w-[960px] lg:min-w-[1080px] lg:table-fixed">
            <thead className={`sticky top-0 z-10 bg-[#1b1b1b] ${regularData ? 'font-[family-name:var(--font-alegreya-sc)]' : ''}`}>
              <tr className="border-b border-[#424242]">
                {['name', 'email', 'Role', 'Requested', 'Status', 'actions'].map((h, i) => (
                  <th
                    key={i}
                    className={`px-4 3xl:px-5 py-2 3xl:py-2.5 text-[11px] 3xl:text-[13px] font-bold lowercase text-[#818181] whitespace-nowrap ${
                      i === 5 ? 'text-right lg:w-[300px] 3xl:w-[340px]' : 'text-left'
                    }`}
                  >
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
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-20 text-center">
                    <div className="mb-4 inline-flex rounded-full border border-[#2a2a2a] bg-[#1b1b1b] p-4">
                      <MailCheck size={26} className="text-[#818181]" />
                    </div>
                    <p className="text-base font-semibold text-white">Nothing to action</p>
                    <p className="mt-1 text-sm text-[#818181]">
                      {includeClosed
                        ? 'No password reset requests on record.'
                        : 'No one is waiting on a password reset right now.'}
                    </p>
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
                      className={`border-b border-[#424242] transition-colors ${
                        isFocus ? 'bg-[#4df9ed]/[0.06]' : 'hover:bg-[#2a2a2a]/40'
                      }`}
                    >
                      <td className="px-4 3xl:px-5 py-2 3xl:py-2.5">
                        <p className="text-[13px] 3xl:text-[15px] font-bold text-[#4df9ed]">{fullName(r)}</p>
                      </td>
                      <td title={r.email} className="truncate px-4 3xl:px-5 py-2 3xl:py-2.5 text-[12px] 3xl:text-[14px] font-bold text-white">{r.email}</td>
                      <td className="px-4 3xl:px-5 py-2 3xl:py-2.5 text-[12px] 3xl:text-[14px] font-bold text-white">
                        {ROLE_LABELS[r.requested_role] ?? r.requested_role.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 3xl:px-5 py-2 3xl:py-2.5 text-[12px] 3xl:text-[14px] font-bold text-white whitespace-nowrap">
                        {requestedAt(r.created_at)}
                      </td>
                      <td className="px-4 3xl:px-5 py-2 3xl:py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`font-[family-name:var(--font-alegreya-sc)] inline-flex h-5 min-w-[58px] 3xl:h-[22px] 3xl:min-w-[64px] items-center justify-center whitespace-nowrap rounded-[15px] border-[0.5px] px-1.5 pb-0.5 text-[11px] 3xl:text-[13px] font-bold ${cfg.cls}`}>
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
                      <td className="pl-2 max-lg:pl-4 pr-4 3xl:pr-5 py-2 3xl:py-2.5">
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
        {!loading && rows.length > 0 && (
          <Pagination page={safePage} totalPages={totalPages} total={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
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
