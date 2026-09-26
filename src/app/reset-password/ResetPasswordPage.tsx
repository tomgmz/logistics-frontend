'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ASSETS } from '@/lib/data'
import { completePasswordReset, verifyResetToken } from '@/lib/api/auth.api'
import {
  IconEye,
  IconLock,
  RequirementsPanel,
  StrengthBar,
  getStrength,
  meetsRequirements,
} from '@/components/auth/password-fields'

/**
 * The page an administrator's reset link lands on.
 *
 * Public by necessity — whoever opens this has no session and is very likely
 * permanently locked out, which is why '/reset-password' is listed in
 * PUBLIC_PATHS in src/proxy.ts. The token in the query string is the only
 * credential involved.
 *
 * The token is checked before the form is shown, so a link that has expired or
 * already been spent says so rather than letting someone compose a password and
 * lose it to an error on submit.
 */

type TokenState = 'checking' | 'valid' | 'invalid'

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
      <Image
        src={ASSETS.logo}
        alt="8338 Logistics"
        width={140}
        height={40}
        className="object-contain w-24 sm:w-28 lg:w-[140px]"
      />
    </div>
  )
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { data?: { message?: string } } })?.response
  return res?.data?.message ?? (err instanceof Error ? err.message : fallback)
}

export default function ResetPasswordPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''

  /**
   * Driver links carry ?app=1 (set in buildResetUrl). Drivers work entirely out
   * of the mobile app, so their reset belongs there — this page becomes a
   * doorway rather than the form.
   *
   * The email still has to point here: mail clients cannot be trusted to follow
   * a custom scheme, and the phone may not have the app. So the link resolves in
   * a browser first and the hand-off happens from a page that always loads,
   * with a way to carry on here for whoever opens it on a desktop.
   */
  const wantsApp = searchParams.get('app') === '1'
  const [handingOff, setHandingOff] = useState(wantsApp)

  const [tokenState,   setTokenState]   = useState<TokenState>('checking')
  const [maskedEmail,  setMaskedEmail]  = useState<string | null>(null)
  const [password,     setPassword]     = useState('')
  const [confirm,      setConfirm]      = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [done,         setDone]         = useState(false)

  const strength       = getStrength(password)
  const allMet         = meetsRequirements(password)
  const passwordsMatch = password === confirm && confirm.length > 0
  const canSubmit      = allMet && passwordsMatch && !loading

  useEffect(() => {
    if (!token) { setTokenState('invalid'); return }

    let cancelled = false
    verifyResetToken(token)
      .then(res => {
        if (cancelled) return
        setTokenState(res.valid ? 'valid' : 'invalid')
        setMaskedEmail(res.email ?? null)
      })
      .catch(() => { if (!cancelled) setTokenState('invalid') })

    return () => { cancelled = true }
  }, [token])

  // Fire the app link once, and only on a phone — on a desktop the scheme goes
  // nowhere, and a silent failed navigation is worse than the button.
  useEffect(() => {
    if (!handingOff || !token) return
    if (!/android|iphone|ipad|ipod/i.test(navigator.userAgent)) return
    window.location.href = appLink(token)
  }, [handingOff, token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    try {
      await completePasswordReset(token, password)
      setDone(true)
      // Back to the landing page, where the sign-in modal lives.
      setTimeout(() => router.replace('/'), 2200)
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Failed to reset password. Please try again.')
      // A token rejected at submit time is spent or expired; swap the whole form
      // for the dead-link view rather than leaving a password typed into it.
      if (/invalid|expired|no longer active/i.test(msg)) {
        setTokenState('invalid')
        setError(msg)
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const confirmBorder =
    confirm.length > 0
      ? passwordsMatch
        ? '1px solid rgba(77,249,237,0.3)'
        : '1px solid rgba(239,68,68,0.35)'
      : '1px solid rgba(255,255,255,0.11)'

  return (
    <div
      className="bg-[#0a0a0a] flex flex-col"
      style={{
        minHeight: '100dvh',
        backgroundImage: `
          radial-gradient(ellipse 60% 50% at 20% 10%, rgba(77,249,237,0.04) 0%, transparent 60%),
          radial-gradient(ellipse 40% 40% at 80% 80%, rgba(77,249,237,0.03) 0%, transparent 50%)
        `,
      }}
    >
      <div className="sep-x-cyan" />

      <header className="px-4 sm:px-10 md:px-16 py-4 sm:py-5 flex items-center justify-between">
        <LogoMark />
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="font-spartan text-[0.6rem] sm:text-[0.68rem] tracking-[0.2em] uppercase text-white/20"
        >
          Password Reset
        </motion.span>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-6 sm:py-10">
        <AnimatePresence mode="wait">
          {tokenState === 'checking' ? (
            <motion.div
              key="checking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <span className="inline-block w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <span className="font-spartan text-white/30 text-[0.75rem] tracking-wider uppercase">
                Checking your link…
              </span>
            </motion.div>
          ) : tokenState === 'invalid' ? (
            <InvalidLinkView key="invalid" reason={error} />
          ) : handingOff ? (
            <AppHandoffView
              key="handoff"
              token={token}
              onContinueHere={() => setHandingOff(false)}
            />
          ) : done ? (
            <SuccessView key="success" />
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="w-full max-w-[400px] sm:max-w-[480px] mx-auto py-2"
            >
              <div
                className="glass rounded-3xl px-6 sm:px-9 md:px-10 py-7 sm:py-8 md:py-9 flex flex-col gap-5 sm:gap-6"
                style={{
                  boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
              >
                <motion.div
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: 'rgba(77,249,237,0.1)',
                      border: '1px solid rgba(77,249,237,0.2)',
                    }}
                  >
                    <span className="text-[#4df9ed]"><IconLock size={16} /></span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <h1 className="ff-sc text-white text-[1.05rem] sm:text-[1.25rem] tracking-[0.12em] uppercase leading-tight">
                      Set A New Password
                    </h1>
                    <p className="font-spartan text-white/35 text-[0.73rem] sm:text-[0.78rem] leading-relaxed">
                      {maskedEmail ? (
                        <>
                          Resetting the password for{' '}
                          <span className="text-[#4df9ed]/70">{maskedEmail}</span>.
                          {' '}This also unlocks your account.
                        </>
                      ) : (
                        'Choose a new password. This also unlocks your account.'
                      )}
                    </p>
                  </div>
                </motion.div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-5">
                  <motion.div
                    className="flex flex-col gap-2"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <label className="font-spartan text-[0.66rem] font-semibold tracking-[0.18em] uppercase text-white/45">
                      New Password
                    </label>
                    <div className="glass-surface flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all duration-200 focus-within:border-[rgba(77,249,237,0.3)]">
                      <span className="text-white/30 shrink-0"><IconLock size={15} /></span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError('') }}
                        placeholder="Create a strong password"
                        required
                        autoFocus
                        autoComplete="new-password"
                        className="font-spartan w-full bg-transparent text-white text-[0.88rem] outline-none placeholder-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="text-white/30 hover:text-white/60 transition-colors bg-transparent border-none cursor-pointer shrink-0 p-0"
                        tabIndex={-1}
                      >
                        <IconEye visible={showPassword} />
                      </button>
                    </div>

                    <AnimatePresence>
                      {password.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <StrengthBar strength={strength} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <motion.div
                    className="flex flex-col gap-2"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <label className="font-spartan text-[0.66rem] font-semibold tracking-[0.18em] uppercase text-white/45">
                      Confirm Password
                    </label>
                    <div
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all duration-200"
                      style={{
                        background: 'rgba(27,27,27,0.7)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: confirmBorder,
                      }}
                    >
                      <span className="text-white/30 shrink-0"><IconLock size={15} /></span>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirm}
                        onChange={e => { setConfirm(e.target.value); setError('') }}
                        placeholder="Repeat your password"
                        required
                        autoComplete="new-password"
                        className="font-spartan w-full bg-transparent text-white text-[0.88rem] outline-none placeholder-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        className="text-white/30 hover:text-white/60 transition-colors bg-transparent border-none cursor-pointer shrink-0 p-0"
                        tabIndex={-1}
                      >
                        <IconEye visible={showConfirm} />
                      </button>
                    </div>

                    <AnimatePresence>
                      {confirm.length > 0 && !passwordsMatch && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="font-spartan text-red-400/75 text-[0.72rem] flex items-center gap-1.5"
                        >
                          <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                          Passwords do not match
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <RequirementsPanel password={password} />

                  <AnimatePresence>
                    {error && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="font-spartan text-red-400/80 text-[0.75rem] flex items-center gap-1.5"
                      >
                        <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="submit"
                    disabled={!canSubmit}
                    whileHover={canSubmit ? { scale: 1.01 } : {}}
                    whileTap={canSubmit ? { scale: 0.98 } : {}}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="font-spartan w-full py-3.5 tracking-[0.18em] uppercase text-[0.8rem]
                               rounded-xl transition-all duration-200 hover:bg-[#e0e0e0]
                               disabled:opacity-35 disabled:cursor-not-allowed"
                    style={{
                      background: canSubmit ? '#ffffff' : 'rgba(255,255,255,0.7)',
                      color: '#0a0a0a',
                      border: 'none',
                      cursor: canSubmit ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-black/20 border-t-black/70 rounded-full animate-spin" />
                    ) : 'Reset Password'}
                  </motion.button>
                </form>
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="font-spartan text-center text-white/20 text-[0.66rem] tracking-wider mt-4"
              >
                This link works once and then expires.
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

/** The app's deep link for a reset token. Mirrors app/reset-password in mobile. */
function appLink(token: string): string {
  return `logistics-mobile://reset-password?token=${encodeURIComponent(token)}`
}

/**
 * What a driver sees instead of the form: a door into the app, and a way past
 * it if the app is not on this device.
 *
 * The escape hatch is not decoration. A driver may open the mail on a desktop,
 * or on a phone that has not installed the app yet, and a dead end here locks
 * out the one person the whole flow exists to let back in.
 */
function AppHandoffView({
  token, onContinueHere,
}: {
  token:          string
  onContinueHere: () => void
}) {
  return (
    <motion.div
      key="handoff"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-[400px] sm:max-w-[460px] mx-auto"
    >
      <div
        className="glass rounded-3xl px-6 sm:px-9 py-8 flex flex-col items-center gap-5 text-center"
        style={{ boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)' }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(77,249,237,0.1)', border: '1px solid rgba(77,249,237,0.2)' }}
        >
          <IconLock />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="font-spartan text-white text-lg sm:text-xl tracking-[0.15em] uppercase">
            Reset in the app
          </h1>
          <p className="text-white/40 text-[0.8rem] leading-relaxed">
            Your password is set in the 8338 Logistics app on your phone. Open it
            there and you will be signed straight back in.
          </p>
        </div>

        <a
          href={appLink(token)}
          className="w-full rounded-xl py-3 font-spartan text-[0.8rem] tracking-[0.12em] uppercase text-[#062b28] transition-opacity hover:opacity-85"
          style={{ background: '#4df9ed' }}
        >
          Open the app
        </a>

        <button
          type="button"
          onClick={onContinueHere}
          className="text-white/30 hover:text-white/60 text-[0.72rem] tracking-wide underline underline-offset-4 transition-colors"
        >
          The app is not on this device — continue here
        </button>
      </div>
    </motion.div>
  )
}

function InvalidLinkView({ reason }: { reason?: string }) {
  return (
    <motion.div
      key="invalid"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-[420px] mx-auto"
    >
      <div
        className="glass rounded-3xl px-7 sm:px-9 py-8 flex flex-col gap-5 items-center text-center"
        style={{ boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}
      >
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.6">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8"  x2="12" y2="13" strokeLinecap="round" />
            <line x1="12" y1="16" x2="12" y2="16" strokeLinecap="round" />
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="ff-sc text-white text-[1.05rem] tracking-[0.12em] uppercase">
            Link No Longer Valid
          </h1>
          <p className="font-spartan text-white/40 text-[0.8rem] leading-relaxed">
            {reason
              ? reason
              : 'This reset link has already been used or has expired. Reset links work once and last for one hour.'}
          </p>
          <p className="font-spartan text-white/30 text-[0.76rem] leading-relaxed mt-1">
            Request a new one from the sign-in screen and your Administrator will send a fresh link.
          </p>
        </div>

        <Link
          href="/"
          className="font-spartan w-full py-3 tracking-[0.18em] uppercase text-[0.78rem] rounded-xl
                     transition-all duration-200 hover:bg-[#e0e0e0] no-underline text-center"
          style={{ background: '#ffffff', color: '#0a0a0a' }}
        >
          Back To Sign In
        </Link>
      </div>
    </motion.div>
  )
}

function SuccessView() {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col items-center gap-5 text-center px-4"
    >
      <motion.div
        initial={{ scale: 0, rotate: -15 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{
          background: 'rgba(77,249,237,0.08)',
          border: '1px solid rgba(77,249,237,0.25)',
          boxShadow: '0 0 40px rgba(77,249,237,0.1)',
        }}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4df9ed" strokeWidth="1.6">
          <path d="m20 6-11 11-5-5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.div>

      <motion.div
        className="flex flex-col gap-1.5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <h2 className="ff-sc text-white text-xl sm:text-[1.3rem] tracking-[0.15em] uppercase">
          Password Reset
        </h2>
        <p className="font-spartan text-white/35 text-[0.8rem]">
          Your account is unlocked. Taking you to sign in…
        </p>
      </motion.div>

      <motion.div
        className="flex gap-1.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            className="w-1.5 h-1.5 rounded-full bg-[#4df9ed]"
          />
        ))}
      </motion.div>
    </motion.div>
  )
}
