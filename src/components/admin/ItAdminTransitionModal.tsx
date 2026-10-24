'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ShieldAlert, X } from 'lucide-react'
import ReusableModal, { RemarksModal } from '@/components/layout/ReusableModal'
import { itAdminService } from '@/lib/services/admin/user-management.service'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useAuthStore } from '@/lib/store/auth.store'
import { validateForm } from '@/lib/validation/user-management.validation'
import { extractApiError } from '@/lib/api-error'
import { appToast } from '@/lib/toast'
import PhoneInputRow, { attachCountryCode } from '@/components/ui/PhoneInputRow'
import { blockPaste, confirmEmailError } from '@/lib/validation/fields'

/**
 * The IT Admin's handover form, two modes (2026-10-25):
 *
 *   start — begin the 30-day render. The replacement's details are optional:
 *           "I already have my replacement" adds them in the same step.
 *   add   — add the replacement later, once one is found.
 *
 * The replacement gets an emailed temporary password; the handover ends, and
 * the outgoing account is archived, when they sign in and set their own. Until
 * then the person filling this in stays the IT Administrator, even past 30 days.
 *
 * Every submit goes through a confirm pop-up first; starting also asks for a
 * reason that goes on the audit record.
 */

interface FormState {
  first_name:  string
  last_name:   string
  middle_name: string
  suffix:      string
  email:       string
  /** Typed a second time; never sent. */
  confirm_email: string
  phone:       string
}

const EMPTY: FormState = {
  first_name: '', last_name: '', middle_name: '', suffix: '', email: '', confirm_email: '', phone: '',
}

const inputBase =
  'w-full rounded-[10px] border border-[#424242] bg-[#2a2a2a99] px-3 py-2 text-[13px] text-white placeholder-[#555] outline-none transition-colors duration-150 focus:border-[#4df9ed] hover:border-[#4df9ed50]'

function Field({
  label, required, error, hint, children,
}: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#818181]">
        {label}
        {hint && <span className="ml-1 normal-case font-normal text-[#555]">({hint})</span>}
        {required && <span className="ml-0.5 text-[#4df9ed]">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] leading-tight text-red-400">{error}</p>}
    </div>
  )
}

