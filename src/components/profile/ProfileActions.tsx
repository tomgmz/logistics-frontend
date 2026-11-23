'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AxiosError } from 'axios'
import { BookOpen, ExternalLink, KeyRound } from 'lucide-react'
import ReusableModal from '@/components/layout/ReusableModal'
import { FieldError } from '@/components/ui/FieldError'
import OtpCodeInput, { type OtpCodeInputHandle } from '@/components/auth/OtpCodeInput'
import {
  requestItAdminResetOtp,
  requestPasswordReset,
  verifyItAdminResetOtp,
  type Profile,
} from '@/lib/api/auth.api'
import { handOffResetToken } from '@/lib/auth/reset-handoff'

/**
 * Two Profile cards (2026-11-23): the user guide, and a password reset.
 *
 * The password card does not change the password on this page. It starts the
 * same reset the sign-in page offers, so there is still one place that sets a
 * new password (/reset-password) and one rule for who may do it:
 *   - IT Administrator, Company Administrator, General Manager: an emailed
 *     6-digit code, then /reset-password (canSelfResetByOtp on the server).
 *   - Everyone else: a request to the IT Administrator, who emails a link.
 */

const CARD = 'rounded-[10px] border-[0.5px] border-[#424242] bg-[#141414]'
const BUTTON =
  'inline-flex w-full items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-[#424242] px-4 py-2.5 text-[15px] text-white transition-colors disabled:opacity-50 sm:w-auto [@media(hover:hover)]:hover:bg-white/5'

/** Mirrors SELF_RESET_ROLES in logistics-backend password-reset.service.ts. */
const SELF_RESET_ROLES = ['it_admin', 'admin', 'general_manager']

const CODE_LENGTH = 6
const RESEND_SECS = 60

function errorText(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const msg = (err.response?.data as { message?: string } | undefined)?.message
    if (msg) return msg
  }
  return fallback
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <h2 className="ff-sc text-[18px] leading-tight text-white">{children}</h2>
      {hint && <p className="text-[14px] leading-snug text-[#818181]">{hint}</p>}
    </div>
  )
}

// ── User guide ──────────────────────────────────────────────────────────────

export function UserGuideCard() {
  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionTitle hint="How each screen works, step by step. Opens as a PDF in a new tab.">
        User Guide
      </SectionTitle>
      {/* A plain link (not window.open) so iOS Safari never blocks it as a pop-up.
          The route checks the session; see src/app/user-guide/route.ts. */}
      <a href="/user-guide" target="_blank" rel="noopener noreferrer" className={BUTTON}>
        <BookOpen size={16} /> Open User Guide <ExternalLink size={14} className="text-[#818181]" />
      </a>
    </section>
  )
}

// ── Password ────────────────────────────────────────────────────────────────

export function PasswordCard({ profile }: { profile: Profile }) {
  return SELF_RESET_ROLES.includes(profile.role)
    ? <SelfResetPassword email={profile.email} />
    : <RequestPasswordReset email={profile.email} />
}

