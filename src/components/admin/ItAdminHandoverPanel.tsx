'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Clock, Mail, UserPlus, UserX, XCircle } from 'lucide-react'
import ItAdminTransitionModal from '@/components/admin/ItAdminTransitionModal'
import ReusableModal from '@/components/layout/ReusableModal'
import { itAdminService, type ITAdminHandoverStatus } from '@/lib/services/admin/user-management.service'
import { extractApiError } from '@/lib/api-error'
import { appToast } from '@/lib/toast'

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
 */
export default function ItAdminHandoverPanel() {
  const [status,  setStatus]  = useState<ITAdminHandoverStatus | null>(null)
  const [form,    setForm]    = useState<'start' | 'add' | null>(null)
  const [pending, setPending] = useState<PendingStep | null>(null)
  const [busy,    setBusy]    = useState(false)

  const load = useCallback(() => {
    itAdminService.handoverStatus().then(setStatus).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

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

  if (!status) return null
  const h = status.handover

  const modals = (
    <>
      <ItAdminTransitionModal
        open={form !== null}
        mode={form ?? 'start'}
        renderDays={status.render_days}
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
    </>
  )

  // Holding the role, no handover.
  if (!h) {
    return (
      <>
        <div className="flex flex-col gap-3 rounded-[10px] border border-[#424242] bg-[#1b1b1b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[13px] leading-relaxed">
            <p className="font-semibold text-white">Leaving the role?</p>
            <p className="text-[#818181]">
              Start the handover to begin your {status.render_days}-day render time. Add your replacement
              now or once you have one; you stay the IT Administrator until they set their password.
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

  const cancel = () => setPending({
    title:        'Cancel the handover?',
    description:  s
      ? `${sName}'s account is archived and you remain the IT Administrator. Your render time stops.`
      : 'You remain the IT Administrator. Your render time stops.',
    confirmLabel: 'Cancel Handover',
    run:          () => itAdminService.cancelHandover(),
    success:      'Handover cancelled. You remain the IT Administrator.',
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
              {h.overdue
                ? `Render time overdue since ${formatPh(h.render_due_at)}`
                : `Render time: ${left <= 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`} (target ${formatPh(h.render_due_at)})`}
            </p>
            {s ? (
              <p>
                Waiting for <span className="text-white">{sName}</span> ({s.email}) to sign in and set a password.
                {tempLeft !== null && (tempLeft > 0
                  ? ` Their temporary password expires in ${tempLeft} day${tempLeft === 1 ? '' : 's'}.`
                  : ' Their temporary password has expired: resend the sign-in email.')}
                {' '}When they do, your account is archived and signed out.
              </p>
            ) : (
              <p>No replacement yet. You stay the IT Administrator until one is added and sets their password.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {s ? (
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
                  description:  'Their account is archived before they confirm, so you can add a different replacement. Your render time keeps running.',
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
              <UserPlus size={15} /> Add Your Replacement
            </button>
          )}
          <button type="button" disabled={busy} onClick={cancel}
            className={`${BTN} border-[#f62626]/60 text-[#f62626] [@media(hover:hover)]:hover:bg-[#f62626]/10`}>
            <XCircle size={15} /> Cancel Handover
          </button>
        </div>
      </div>
      {modals}
    </>
  )
}