export default function ItAdminTransitionModal({
  open,
  mode,
  renderDays = 30,
  onClose,
  onDone,
}: {
  open:        boolean
  mode:        'start' | 'add'
  /** The render target in days, from the API. */
  renderDays?: number
  onClose:     () => void
  onDone:      () => void | Promise<void>
}) {
  const me = useAuthStore((s) => s.user)
  const [form,       setForm]       = useState<FormState>(EMPTY)
  const [errors,     setErrors]     = useState<Record<string, string>>({})
  const [apiError,   setApiError]   = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy,       setBusy]       = useState(false)
  // Start mode only: the replacement is already known, so add them now.
  const [withSuccessor, setWithSuccessor] = useState(false)
  const needsSuccessor = mode === 'add' || withSuccessor

  useBodyScrollLock(open || confirming)

  useEffect(() => {
    if (!open) { setForm(EMPTY); setErrors({}); setApiError(''); setConfirming(false); setBusy(false); setWithSuccessor(false) }
  }, [open])

  const set = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
    setApiError('')
  }

  // Blank optionals are omitted rather than sent as null: the API's schema treats
  // an absent field and an empty one the same way, and `undefined` is what the
  // create payload type already expects.
  const payload = () => ({
    first_name:  form.first_name.trim(),
    last_name:   form.last_name.trim(),
    middle_name: form.middle_name.trim() || undefined,
    suffix:      form.suffix.trim() || undefined,
    email:       form.email.trim().toLowerCase(),
    phone:       form.phone ? attachCountryCode(form.phone) : '',
  })

  /** Validate the replacement's details (when given), then ask for confirmation. */
  const handleReview = () => {
    if (needsSuccessor) {
      // Same schema as any IT Admin account.
      const found = validateForm('it-admins', false, payload())
      const confirmError = confirmEmailError(form.email, form.confirm_email)
      if (confirmError) found.confirm_email = confirmError
      setErrors(found)
      if (Object.keys(found).length > 0) return
    }
    setConfirming(true)
  }

  const submit = async (reason?: string) => {
    if (mode === 'start' && (reason ?? '').trim().length < 10) {
      appToast.error('Give a reason of at least 10 characters. It goes on the audit record.')
      return
    }
    setBusy(true); setApiError('')
    try {
      await appToast.promise(
        mode === 'start'
          ? itAdminService.startHandover({ reason: reason!.trim(), successor: needsSuccessor ? payload() : null })
          : itAdminService.addSuccessor(payload()),
        {
          loading: mode === 'start' ? 'Starting the handover…' : 'Adding your replacement…',
          success: mode === 'start' ? 'Handover started. Your render time has begun.' : 'Replacement added.',
          error:   (e) => extractApiError(e).message || 'Something went wrong.',
        },
        { action: 'it-admin-handover', entityId: me?.user_id },
      )
      setConfirming(false)
      await onDone()
      onClose()
      if (needsSuccessor) {
        // Said separately: the replacement must act on this, and it is what ends the handover.
        appToast.info(
          `${payload().email} was emailed a temporary password. The handover ends when they sign in and set their own.`,
        )
      }
    } catch (err) {
      setConfirming(false)
      setApiError(extractApiError(err).message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const successorName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim()

  return (
    <>
      <AnimatePresence>
        {open && !confirming && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b]"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-[#2a2a2a] px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {mode === 'start' ? 'Start the Handover' : 'Add Your Replacement'}
                  </h2>
                  <p className="mt-0.5 text-[13px] text-[#818181]">
                    {mode === 'start'
                      ? 'Begin your render time. Add your replacement now or once you have one.'
                      : 'Create the account of the person taking over from you.'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
                <div className="flex gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/[0.07] px-4 py-3">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0 text-yellow-400" />
                  <div className="text-[13px] leading-relaxed text-yellow-200/80">
                    Your <span className="font-semibold">{renderDays}-day render time</span> starts
                    {mode === 'start' ? ' now' : ' (already running)'}. You stay the IT Administrator until your
                    replacement signs in and sets their own password; then your account is archived and
                    signed out. With no replacement yet, you stay on past {renderDays} days.
                  </div>
                </div>

                {mode === 'start' && (
                  <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-white">
                    <input type="checkbox" checked={withSuccessor} onChange={(e) => setWithSuccessor(e.target.checked)}
                      className="h-4 w-4 accent-[#4df9ed]" />
                    I already have my replacement
                  </label>
                )}

                {needsSuccessor && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="First Name" required error={errors.first_name}>
                    <input className={inputBase} value={form.first_name}
                      onChange={(e) => set('first_name', e.target.value)} placeholder="Juan" />
                  </Field>
                  <Field label="Last Name" required error={errors.last_name}>
                    <input className={inputBase} value={form.last_name}
                      onChange={(e) => set('last_name', e.target.value)} placeholder="Dela Cruz" />
                  </Field>
                  <Field label="Middle Name" error={errors.middle_name}>
                    <input className={inputBase} value={form.middle_name}
                      onChange={(e) => set('middle_name', e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Suffix" error={errors.suffix}>
                    <input className={inputBase} value={form.suffix}
                      onChange={(e) => set('suffix', e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Email" required error={errors.email}
                    hint="the temporary password goes here">
                    <input className={inputBase} type="email" value={form.email}
                      onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" />
                  </Field>
                  <Field label="Confirm Email" required error={errors.confirm_email}>
                    <input className={inputBase} type="email" value={form.confirm_email} autoComplete="off"
                      onChange={(e) => set('confirm_email', e.target.value)} onPaste={blockPaste} onDrop={blockPaste}
                      placeholder="Type the email again" />
                  </Field>
                  <Field label="Mobile" required error={errors.phone}>
                    <PhoneInputRow value={form.phone} onChange={(digits) => set('phone', digits)}
                      error={errors.phone} />
                  </Field>
                </div>
                )}

                {apiError && (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
                    {apiError}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-[#2a2a2a] px-6 py-4">
                <button
                  onClick={onClose}
                  className="rounded-xl border border-[#424242] px-4 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReview}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-xl bg-[#4df9ed] px-5 py-2 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5] active:scale-95 disabled:opacity-40"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm first. Starting asks for a reason for the record. */}
      <RemarksModal
        open={confirming && mode === 'start'}
        title="Start the handover?"
        description={
          `Your ${renderDays}-day render time starts now. ` +
          (needsSuccessor
            ? `${successorName} (${form.email.trim().toLowerCase()}) is emailed a temporary password; when they sign in and set their own, your account is archived.`
            : 'Add your replacement when you have one; you stay the IT Administrator until they sign in and set their password.')
        }
        remarksLabel="Reason for the handover"
        remarksPlaceholder="e.g. Resignation effective 30 November."
        confirmLabel="Start Handover"
        cancelLabel="Back"
        busy={busy}
        disableBackdropClose
        onConfirm={(reason) => void submit(reason)}
        onCancel={() => setConfirming(false)}
      />
      <ReusableModal
        open={confirming && mode === 'add'}
        title={`Add ${successorName || 'this person'} as your replacement?`}
        description={`${form.email.trim().toLowerCase()} is emailed a temporary password. When they sign in and set their own, the handover ends and your account is archived.`}
        confirmLabel={busy ? 'Adding…' : 'Add Replacement'}
        cancelLabel="Back"
        disableBackdropClose
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