/** Everyone but the three senior office roles: ask the IT Administrator. */
function RequestPasswordReset({ email }: { email: string }) {
  const [confirming, setConfirming] = useState(false)
  const [sending,    setSending]    = useState(false)
  const [sent,       setSent]       = useState(false)
  const [error,      setError]      = useState('')

  const send = async () => {
    if (sending) return
    setSending(true); setError('')
    try {
      await requestPasswordReset(email)
      setSent(true)
      setConfirming(false)
    } catch (err) {
      setError(errorText(err, 'Could not send your request. Please try again.'))
      setConfirming(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionTitle
        hint={
          <>
            Password changes go through the IT Administrator. Send a request and they will email a one-time
            link to <span className="break-all text-white/80">{email}</span>. The link works once and expires
            5 minutes after it is sent.
          </>
        }
      >
        Password
      </SectionTitle>

      {sent ? (
        <div className="rounded-[8px] border-[0.5px] border-[#4DF9ED]/40 bg-[#4DF9ED]/[0.07] px-4 py-3 text-[15px] leading-snug text-white/85">
          Request sent. The IT Administrator has been notified and will email you a reset link. Asking again
          only reminds them; there is still one request.
        </div>
      ) : (
        <button type="button" className={BUTTON} onClick={() => setConfirming(true)}>
          <KeyRound size={16} /> Request Password Reset
        </button>
      )}
      {error && <p className="mt-3 text-[14px] text-[#F62626]">{error}</p>}

      <ReusableModal
        open={confirming}
        title="Request a password reset?"
        description={`The IT Administrator gets your request and emails a one-time link to ${email}. After you set the new password, you sign in again on every device.`}
        confirmLabel={sending ? 'Sending…' : 'Send Request'}
        cancelLabel="Cancel"
        onConfirm={() => void send()}
        onCancel={() => { if (!sending) setConfirming(false) }}
      />
    </section>
  )
}

/**
 * IT Administrator, Company Administrator, General Manager: an emailed code.
 * A correct code is traded for a one-time reset token and the person goes on to
 * /reset-password, exactly like the sign-in page's "Reset with an emailed code".
 */
function SelfResetPassword({ email }: { email: string }) {
  const router = useRouter()
  const [stage,     setStage]     = useState<'closed' | 'confirm' | 'code'>('closed')
  const [code,      setCode]      = useState('')
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState('')
  const [resendSec, setResendSec] = useState(0)
  const sentAt = useRef(0)
  const codeRef = useRef<OtpCodeInputHandle>(null)
  // Latched once a code is traded for a token: the page is leaving, and a second
  // press would spend a code that is already used.
  const done = useRef(false)

  useEffect(() => {
    if (resendSec <= 0) return
    const t = setInterval(() => {
      setResendSec(Math.max(0, Math.ceil((sentAt.current + RESEND_SECS * 1000 - Date.now()) / 1000)))
    }, 500)
    return () => clearInterval(t)
  }, [resendSec])

  const close = () => {
    if (busy) return
    setStage('closed'); setCode(''); setError('')
  }

  const sendCode = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      await requestItAdminResetOtp(email)
      sentAt.current = Date.now()
      setResendSec(RESEND_SECS)
      setCode('')
      setStage('code')
      setTimeout(() => codeRef.current?.focus(), 250)
    } catch (err) {
      setError(errorText(err, 'Could not send a code. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (busy || done.current) return
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the email.`)
      return
    }
    setBusy(true); setError('')
    try {
      const { token } = await verifyItAdminResetOtp(email, code)
      done.current = true
      // In memory, not in the address: see lib/auth/reset-handoff.
      handOffResetToken(token)
      router.push('/reset-password')
    } catch (err) {
      setError(errorText(err, 'That code did not work. Please try again.'))
      setCode('')
      setBusy(false)
      setTimeout(() => codeRef.current?.focus(), 50)
    }
  }

  // The 6th digit sends it, as on the sign-in screen.
  useEffect(() => {
    if (stage === 'code' && code.length === CODE_LENGTH && !error) void verify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, stage])

  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionTitle
        hint={
          <>
            We email a 6-digit code to <span className="break-all text-white/80">{email}</span>. Enter it, then
            choose a new password. Afterwards you sign in again on every device.
          </>
        }
      >
        Password
      </SectionTitle>

      <button type="button" className={BUTTON} onClick={() => { setError(''); setStage('confirm') }}>
        <KeyRound size={16} /> Reset Password
      </button>

      <ReusableModal
        open={stage === 'confirm'}
        title="Reset your password?"
        description={`We will email a 6-digit code to ${email}. It expires in 10 minutes.`}
        confirmLabel={busy ? 'Sending…' : 'Email Me A Code'}
        cancelLabel="Cancel"
        onConfirm={() => void sendCode()}
        onCancel={close}
      >
        {error && <p className="mt-3 text-[14px] text-[#F62626]">{error}</p>}
      </ReusableModal>

      <ReusableModal
        open={stage === 'code'}
        title="Enter your code"
        description={`6-digit code sent to ${email}. It expires in 10 minutes. Not there? Check your spam folder.`}
        confirmLabel={busy ? 'Checking…' : 'Verify & Set New Password'}
        cancelLabel="Cancel"
        onConfirm={() => void verify()}
        onCancel={close}
        disableBackdropClose
      >
        <div className="mt-4 flex flex-col gap-1">
          <OtpCodeInput
            ref={codeRef}
            value={code}
            length={CODE_LENGTH}
            disabled={busy}
            invalid={!!error}
            describedBy={error ? 'profile-reset-code-error' : undefined}
            onChange={(c) => { setCode(c); setError('') }}
            onEnter={() => void verify()}
          />
          <FieldError id="profile-reset-code-error">{error}</FieldError>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={resendSec > 0 || busy}
            className="mt-2 self-end bg-transparent p-0 text-[14px] text-[#4df9ed]/80 disabled:cursor-not-allowed disabled:text-white/30"
          >
            {resendSec > 0 ? `Resend in ${resendSec}s` : 'Resend code'}
          </button>
        </div>
      </ReusableModal>
    </section>
  )
}
