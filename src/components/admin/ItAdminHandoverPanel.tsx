'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Clock, Mail, ShieldAlert, UserPlus, UserX, XCircle } from 'lucide-react'
import ItAdminTransitionModal from '@/components/admin/ItAdminTransitionModal'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'
import { itAdminService, type ITAdminHandoverStatus } from '@/lib/services/admin/user-management.service'
import { extractApiError } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import { useLiveTable } from '@/lib/hooks/useLiveTable'

/** A moment as a Manila date, e.g. "Nov 23, 2026, 3:15 PM". */
function formatPh(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function daysBetween(fromMs: number, iso: string) {
  return Math.ceil((new Date(iso).getTime() - fromMs) / 86_400_000)
}

interface PendingStep {
  title:        string
  description:  string
  confirmLabel: string
  run:          () => Promise<unknown>
  success:      string
}

const BTN =
  'flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ' +
  'transition-colors active:scale-[0.98] sm:w-auto disabled:opacity-40'

/**
 * The IT Admin's handover, on their dashboard (2026-10-25), one state at a time:
 *
 *   holding the role   → Start handover (the replacement now, or later)
 *   rendering, no one  → render target / overdue, Add your replacement, Cancel
 *   replacement added  → waiting for them to set a password, Resend, Replace, Cancel
 *
 * When the replacement sets their password the handover ends and this account
 * is archived and signed out, so there is no "done" state to draw.
 *
 * The General Manager (2026-11-27; it was a named Company Administrator before)
 * handles the handover whenever the IT Administrator is not there: the same
 * panel on their dashboard (`forGm`, viewer 'standin') from the first day, with
 * add / resend / replace but not start or cancel. If nobody has confirmed by
 * the render target, they take over every IT Administrator power and the
 * outgoing account is archived. Nobody is chosen: there is one General Manager.
 *
 * Emergency takeover (2026-11-27): with nothing open, the General Manager's
 * panel shows the IT Administrator on record and **Take Over IT Administrator**
 * (a reason, then the IT Administrator is emailed and has the waiting period to
 * cancel), or **Add the IT Administrator** when there is none at all. During the
 * wait the IT Administrator's own panel says so, with Cancel Handover.
 */

function ago(iso: string | null) {
  if (!iso) return 'never signed in'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'last signed in today' : `last signed in ${days} day${days === 1 ? '' : 's'} ago`
}

const SEAT_STATUS: Record<string, string> = {
  active: 'Active', permanently_locked: 'Locked', deactivated: 'Deactivated',
}

function personName(p: { first_name: string | null; last_name: string | null; email: string }) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email
}
export default function ItAdminHandoverPanel({ forGm = false }: { forGm?: boolean }) {
  const [status,  setStatus]  = useState<ITAdminHandoverStatus | null>(null)
  const [form,    setForm]    = useState<'start' | 'add' | 'seat' | null>(null)
  const [takeover, setTakeover] = useState(false)
  const [pending, setPending] = useState<PendingStep | null>(null)
  const [busy,    setBusy]    = useState(false)

  // A failed read says so instead of leaving the dashboard silently without the
  // panel (it hid a 403 on 2026-11-27).
  const [failed, setFailed] = useState(false)
  const load = useCallback(() => {
    itAdminService.handoverStatus()
      .then((s) => { setStatus(s); setFailed(false) })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => { load() }, [load])
  // Live: the successor confirming shows at once.
  useLiveTable(['live:users'], load)

  async function runStep(step: PendingStep) {
    setPending(null)
    setBusy(true)
    try {
      await step.run()
      appToast.success(step.success)
      load()
    } catch (err) {
      appToast.error(extractApiError(err).message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return failed ? (
      <p role="alert" className="rounded-[10px] border border-[#f62626]/40 bg-[#f62626]/[0.07] px-4 py-3 text-[13px] text-[#f62626]">
        Could not load the IT Administrator handover. Refresh the page to try again.
      </p>
    ) : null
  }
  const h = status.handover
  const waitDays = status.emergency_wait_days ?? 3

  const modals = (
    <>
      <ItAdminTransitionModal
        open={form !== null}
        mode={form ?? 'start'}
        renderDays={status.render_days}
        forGm={status.viewer === 'standin'}
        onClose={() => setForm(null)}
        onDone={load}
      />
      <ReusableModal
        open={!!pending}
        title={pending?.title ?? ''}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        cancelLabel="Back"
        onCancel={() => setPending(null)}
        onConfirm={() => { if (pending) void runStep(pending) }}
      />
      {takeover && (
        <RemarksModal
          open
          tone="danger"
          title="Take over the IT Administrator role?"
          description={`Use this only when the IT Administrator cannot be reached. They are emailed and notified now and have ${waitDays} days to cancel. If they don't, you get the IT Administrator pages, can add the new IT Administrator, and their account is closed. The Company Administrators are told.`}
          remarksLabel="Reason"
          remarksPlaceholder="e.g. No reply by phone or email since Nov 20; not reporting to the office."
          minRemarks={10}
          minRemarksMessage="Give a reason of at least 10 characters. It goes on the audit record and in the email."
          confirmLabel="Take Over"
          busy={busy}
          onCancel={() => setTakeover(false)}
          onConfirm={(reason) => {
            setTakeover(false)
            void runStep({
              title: '', description: '', confirmLabel: '',
              run:     () => itAdminService.startTakeover(reason),
              success: `Takeover requested. The IT Administrator was emailed and has ${waitDays} days to cancel.`,
            })
          }}
        />
      )}
    </>
  )

  // General Manager, nothing open: who holds the seat, and the emergency way in.
  if (forGm && !h) {
    const seat = status.seat ?? null
    return (
      <>
        <div className="flex flex-col gap-3 rounded-[10px] border border-[#424242] bg-[#1b1b1b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[13px] leading-relaxed">
            {seat ? (
              <>
                <p className="font-semibold text-white">
                  IT Administrator: {personName(seat)}{' '}
                  <span className="font-normal text-[#818181]">({SEAT_STATUS[seat.status] ?? seat.status}, {ago(seat.last_login_at)})</span>
                </p>
                <p className="text-[#818181]">
                  Can&apos;t reach them? Take over the role: they are emailed and have {waitDays} days to cancel; then you
                  get the IT Administrator pages and can add the new one.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-[#ff7a30]">Nobody is the IT Administrator right now.</p>
                <p className="text-[#818181]">Add the new IT Administrator. They are emailed a temporary password.</p>
              </>
            )}
          </div>
          {seat ? (
            <button type="button" disabled={busy} onClick={() => setTakeover(true)}
              className={`${BTN} border-[#ff7a30] text-[#ff7a30] [@media(hover:hover)]:hover:bg-[#ff7a30]/10`}>
              <ShieldAlert size={15} /> Take Over IT Administrator
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => setForm('seat')}
              className={`${BTN} border-[#4df9ed] text-[#4df9ed] [@media(hover:hover)]:hover:bg-[#4df9ed]/10`}>
              <UserPlus size={15} /> Add the IT Administrator
            </button>
          )}
        </div>
        {modals}
      </>
    )
  }

  // Holding the role, no handover.
  if (!h) {
    return (
      <>
        <div className="flex flex-col gap-3 rounded-[10px] border border-[#424242] bg-[#1b1b1b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[13px] leading-relaxed">
            <p className="font-semibold text-white">Leaving the role?</p>
            <p className="text-[#818181]">
              Start the handover to begin your {status.render_days}-day render time. Add your replacement now or
              later. The General Manager handles it while you are away, and takes over if nobody has by then.
            </p>
          </div>
          <button type="button" onClick={() => setForm('start')}
            className={`${BTN} border-[#4df9ed] text-[#4df9ed] [@media(hover:hover)]:hover:bg-[#4df9ed]/10`}>
            Start Handover <ArrowLeftRight size={15} />
          </button>
        </div>
        {modals}
      </>
    )
  }

  const now      = Date.now()
  const left     = daysBetween(now, h.render_due_at)
  const s        = h.successor
  const sName    = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email : null
  const tempLeft = s?.temp_password_expires_at ? daysBetween(now, s.temp_password_expires_at) : null

  const isStandinView = status.viewer === 'standin'
  const standinActive = !!h.standin_active
  const st            = h.standin ?? null
  const stName        = st ? personName(st) : null
  // A General Manager takeover still inside its waiting period.
  const waiting       = !!h.emergency && !standinActive

  const cancel = () => setPending(isStandinView
    ? {
        title:        'Withdraw the takeover request?',
        description:  'The IT Administrator keeps the role and is told you withdrew it.',
        confirmLabel: 'Withdraw Request',
        run:          () => itAdminService.cancelHandover(),
        success:      'Takeover request withdrawn.',
      }
    : {
        title:        h.emergency ? 'Stop the takeover?' : 'Cancel the handover?',
        description:  s
          ? `${sName}'s account is archived and you remain the IT Administrator.`
          : h.emergency
            ? 'You remain the IT Administrator, and the General Manager is told you answered.'
            : 'You remain the IT Administrator. Your render time stops.',
        confirmLabel: h.emergency ? "I'm Still Here" : 'Cancel Handover',
        run:          () => itAdminService.cancelHandover(),
        success:      'Cancelled. You remain the IT Administrator.',
      })

  return (
    <>
      <div role="status"
        className={`flex flex-col gap-3 rounded-[10px] border px-4 py-3 ${
          h.overdue ? 'border-[#ff7a30]/50 bg-[#ff7a30]/[0.07]' : 'border-[#ffea00]/40 bg-[#ffea00]/[0.07]'
        }`}>
        <div className="flex items-start gap-3">
          <Clock size={16} className={`mt-0.5 shrink-0 ${h.overdue ? 'text-[#ff7a30]' : 'text-[#ffea00]'}`} />
          <div className="min-w-0 text-[13px] leading-relaxed text-white/80">
            <p className={`font-semibold ${h.overdue ? 'text-[#ff7a30]' : 'text-[#ffea00]'}`}>
              {waiting
                ? isStandinView
                  ? `Takeover requested: the IT Administrator can cancel until ${formatPh(h.render_due_at)}`
                  : `The General Manager asked to take over your role on ${formatPh(h.render_due_at)}`
                : isStandinView
                ? standinActive
                  ? 'You are standing in as IT Administrator'
                  : `The IT Administrator is leaving: target ${formatPh(h.render_due_at)}`
                : h.overdue
                  ? `Render time overdue since ${formatPh(h.render_due_at)}`
                  : `Render time: ${left <= 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`} (target ${formatPh(h.render_due_at)})`}
            </p>
            {waiting && (
              <p>
                <span className="text-[#818181]">Reason: </span>{h.reason}
              </p>
            )}
            {waiting && (
              <p className="text-[#818181]">
                {isStandinView
                  ? 'They were emailed and notified. If they do not cancel, you get the IT Administrator pages then and can add the new IT Administrator.'
                  : "If you are still here, choose I'm Still Here. Otherwise the General Manager takes over then and your account is closed."}
              </p>
            )}
            {!waiting && isStandinView && !standinActive && (
              <p className="text-[#818181]">
                You handle this handover whenever the IT Administrator is not there. If nobody has set their password by
                the target, you take over the IT Administrator&apos;s work until the new one starts.
              </p>
            )}
            {waiting ? null : isStandinView ? (
              s ? (
                <p>
                  Waiting for the new IT Administrator, <span className="text-white">{sName}</span> ({s.email}), to sign in and set a password.
                  {tempLeft !== null && (tempLeft > 0
                    ? ` Their temporary password expires in ${tempLeft} day${tempLeft === 1 ? '' : 's'}.`
                    : ' Their temporary password has expired: resend the sign-in email.')}
                  {' '}{standinActive ? 'When they do, these pages go back to them.' : 'When they do, the handover ends.'}
                </p>
              ) : (
                <p>{standinActive
                  ? 'No new IT Administrator yet. Add them here once 8338 has hired one; you keep these pages until they set their password.'
                  : 'No replacement added yet. Add them here once 8338 has hired one.'}</p>
              )
            ) : s ? (
              <p>
                Waiting for <span className="text-white">{sName}</span> ({s.email}) to sign in and set a password.
                {tempLeft !== null && (tempLeft > 0
                  ? ` Their temporary password expires in ${tempLeft} day${tempLeft === 1 ? '' : 's'}.`
                  : ' Their temporary password has expired: resend the sign-in email.')}
                {' '}When they do, your account is archived and signed out.
              </p>
            ) : (
              <p>
                No replacement yet.{' '}
                {stName
                  ? <>If none has set a password by {formatPh(h.render_due_at)}, the General Manager, <span className="text-white">{stName}</span>, takes over and your account is archived.</>
                  : 'There is no active General Manager to take over after the target; until there is, your account stays open.'}
              </p>
            )}
            {!waiting && !isStandinView && s && (
              <p className="text-[#818181]">
                {stName
                  ? <>If they have not confirmed by the target, the General Manager takes over: <span className="text-white/80">{stName}</span>.</>
                  : 'There is no active General Manager to take over after the target.'}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {waiting && isStandinView ? null : s ? (
            <>
              <button type="button" disabled={busy}
                onClick={() => setPending({
                  title:        `Resend ${sName}'s sign-in email?`,
                  description:  'A new temporary password is emailed to them (valid 7 days). The old one stops working.',
                  confirmLabel: 'Resend Email',
                  run:          () => itAdminService.resendSuccessor(),
                  success:      `A new sign-in email was sent to ${s.email}.`,
                })}
                className={`${BTN} border-[#4df9ed] text-[#4df9ed] [@media(hover:hover)]:hover:bg-[#4df9ed]/10`}>
                <Mail size={15} /> Resend Sign-in Email
              </button>
              <button type="button" disabled={busy}
                onClick={() => setPending({
                  title:        `Replace ${sName}?`,
                  description:  isStandinView
                    ? 'Their account is archived before they confirm, so you can add a different IT Administrator.'
                    : 'Their account is archived before they confirm, so you can add a different replacement. Your render time keeps running.',
                  confirmLabel: 'Replace',
                  run:          () => itAdminService.replaceSuccessor(),
                  success:      'Replacement removed. Add a different one when ready.',
                })}
                className={`${BTN} border-[#818181] text-[#818181] [@media(hover:hover)]:hover:text-white`}>
                <UserX size={15} /> Replace
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => setForm('add')}
              className={`${BTN} border-[#4df9ed] text-[#4df9ed] [@media(hover:hover)]:hover:bg-[#4df9ed]/10`}>
              <UserPlus size={15} /> {isStandinView ? 'Add the New IT Administrator' : 'Add Your Replacement'}
            </button>
          )}
          {(!isStandinView || waiting) && (
            <button type="button" disabled={busy} onClick={cancel}
              className={`${BTN} border-[#f62626]/60 text-[#f62626] [@media(hover:hover)]:hover:bg-[#f62626]/10`}>
              <XCircle size={15} /> {isStandinView ? 'Withdraw Request' : h.emergency ? "I'm Still Here" : 'Cancel Handover'}
            </button>
          )}
        </div>
      </div>
      {modals}
    </>
  )
}
