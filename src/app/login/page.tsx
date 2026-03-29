'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { AxiosError } from 'axios'
import { requestOtp, verifyOtp } from '@/app/lib/api/auth.api'
import { AuthUser } from '@/app/lib/api/auth.api'
import { useAuthStore } from '../lib/store/auth.store'

const ROLE_ROUTES: Record<string, string> = {
  super_admin: '/superadmin',
  admin: '/admin',
  driver: '/driver',
  helper: '/helper',
  client: '/client',
  subcontractor: '/subcontractor',
}

function getRoleRoute(role: string): string {
  return ROLE_ROUTES[role] || ''
}

const OTP_LENGTH = 6
const RESEND_SECS = 60

interface ApiErrorResponse {
  message?: string
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as ApiErrorResponse | undefined
    return data?.message ?? fallback
  }
  return fallback
}

function IconMail() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="4" width="20" height="16" rx="3"/>
      <path d="m2 7 10 7 10-7"/>
    </svg>
  )
}

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  )
}

function IconBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  )
}

function EmailStep({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError('')

    try {
      await requestOtp(email.trim().toLowerCase())
      onSuccess(email.trim().toLowerCase())
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      key="email-step"
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="mb-6 sm:mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl
          bg-[#4df9ed]/[0.08] border border-[#4df9ed]/20 text-[#4df9ed] mb-4 sm:mb-6">
          <IconMail />
        </div>
        <h1 className="text-[1.5rem] sm:text-[1.75rem] font-semibold text-white tracking-tight mb-2"
          style={{ fontFamily: "'Sora', sans-serif" }}>
          Welcome back
        </h1>
        <p className="text-white/45 text-[0.875rem] sm:text-[0.92rem] leading-relaxed">
          Enter your registered email and we&apos;ll send you a secure login code.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <label className="block text-[0.7rem] sm:text-[0.75rem] font-medium text-white/40 tracking-widest uppercase mb-2">
            Email address
          </label>
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-2xl
                px-4 py-3.5 text-white placeholder-white/20 text-[0.9rem] sm:text-[0.95rem]
                outline-none transition-all duration-200
                focus:border-[#4df9ed]/40 focus:bg-[#4df9ed]/[0.03]
                focus:shadow-[0_0_0_3px_rgba(77,249,237,0.06)]"
              style={{ fontFamily: "'DM Mono', monospace" }}
            />
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="text-red-400/80 text-[0.8rem] sm:text-[0.82rem] flex items-center gap-2"
            >
              <span className="w-1 h-1 rounded-full bg-red-400 inline-block flex-shrink-0" />
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full flex items-center justify-center gap-2.5 py-3.5 sm:py-3.5 rounded-2xl
            bg-[#4df9ed] text-[#050d0d] font-semibold text-[0.9rem] sm:text-[0.92rem] tracking-wide
            transition-all duration-200 cursor-pointer min-h-[52px]
            hover:bg-[#7afbf3] hover:shadow-[0_0_30px_rgba(77,249,237,0.25)]
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none
            active:scale-[0.98]"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-[#050d0d]/30 border-t-[#050d0d]
              rounded-full animate-spin" />
          ) : (
            <>
              Send login code
              <IconArrow />
            </>
          )}
        </button>
      </form>
    </motion.div>
  )
}

function OtpStep({
  email,
  onSuccess,
  onBack,
}: {
  email: string
  onSuccess: (user: AuthUser) => void
  onBack: () => void
}) {
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendSec, setResendSec] = useState(RESEND_SECS)
  const [resending, setResending] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendSec <= 0) return
    const t = setTimeout(() => setResendSec(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendSec])

  const focusInput = (idx: number) => inputRefs.current[idx]?.focus()

  const handleChange = (idx: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[idx] = char
    setOtp(next)
    setError('')
    if (char && idx < OTP_LENGTH - 1) focusInput(idx + 1)
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (otp[idx]) {
        const next = [...otp]; next[idx] = ''; setOtp(next)
      } else if (idx > 0) {
        focusInput(idx - 1)
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      focusInput(idx - 1)
    } else if (e.key === 'ArrowRight' && idx < OTP_LENGTH - 1) {
      focusInput(idx + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    e.preventDefault()
    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((c, i) => { next[i] = c })
    setOtp(next)
    focusInput(Math.min(pasted.length, OTP_LENGTH - 1))
  }

  const code = otp.join('')

  const handleSubmit = useCallback(async () => {
    if (code.length !== OTP_LENGTH) return
    setLoading(true)
    setError('')
    try {
      const res = await verifyOtp(email, code)
      onSuccess(res.user)
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Invalid or expired code. Please try again.'))
      setOtp(Array(OTP_LENGTH).fill(''))
      focusInput(0)
    } finally {
      setLoading(false)
    }
  }, [code, email, onSuccess])

  useEffect(() => {
    if (code.length === OTP_LENGTH) handleSubmit()
  }, [code, handleSubmit])

  const handleResend = async () => {
    setResending(true)
    setError('')
    try {
      await requestOtp(email)
      setResendSec(RESEND_SECS)
      setOtp(Array(OTP_LENGTH).fill(''))
      focusInput(0)
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to resend. Please try again.'))
    } finally {
      setResending(false)
    }
  }

  return (
    <motion.div
      key="otp-step"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="mb-6 sm:mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl
          bg-[#4df9ed]/[0.08] border border-[#4df9ed]/20 text-[#4df9ed] mb-4 sm:mb-6">
          <IconShield />
        </div>
        <h1 className="text-[1.5rem] sm:text-[1.75rem] font-semibold text-white tracking-tight mb-2"
          style={{ fontFamily: "'Sora', sans-serif" }}>
          Check your email
        </h1>
        <p className="text-white/45 text-[0.875rem] sm:text-[0.92rem] leading-relaxed">
          We sent a 6-digit code to{' '}
          <span className="text-[#4df9ed]/80 font-medium break-all"
            style={{ fontFamily: "'DM Mono', monospace" }}>
            {email}
          </span>
        </p>
      </div>

      {/* OTP inputs — gap and height scale down on mobile */}
      <div className="flex gap-1.5 sm:gap-2.5 mb-5 sm:mb-6" onPaste={handlePaste}>
        {otp.map((digit, i) => (
          <motion.input
            key={i}
            ref={el => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onFocus={e => e.target.select()}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex-1 min-w-0 h-11 sm:h-14 text-center text-lg sm:text-xl font-semibold rounded-xl sm:rounded-2xl
              border transition-all duration-200 outline-none
              ${digit
                ? 'bg-[#4df9ed]/[0.06] border-[#4df9ed]/40 text-[#4df9ed]'
                : 'bg-white/[0.04] border-white/[0.1] text-white'
              }
              focus:border-[#4df9ed]/60 focus:bg-[#4df9ed]/[0.06]
              focus:shadow-[0_0_0_3px_rgba(77,249,237,0.08)]
              ${error ? 'border-red-400/40 shake' : ''}`}
            style={{ fontFamily: "'DM Mono', monospace" }}
          />
        ))}
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="text-red-400/80 text-[0.8rem] sm:text-[0.82rem] flex items-center gap-2 mb-4"
          >
            <span className="w-1 h-1 rounded-full bg-red-400 inline-block flex-shrink-0" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <button
        onClick={handleSubmit}
        disabled={loading || code.length !== OTP_LENGTH}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl
          bg-[#4df9ed] text-[#050d0d] font-semibold text-[0.9rem] sm:text-[0.92rem] tracking-wide
          transition-all duration-200 cursor-pointer mb-4 sm:mb-5 min-h-[52px]
          hover:bg-[#7afbf3] hover:shadow-[0_0_30px_rgba(77,249,237,0.25)]
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none
          active:scale-[0.98]"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-[#050d0d]/30 border-t-[#050d0d]
            rounded-full animate-spin" />
        ) : (
          <>
            Verify &amp; sign in
            <IconArrow />
          </>
        )}
      </button>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 sm:gap-2 text-white/35 text-[0.8rem] sm:text-[0.82rem]
            hover:text-white/60 transition-colors cursor-pointer bg-transparent border-none
            min-h-[44px] py-2"
        >
          <IconBack />
          Change email
        </button>

        <button
          onClick={handleResend}
          disabled={resendSec > 0 || resending}
          className="text-[0.8rem] sm:text-[0.82rem] transition-colors cursor-pointer bg-transparent border-none
            disabled:text-white/25 disabled:cursor-not-allowed
            enabled:text-[#4df9ed]/70 enabled:hover:text-[#4df9ed]
            min-h-[44px] py-2 text-right"
        >
          {resending ? 'Sending…' : resendSec > 0 ? `Resend in ${resendSec}s` : 'Resend code'}
        </button>
      </div>
    </motion.div>
  )
}

function SuccessStep() {
  return (
    <motion.div
      key="success-step"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="text-center py-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.1 }}
        className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full
          bg-[#4df9ed]/[0.1] border border-[#4df9ed]/30 text-[#4df9ed] mx-auto mb-5 sm:mb-6"
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
          className="sm:w-9 sm:h-9">
          <path d="m20 6-11 11-5-5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.div>

      <h2 className="text-[1.35rem] sm:text-[1.5rem] font-semibold text-white mb-2"
        style={{ fontFamily: "'Sora', sans-serif" }}>
        You&apos;re in
      </h2>
      <p className="text-white/40 text-[0.875rem] sm:text-[0.9rem]">Redirecting to your dashboard…</p>

      <div className="mt-6 flex justify-center gap-1">
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            className="w-1.5 h-1.5 rounded-full bg-[#4df9ed]"
          />
        ))}
      </div>
    </motion.div>
  )
}

type Step = 'email' | 'otp' | 'success'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')

  const handleEmailSuccess = (e: string) => {
    setEmail(e)
    setStep('otp')
  }

  const handleOtpSuccess = (user: AuthUser) => {
    useAuthStore.getState().setUser(user)
    setStep('success')
    const targetRoute = getRoleRoute(user.role)
    setTimeout(() => {
      router.push(targetRoute)
    }, 1800)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-6px); }
          40%       { transform: translateX(6px); }
          60%       { transform: translateX(-4px); }
          80%       { transform: translateX(4px); }
        }
        .shake { animation: shake 0.4s ease; }
        * { box-sizing: border-box; }
      `}</style>

      <div
        className="min-h-screen min-h-dvh flex items-center justify-center relative overflow-hidden px-4 py-8 sm:py-12"
        style={{ background: '#050d0d', fontFamily: "'Sora', sans-serif" }}
      >
        {/* Grid background */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(77,249,237,0.025) 1px, transparent 1px),
              linear-gradient(90deg, rgba(77,249,237,0.025) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          }}
        />

        {/* Glow blobs */}
        <div className="absolute top-[-20%] left-[-10%] w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] rounded-full
          bg-[#4df9ed]/[0.04] blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] rounded-full
          bg-[#4df9ed]/[0.03] blur-[100px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative w-full max-w-[420px]"
        >
          {/* Logo */}
          <div className="flex justify-center mb-6 sm:mb-8">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#4df9ed]/10 border border-[#4df9ed]/20
                flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4df9ed" strokeWidth="1.8">
                  <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/>
                  <circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
              </div>
              <span className="text-white/80 font-semibold text-[0.95rem] sm:text-[1rem] tracking-wide">
                8338 Logistics
              </span>
            </div>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl sm:rounded-3xl p-6 sm:p-8 relative overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              backdropFilter: 'blur(24px)',
              boxShadow: '0 32px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Top shimmer line */}
            <div className="absolute top-0 left-8 right-8 h-[1px]
              bg-gradient-to-r from-transparent via-[#4df9ed]/30 to-transparent" />

            {/* Step indicator */}
            {step !== 'success' && (
              <div className="flex gap-1.5 mb-6 sm:mb-8">
                {(['email', 'otp'] as const).map((s, i) => (
                  <motion.div
                    key={s}
                    className="h-[3px] rounded-full"
                    animate={{
                      width: step === s ? 28 : 12,
                      backgroundColor: step === s
                        ? 'rgba(77,249,237,0.8)'
                        : i < (['email', 'otp'] as const).indexOf(step)
                          ? 'rgba(77,249,237,0.4)'
                          : 'rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              {step === 'email' && (
                <EmailStep key="email" onSuccess={handleEmailSuccess} />
              )}
              {step === 'otp' && (
                <OtpStep
                  key="otp"
                  email={email}
                  onSuccess={handleOtpSuccess}
                  onBack={() => setStep('email')}
                />
              )}
              {step === 'success' && (
                <SuccessStep key="success" />
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <p className="text-center text-white/20 text-[0.7rem] sm:text-[0.75rem] mt-5 sm:mt-6 tracking-wide px-4">
            Protected by end-to-end session encryption
          </p>
        </motion.div>
      </div>
    </>
  )
}