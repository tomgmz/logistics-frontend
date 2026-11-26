'use client'

import { useState } from 'react'
import { AxiosError } from 'axios'
import { BookOpen, ExternalLink, KeyRound } from 'lucide-react'
import ReusableModal from '@/components/layout/ReusableModal'
import { requestPasswordReset, type Profile } from '@/lib/api/auth.api'
import { roleLabel } from '@/lib/roles'
import { CardHeader, INNER_CARD } from './profile-ui'

/**
 * The Profile page's Security and User Guide cards, laid out like TailAdmin's
 * profile Security card (2026-11-26): a title and a line of explanation on the
 * left, the button on the right (under it on phones). TailAdmin's Danger Zone
 * and two-factor row are left out on purpose.
 *
 * The password button does not change the password on this page. It starts the
 * same reset the sign-in page offers (an emailed one-time link to
 * /reset-password), so there is one place that sets a new password and the
 * mailbox is the out-of-band check (a session alone never changes it).
 */

const BUTTON =
  'inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-[#424242] px-4 py-2.5 text-[15px] text-white transition-colors disabled:opacity-50 sm:w-auto [@media(hover:hover)]:hover:bg-white/5'

function errorText(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const msg = (err.response?.data as { message?: string } | undefined)?.message
    if (msg) return msg
  }
  return fallback
}

/** One TailAdmin security row: what it is on the left, the action on the right. */
function ActionRow({ title, hint, action }: { title: string; hint: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-white">{title}</p>
        <p className="mt-1 text-[14px] leading-snug text-[#818181]">{hint}</p>
      </div>
      {action}
    </div>
  )
}

// ── User guide ──────────────────────────────────────────────────────────────

/** Opens the guide for the person's own role (GET /user-guide picks it from the session). */
export function UserGuideCard({ role }: { role: string }) {
  return (
    <section className={INNER_CARD}>
      <CardHeader title="User Guide" />
      <ActionRow
        title={`${roleLabel(role)} guide`}
        hint="How each screen you use works, step by step. Opens as a PDF in a new tab."
        action={
          // A plain link (not window.open) so iOS Safari never blocks it as a pop-up.
          // The route checks the session; see src/app/user-guide/route.ts.
          <a href="/user-guide" target="_blank" rel="noopener noreferrer" className={BUTTON}>
            <BookOpen size={16} /> Open User Guide <ExternalLink size={14} className="text-[#818181]" />
          </a>
        }
      />
    </section>
  )
}

// ── Password ────────────────────────────────────────────────────────────────

/** Mirrors SELF_SERVICE_RESET_ROLES in logistics-backend password-reset.service.ts. */
const SELF_SERVICE_ROLES = ['it_admin', 'admin', 'general_manager']

/**
 * One request for everyone (POST /auth/forgot-password, the same as the sign-in
 * screen). IT Administrator, Company Administrator and General Manager need no
 * one's approval, so their button is "Change Password" and the link comes
 * straight away. Everyone else needs the IT Administrator, so theirs is
 * "Request Change Password" (user 2026-11-26). The link opens /reset-password,
 * works once and lasts 5 minutes.
 */
export function SecurityCard({ profile }: { profile: Profile }) {
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
    <section className={INNER_CARD}>
      <CardHeader title="Security" />
      <ActionRow
        title="Password"
        hint={self ? (
          <>
            We email a one-time link to {emailSpan} to set your new password. It works once and expires 5
            minutes after it is sent. Afterwards you sign in again on every device.
          </>
        ) : (
          <>
            Password changes go through the IT Administrator. Send a request and they will email a one-time
            link to {emailSpan}. The link works once and expires 5 minutes after it is sent.
          </>
        )}
        action={sent ? null : (
          <button type="button" className={BUTTON} onClick={() => setConfirming(true)}>
            <KeyRound size={16} /> {self ? 'Change Password' : 'Request Change Password'}
          </button>
        )}
      />

      {sent && (
        <div className="mt-4 rounded-[8px] border-[0.5px] border-[#4DF9ED]/40 bg-[#4DF9ED]/[0.07] px-4 py-3 text-[15px] leading-snug text-white/85">
          {self
            ? 'Link sent. Check your email and open it within 5 minutes. Not there? Check spam, or ask again in a minute; a new link replaces the old one.'
            : 'Request sent. The IT Administrator has been notified and will email you a link. Asking again only reminds them; there is still one request.'}
        </div>
      )}
      {error && <p className="mt-3 text-[14px] text-[#F62626]">{error}</p>}

      <ReusableModal
        open={confirming}
        title={self ? 'Change your password?' : 'Request a password change?'}
        description={self
          ? `We will email a one-time link to ${email}. Open it to set your new password; it works once and expires in 5 minutes. After that you sign in again on every device.`
          : `The IT Administrator gets your request and emails a one-time link to ${email}. After you set the new password, you sign in again on every device.`}
        confirmLabel={sending ? 'Sending…' : self ? 'Send Link' : 'Send Request'}
        cancelLabel="Cancel"
        onConfirm={() => void send()}
        onCancel={() => { if (!sending) setConfirming(false) }}
      />
    </section>
  )
}
