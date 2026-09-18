'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ShieldAlert, X } from 'lucide-react'
import { RemarksModal } from '@/components/layout/ReusableModal'
import { itAdminService } from '@/lib/services/admin/user-management.service'
import type { AdminUser } from '@/app/types/admin/user-management.types'
import { validateForm } from '@/lib/validation/user-management.validation'
import { extractApiError } from '@/lib/api-error'
import { appToast } from '@/lib/toast'

/**
 * Hand the IT Admin role to a successor.
 *
 * Deliberately not an "add user" form. The system permits exactly one active IT
 * Admin, so there is no such thing as adding a second — the only way to change who
 * holds the role is to replace the incumbent, and the API does both halves in one
 * transaction so the seat is never briefly empty. (It matters: every staff
 * password reset routes to the IT Admin's queue, and nobody else is allowed to
 * action those.)
 *
 * Two steps on purpose. The first collects the successor's details; the second
 * makes the consequence unmissable — this deactivates a named colleague's account
 * — and requires a reason that goes on the audit record.
 */

interface FormState {
  first_name:  string
  last_name:   string
  middle_name: string
  suffix:      string
  email:       string
  phone:       string
}

const EMPTY: FormState = {
  first_name: '', last_name: '', middle_name: '', suffix: '', email: '', phone: '',
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
  outgoing,
  onClose,
  onDone,
}: {
  open:     boolean
  /** The incumbent being replaced. Shown so the confirmation names a person. */
  outgoing: AdminUser | null
  onClose:  () => void
  onDone:   () => void | Promise<void>
}) {
  const [form,       setForm]       = useState<FormState>(EMPTY)
  const [errors,     setErrors]     = useState<Record<string, string>>({})
  const [apiError,   setApiError]   = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy,       setBusy]       = useState(false)

  useEffect(() => {
    if (!open) { setForm(EMPTY); setErrors({}); setApiError(''); setConfirming(false); setBusy(false) }
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
    phone:       form.phone.trim(),
  })

  /** Validate the successor's details, then move to the consequence. */
  const handleReview = () => {
    // Reuses the same schema the create form uses, so a successor is held to
    // exactly the standard any other IT Admin account is.
    const found = validateForm('it-admins', false, payload())
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setConfirming(true)
  }

  const handleConfirm = async (reason: string) => {
    setBusy(true); setApiError('')
    try {
      const result = await appToast.promise(
        itAdminService.transition({ ...payload(), reason }),
        {
          loading: 'Transitioning the IT Admin role…',
          success: 'Role transitioned. The outgoing account has been deactivated.',
          error:   (e) => extractApiError(e).message || 'Transition failed.',
        },
        { action: 'it-admin-transition', entityId: outgoing?.user_id },
      )
      setConfirming(false)
      await onDone()
      onClose()
      // Said separately from the toast: the successor cannot sign in until they
      // deal with this, and it is the one part nobody else can do for them.
      appToast.info(
        `${result.incoming.email} has been emailed a temporary password and must change it on first sign-in.`,
      )
    } catch (err) {
      setConfirming(false)
      setApiError(extractApiError(err).message || 'Transition failed.')
    } finally {
      setBusy(false)
    }
  }

  const outgoingName =
    [outgoing?.first_name, outgoing?.last_name].filter(Boolean).join(' ') || outgoing?.email || 'the current IT Admin'

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
              className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b]"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-[#2a2a2a] px-6 py-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Transition IT Admin</h2>
                  <p className="mt-0.5 text-[13px] text-[#818181]">
                    Replace <span className="text-white">{outgoingName}</span> with a successor.
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
                    Completing this deactivates <span className="font-semibold">{outgoingName}</span> and
                    signs them out everywhere, immediately. Their record is kept, so the
                    change can be undone by reactivating them.
                  </div>
                </div>

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
                  <Field label="Phone" required error={errors.phone} hint="+639XXXXXXXXX">
                    <input className={inputBase} value={form.phone}
                      onChange={(e) => set('phone', e.target.value)} placeholder="+639171234567" />
                  </Field>
                </div>

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

      {/* Step two: the consequence, and a reason for the record. */}
      <RemarksModal
        open={confirming}
        title="Confirm the handover"
        description={
          `${form.first_name} ${form.last_name} (${form.email.trim().toLowerCase()}) becomes the IT Admin, ` +
          `and ${outgoingName} is deactivated and signed out immediately. Both happen together — ` +
          `there is no moment where the role is vacant.`
        }
        remarksLabel="Reason for the handover"
        remarksPlaceholder="e.g. Resignation effective 30 September; successor onboarded."
        confirmLabel="Transition Role"
        cancelLabel="Back"
        busy={busy}
        disableBackdropClose
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
