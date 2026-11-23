'use client'

import { useState } from 'react'
import { AxiosError } from 'axios'
import { BookOpen, ExternalLink, KeyRound } from 'lucide-react'
import ReusableModal from '@/components/layout/ReusableModal'
import { requestPasswordReset, type Profile } from '@/lib/api/auth.api'

/**
 * Two Profile cards (2026-11-23): the user guide, and a password reset.
 *
 * The password card does not change the password on this page. It starts the
 * same reset the sign-in page offers (an emailed one-time link to
 * /reset-password), so there is one place that sets a new password.
 */

const CARD = 'rounded-[10px] border-[0.5px] border-[#424242] bg-[#141414]'
const BUTTON =
  'inline-flex w-full items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-[#424242] px-4 py-2.5 text-[15px] text-white transition-colors disabled:opacity-50 sm:w-auto [@media(hover:hover)]:hover:bg-white/5'

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

/** Mirrors SELF_SERVICE_RESET_ROLES in logistics-backend password-reset.service.ts. */
const SELF_SERVICE_ROLES = ['it_admin', 'admin', 'general_manager']

/**
 * One request for everyone (POST /auth/forgot-password, the same as the sign-in
 * screen). IT Administrator, Company Administrator and General Manager get the
 * link straight away; everyone else once the IT Administrator approves it. The
 * link opens /reset-password, works once and lasts 5 minutes.
 */
export function PasswordCard({ profile }: { profile: Profile }) {
  const email = profile.email
  const self  = SELF_SERVICE_ROLES.includes(profile.role)
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
    } catch (err) {
      setError(errorText(err, 'Could not send your request. Please try again.'))
    } finally {
      setSending(false)
      setConfirming(false)
    }
  }

  const emailSpan = <span className="break-all text-white/80">{email}</span>

  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <SectionTitle
        hint={self ? (
          <>
            We email a one-time link to {emailSpan} straight away. It works once and expires 5 minutes after
            it is sent. Afterwards you sign in again on every device.
          </>
        ) : (
          <>
            Password changes go through the IT Administrator. Send a request and they will email a one-time
            link to {emailSpan}. The link works once and expires 5 minutes after it is sent.
          </>
        )}
      >
        Password
      </SectionTitle>

      {sent ? (
        <div className="rounded-[8px] border-[0.5px] border-[#4DF9ED]/40 bg-[#4DF9ED]/[0.07] px-4 py-3 text-[15px] leading-snug text-white/85">
          {self
            ? 'Link sent. Check your email and open it within 5 minutes. Not there? Check spam, or ask again in a minute; a new link replaces the old one.'
            : 'Request sent. The IT Administrator has been notified and will email you a reset link. Asking again only reminds them; there is still one request.'}
        </div>
      ) : (
        <button type="button" className={BUTTON} onClick={() => setConfirming(true)}>
          <KeyRound size={16} /> {self ? 'Email Me A Reset Link' : 'Request Password Reset'}
        </button>
      )}
      {error && <p className="mt-3 text-[14px] text-[#F62626]">{error}</p>}

      <ReusableModal
        open={confirming}
        title={self ? 'Email you a reset link?' : 'Request a password reset?'}
        description={self
          ? `We will email a one-time link to ${email}. It works once and expires in 5 minutes. After you set the new password, you sign in again on every device.`
          : `The IT Administrator gets your request and emails a one-time link to ${email}. After you set the new password, you sign in again on every device.`}
        confirmLabel={sending ? 'Sending…' : self ? 'Send Link' : 'Send Request'}
        cancelLabel="Cancel"
        onConfirm={() => void send()}
        onCancel={() => { if (!sending) setConfirming(false) }}
      />
    </section>
  )
}
