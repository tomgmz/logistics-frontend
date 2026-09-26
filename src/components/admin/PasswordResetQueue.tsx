'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, KeyRound, MailCheck, RefreshCw, Send, X,
} from 'lucide-react'
import ReusableModal from '@/components/layout/ReusableModal'
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

const STATUS_CFG: Record<ResetRequestStatus, { label: string; cls: string }> = {
  pending:   { label: 'Awaiting link', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  sent:      { label: 'Link sent',     cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30'          },
  completed: { label: 'Reset done',    cls: 'bg-[#4df9ed]/15 text-[#4df9ed] border-[#4df9ed]/30'    },
  cancelled: { label: 'Cancelled',     cls: 'bg-[#818181]/10 text-[#818181] border-[#818181]/30'    },
  expired:   { label: 'Link expired',  cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
}

// Rows an admin can still issue a link for. 'expired' counts: the previous link
// timed out unused and the person behind it is still locked out.
const SENDABLE: ResetRequestStatus[] = ['pending', 'expired']
const CANCELLABLE: ResetRequestStatus[] = ['pending', 'sent', 'expired']



function fullName(r: PasswordResetRequest): string {
  return [r.first_name, r.last_name].filter(Boolean).join(' ') || '—'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
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
}: {
  // Set from ?request= on a notification deep-link, so the row the admin was
  // notified about is highlighted instead of lost in the list.
  focusRequestId?: string | null
  // Reports how many requests still need action, so the tab this panel lives
  // behind can carry the badge. The parent seeds its own count on mount (this
  // panel only mounts when its tab is open); this keeps that number honest once
  // the admin starts working through the queue.
  onPendingCountChange?: (count: number) => void
}) {
  const [rows,          setRows]          = useState<PasswordResetRequest[]>([])
  const [loading,       setLoading]       = useState(true)
  const [busyId,        setBusyId]        = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [includeClosed, setIncludeClosed] = useState(false)
  const [pending,       setPending]       = useState<PendingAction | null>(null)

  const load = useCallback(async (closed: boolean) => {
    setLoading(true)
    setError(null)
    try {
      setRows(await passwordResetService.list(closed))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load reset requests.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(includeClosed) }, [includeClosed, load])

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
          loading: kind === 'send' ? 'Sending reset link…' : 'Cancelling request…',
          success: kind === 'send'
            ? `Reset link sent to ${request.email}`
            : 'Request cancelled',
          error: (e) => getApiErrorMessage(
            e,
            kind === 'send' ? 'Failed to send reset link.' : 'Failed to cancel request.',
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

  useEffect(() => {
    // Only meaningful once a load has finished — reporting 0 from the empty
    // initial state would blank the badge the parent just seeded.
    if (!loading) onPendingCountChange?.(pendingCount)
  }, [loading, pendingCount, onPendingCountChange])

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[#2a2a2a] px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 text-sm text-white">
            <KeyRound size={14} className="text-[#4df9ed]" />
            <span className="font-semibold">Password Resets</span>
            {pendingCount > 0 && (
              <span className="rounded-full border border-yellow-500/30 bg-yellow-500/15 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">
                {pendingCount} awaiting
              </span>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-[#818181]">
            <input
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-[#4df9ed]"
            />
            Show history
          </label>

          <button
            onClick={() => void load(includeClosed)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-[#424242] px-3 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>

          <span className="ml-auto text-xs text-[#818181]">
            {rows.length} request{rows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400 shrink-0">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#1b1b1b]">
              <tr className="border-b border-[#2a2a2a]">
                {['User', 'Email', 'Role', 'Requested', 'Status', ''].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
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
                rows.map((r) => {
                  const cfg     = STATUS_CFG[r.status]
                  const isFocus = focusRequestId === r.request_id
                  const lockedBy = heldLocks.get(r.request_id)
                  const busy    = busyId === r.request_id || !!lockedBy
                  const left    = r.status === 'sent' ? minutesLeft(r.token_expires_at) : null

                  return (
                    <tr
                      key={r.request_id}
                      className={`border-b border-[#2a2a2a] transition-colors ${
                        isFocus ? 'bg-[#4df9ed]/[0.06]' : 'hover:bg-[#2a2a2a]/40'
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-white">{fullName(r)}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#818181]">{r.email}</td>
                      <td className="px-4 py-3.5 text-sm text-[#818181]">
                        {ROLE_LABELS[r.requested_role] ?? r.requested_role.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#818181]">
                        {relativeTime(r.created_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${cfg.cls}`}>
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
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <RecordLockBadge holder={lockedBy} />
                          {SENDABLE.includes(r.status) && (
                            <button
                              onClick={() => setPending({ kind: 'send', request: r })}
                              disabled={busy}
                              className="flex items-center gap-1.5 rounded-lg bg-[#4df9ed] px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5] active:scale-95 disabled:opacity-40"
                            >
                              <Send size={12} /> {r.status === 'expired' ? 'Send a new link' : 'Send reset link'}
                            </button>
                          )}
                          {CANCELLABLE.includes(r.status) && (
                            <button
                              onClick={() => setPending({ kind: 'cancel', request: r })}
                              disabled={busy}
                              title="Dismiss this request"
                              className="flex items-center gap-1.5 rounded-lg border border-[#424242] px-3 py-1.5 text-xs text-[#818181] transition hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
                            >
                              <X size={12} /> Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ReusableModal
        open={!!pending}
        title={
          pending?.kind !== 'send'
            ? 'Cancel this request?'
            : pending.request.status === 'expired'
              ? 'Send a new reset link?'
              : 'Send reset link?'
        }
        description={
          pending?.kind === 'send'
            ? `${pending.request.status === 'expired'
                 ? `The previous link expired unused. A fresh one will be emailed to ${pending.request.email}, and the old one stops working.`
                 : `A one-time reset link will be emailed to ${pending.request.email}.`
               } It works once and expires in 60 minutes. Their account unlocks only when they finish setting a new password.`
            : pending
              ? `${fullName(pending.request)} will not get a reset link. Any link already sent stops working, and they can request again from the sign-in screen.`
              : undefined
        }
        confirmLabel={
          pending?.kind !== 'send'
            ? 'Cancel request'
            : pending.request.status === 'expired' ? 'Send new link' : 'Send link'
        }
        onConfirm={() => { if (pending) void runAction(pending) }}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
