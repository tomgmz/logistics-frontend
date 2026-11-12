'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftRight, Clock, Mail, ShieldCheck, UserPlus, UserX, XCircle } from 'lucide-react'
import ItAdminTransitionModal from '@/components/admin/ItAdminTransitionModal'
import ReusableModal from '@/components/layout/ReusableModal'
import { itAdminService, type ITAdminHandoverStatus, type StandinCandidate } from '@/lib/services/admin/user-management.service'
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
 * Stand-in (2026-11-06): the outgoing IT Admin names one Company Administrator.
 * If nobody has confirmed by the render target, that person takes over every
 * IT Administrator power and this account is archived. The stand-in then sees
 * this panel too (viewer 'standin'): add / resend / replace the new IT
 * Administrator, but not cancel or change the stand-in.
 */

function personName(p: { first_name: string | null; last_name: string | null; email: string }) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email
}
export default function ItAdminHandoverPanel() {
  const [status,  setStatus]  = useState<ITAdminHandoverStatus | null>(null)
  const [form,    setForm]    = useState<'start' | 'add' | null>(null)
  const [pending, setPending] = useState<PendingStep | null>(null)
  const [busy,    setBusy]    = useState(false)
  const [picking, setPicking] = useState(false)
  const [candidates, setCandidates] = useState<StandinCandidate[] | null>(null)
  const [choice,  setChoice]  = useState<string>('')

  async function openPicker(current: string | null) {
    setChoice(current ?? '')
    setPicking(true)
    if (!candidates) {
      try { setCandidates(await itAdminService.standinCandidates()) }
      catch (err) { appToast.error(extractApiError(err).message || 'Could not load the Company Administrators.'); setPicking(false) }
    }
  }

  async function saveStandin() {
    if (!choice) { appToast.error('Choose a Company Administrator.'); return }
    setPicking(false)
    setBusy(true)
    try {
      await itAdminService.setStandin(choice)
      appToast.success('Stand-in saved. They have been told.')
      load()
    } catch (err) {
      appToast.error(extractApiError(err).message || 'Could not save the stand-in.')
    } finally {
      setBusy(false)
    }
  }

  const load = useCallback(() => {
    itAdminService.handoverStatus().then(setStatus).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])
  // Live: the successor confirming or the stand-in changing shows at once.
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
      <ReusableModal
        open={picking}
        title="Stand-in after the render time"
        description="If no replacement has set their password by the render target, this Company Administrator takes over the IT Administrator's work, and your account is archived. A stand-in is required; you can change who it is until then."
        confirmLabel="Save"
        cancelLabel="Back"
        onCancel={() => setPicking(false)}
        onConfirm={() => { void saveStandin() }}
      >
        {candidates === null ? (
          <p className="text-[13px] text-[#818181]">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="text-[13px] text-[#818181]">There is no active Company Administrator to name.</p>
        ) : (
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-label="Company Administrator stand-in"
            className="w-full rounded-lg border border-[#424242] bg-[#1b1b1b] px-3 py-2.5 text-[14px] text-white focus:border-[#4df9ed] focus:outline-none"
          >
            <option value="" disabled>Choose a Company Administrator</option>
            {candidates.map((c) => (
              <option key={c.user_id} value={c.user_id}>{personName(c)} ({c.email})</option>
            ))}
          </select>
        )}
      </ReusableModal>
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
              Start the handover to begin your {status.render_days}-day render time and name the Company
              Administrator who stands in if nobody has taken over by then. Add your replacement now or later.
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
  const st            = h.standin ?? null
  const stName        = st ? personName(st) : null

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
              {isStandinView
                ? 'You are standing in as IT Administrator'
                : h.overdue
                  ? `Render time overdue since ${formatPh(h.render_due_at)}`
                  : `Render time: ${left <= 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`} (target ${formatPh(h.render_due_at)})`}
            </p>
            {isStandinView ? (
              s ? (
                <p>
                  Waiting for the new IT Administrator, <span className="text-white">{sName}</span> ({s.email}), to sign in and set a password.
                  {tempLeft !== null && (tempLeft > 0
                    ? ` Their temporary password expires in ${tempLeft} day${tempLeft === 1 ? '' : 's'}.`
                    : ' Their temporary password has expired: resend the sign-in email.')}
                  {' '}When they do, these pages go back to them.
                </p>
              ) : (
                <p>No new IT Administrator yet. Add them here once 8338 has hired one; you keep these pages until they set their password.</p>
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
                  ? <>If none has set a password by {formatPh(h.render_due_at)}, <span className="text-white">{stName}</span> takes over and your account is archived.</>
                  : 'Name a stand-in: a Company Administrator must take over if nobody has confirmed by the render target.'}
              </p>
            )}
            {!isStandinView && s && (
              <p className="text-[#818181]">
                {stName
                  ? <>Stand-in if they have not confirmed by the target: <span className="text-white/80">{stName}</span>.</>
                  : 'No stand-in named yet: name one so a Company Administrator takes over after the target.'}
              </p>
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
          {!isStandinView && (
            <button type="button" disabled={busy} onClick={() => { void openPicker(st?.user_id ?? null) }}
              className={`${BTN} border-[#818181] text-[#818181] [@media(hover:hover)]:hover:text-white`}>
              <ShieldCheck size={15} /> {st ? 'Change Stand-in' : 'Name a Stand-in'}
            </button>
          )}
          {!isStandinView && (
            <button type="button" disabled={busy} onClick={cancel}
              className={`${BTN} border-[#f62626]/60 text-[#f62626] [@media(hover:hover)]:hover:bg-[#f62626]/10`}>
              <XCircle size={15} /> Cancel Handover
            </button>
          )}
        </div>
      </div>
      {modals}
    </>
  )
}
