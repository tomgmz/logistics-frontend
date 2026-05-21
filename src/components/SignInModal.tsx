'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { AxiosError } from 'axios'
import { requestOtp, verifyOtp, loginWithPassword, getMe, getAuthStatus, AuthUser } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
import { ROLE_ROUTES, ADMIN_EMAIL } from '@/constants/roles'
import { now } from '@/app/utils/serverTime'

const OTP_LENGTH  = 6
const RESEND_SECS = 60

interface ApiErrorResponse { message?: string; code?: string; retryAfter?: number }

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as ApiErrorResponse | undefined
    return data?.message ?? fallback
  }
  return fallback
}

function getFallbackRoute(role: string): string {
  return ROLE_ROUTES[role] ?? '/'
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconMail() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="4" width="20" height="16" rx="3"/>
      <path d="m2 7 10 7 10-7"/>
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7l-9-5z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  )
}

function IconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

function IconBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  )
}

function IconAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 8v4M12 16h.01"/>
    </svg>
  )
}

function IconEye({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function IconKey() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6">
      <circle cx="7.5" cy="15.5" r="5.5"/>
      <path d="m21 2-9.6 9.6"/>
      <path d="m15.5 7.5 3 3L22 7l-3-3"/>
    </svg>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────

function GlassInput({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-[0.72rem] font-semibold tracking-[0.18em] uppercase"
        style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'League Spartan', sans-serif" }}
      >
        {label}
      </label>
      <div
        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200"
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.13)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <span className="text-white/40 shrink-0">{icon}</span>
        {children}
      </div>
    </div>
  )
}

function PrimaryButton({
  loading,
  disabled,
  onClick,
  type = 'button',
  children,
}: {
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  children: React.ReactNode
}) {
  return (
    <button
      type={type}
      disabled={loading || disabled}
      onClick={onClick}
      className="w-full mt-2 py-4 font-body tracking-[0.2em] uppercase !text-[0.82rem]
        rounded-2xl transition-all duration-200 cursor-pointer
        hover:bg-[#e0e0e0] active:scale-[0.98]
        disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: '#ffffff',
        color: '#0a0a0a',
        fontFamily: "'League Spartan', sans-serif",
        border: 'none',
      }}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-black/20
          border-t-black/70 rounded-full animate-spin" />
      ) : children}
    </button>
  )
}

function BackButton({ onClick, label = 'Change email' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-white/35 text-[0.78rem]
        hover:text-white/60 transition-colors bg-transparent border-none cursor-pointer"
      style={{ fontFamily: "'League Spartan', sans-serif" }}
    >
      <IconBack /> {label}
    </button>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="text-red-400/80 text-[0.78rem] flex items-center gap-1.5 -mt-2"
    >
      <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
      {message}
    </motion.p>
  )
}

// ─── Permanent lock screen ────────────────────────────────────────────────────

function PermanentLockScreen({ onBack }: { onBack: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col gap-6"
    >
      <div className="flex items-center gap-2" style={{ color: 'rgba(239,68,68,0.85)' }}>
        <IconAlert />
        <span
          className="text-[0.72rem] font-semibold tracking-[0.18em] uppercase"
          style={{ fontFamily: "'League Spartan', sans-serif" }}
        >
          Account Locked
        </span>
      </div>

      <div
        className="rounded-xl px-4 py-4 text-[0.78rem] leading-relaxed flex flex-col gap-3"
        style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          color: 'rgba(239,68,68,0.85)',
          fontFamily: "'League Spartan', sans-serif",
        }}
      >
        <span>
          Your account has been permanently locked due to too many failed login attempts.
        </span>
        <span>
          Please contact your administrator at{' '}
          <a
            href={`mailto:${ADMIN_EMAIL}`}
            className="underline underline-offset-2 hover:opacity-80 transition-opacity"
            style={{ color: 'rgba(239,68,68,1)' }}
          >
            {ADMIN_EMAIL}
          </a>{' '}
          to regain access.
        </span>
      </div>

      <BackButton onClick={onBack} label="Change email" />
    </motion.div>
  )
}

// ─── Step 1: Email ────────────────────────────────────────────────────────────

function EmailStep({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      onSuccess(email.trim().toLowerCase())
    } catch (err) {
      setError(extractErrorMessage(err, 'Something went wrong. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      key="email-step"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col gap-7"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <GlassInput icon={<IconMail />} label="Email">
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            placeholder="email@example.com"
            required
            autoFocus
            className="w-full bg-transparent text-white text-[0.95rem] outline-none
              placeholder-white/20"
            style={{ fontFamily: "'League Spartan', sans-serif" }}
          />
        </GlassInput>

        <AnimatePresence>
          {error && <ErrorMessage message={error} />}
        </AnimatePresence>

        <PrimaryButton type="submit" loading={loading} disabled={!email.trim()}>
          Continue
        </PrimaryButton>
      </form>
    </motion.div>
  )
}

// ─── Step 2: Method selection ─────────────────────────────────────────────────

function MethodStep({
  email,
  onSelectOtp,
  onSelectPassword,
  onBack,
}: {
  email: string
  onSelectOtp: (retryAfter?: number) => void
  onSelectPassword: () => void
  onBack: () => void
}) {
  const [loading, setLoading] = useState<'otp' | 'password' | null>(null)
  const [error,   setError]   = useState('')

  const handleOtp = async () => {
    setLoading('otp'); setError('')
    try {
      await requestOtp(email)
      onSelectOtp()
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 429) {
        const data = err.response.data as ApiErrorResponse
        if (data.code === 'OTP_COOLDOWN') {
          onSelectOtp(data.retryAfter)
          return
        }
      }
      setError(extractErrorMessage(err, 'Failed to send code. Please try again.'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <motion.div
      key="method-step"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-1">
        <p
          className="text-white/40 text-[0.8rem] leading-relaxed"
          style={{ fontFamily: "'League Spartan', sans-serif" }}
        >
          Signing in as{' '}
          <span className="text-[#4df9ed]/70 break-all" style={{ fontFamily: 'monospace' }}>
            {email}
          </span>
        </p>
        <p
          className="text-white/30 text-[0.75rem] mt-1"
          style={{ fontFamily: "'League Spartan', sans-serif" }}
        >
          How would you like to continue?
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleOtp}
          disabled={!!loading}
          className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left
            transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{
            background: 'rgba(77,249,237,0.06)',
            border: '1px solid rgba(77,249,237,0.2)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(77,249,237,0.1)' }}
          >
            {loading === 'otp' ? (
              <span className="w-4 h-4 border-2 border-[#4df9ed]/20 border-t-[#4df9ed] rounded-full animate-spin" />
            ) : (
              <span className="text-[#4df9ed]"><IconShield /></span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className="text-white text-[0.85rem] font-semibold tracking-wide"
              style={{ fontFamily: "'League Spartan', sans-serif" }}
            >
              Email Sign-In Code
            </span>
            <span
              className="text-white/35 text-[0.72rem]"
              style={{ fontFamily: "'League Spartan', sans-serif" }}
            >
              We&apos;ll send a 6-digit code to your inbox
            </span>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => onSelectPassword()}
          disabled={!!loading}
          className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left
            transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <span className="text-white/50"><IconKey /></span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className="text-white text-[0.85rem] font-semibold tracking-wide"
              style={{ fontFamily: "'League Spartan', sans-serif" }}
            >
              Password
            </span>
            <span
              className="text-white/35 text-[0.72rem]"
              style={{ fontFamily: "'League Spartan', sans-serif" }}
            >
              Sign in with your account password
            </span>
          </div>
        </motion.button>
      </div>

      <AnimatePresence>
        {error && <ErrorMessage message={error} />}
      </AnimatePresence>

      <BackButton onClick={onBack} label="Change email" />
    </motion.div>
  )
}

// ─── Step 3a: OTP ─────────────────────────────────────────────────────────────

function OtpStep({
  email,
  resendExpiresAt,
  onSuccess,
  onBack,
}: {
  email: string
  resendExpiresAt: React.MutableRefObject<number>
  onSuccess: (user: AuthUser, portalUrl: string) => void
  onBack: () => void
}) {
  const lockExpiresAt                     = useRef<number>(0)
  const [otp,           setOtp]           = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [resendSec,     setResendSec]     = useState(() =>
    Math.max(0, Math.floor((resendExpiresAt.current - now()) / 1000))
  )
  const [resending,     setResending]     = useState(false)
  const [lockState,     setLockState]     = useState<'none' | 'temporary' | 'permanent'>('none')
  const [lockRemaining, setLockRemaining] = useState(0)
  const [statusChecked, setStatusChecked] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const applyStatus = useCallback((status: Awaited<ReturnType<typeof getAuthStatus>>) => {
    if (status.permanent) {
      setLockState('permanent')
    } else if (status.locked_until) {
      const expiry = new Date(status.locked_until).getTime()
      lockExpiresAt.current = expiry
      setLockState('temporary')
      setLockRemaining(Math.max(0, Math.floor((expiry - now()) / 1000)))
    } else {
      setLockState('none')
      setLockRemaining(0)
    }
  }, [])

  useEffect(() => {
    async function checkStatus() {
      try {
        const status = await getAuthStatus(email)
        applyStatus(status)
      } catch {
      } finally {
        setStatusChecked(true)
      }
    }
    checkStatus()
  }, [email, applyStatus])

  useEffect(() => {
    if (resendSec <= 0) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((resendExpiresAt.current - now()) / 1000))
      setResendSec(remaining)
    }, 500)
    return () => clearInterval(interval)
  }, [resendSec, resendExpiresAt])

  useEffect(() => {
    if (lockState !== 'temporary') return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((lockExpiresAt.current - now()) / 1000))
      setLockRemaining(remaining)
      if (remaining <= 0) {
        setLockState('none')
        setError('')
        setOtp(Array(OTP_LENGTH).fill(''))
        setTimeout(() => inputRefs.current[0]?.focus(), 100)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [lockState])

  const focusInput = (idx: number) => inputRefs.current[idx]?.focus()

  const handleChange = (idx: number, val: string) => {
    if (lockState !== 'none') return
    const char = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]; next[idx] = char; setOtp(next); setError('')
    if (char && idx < OTP_LENGTH - 1) focusInput(idx + 1)
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (lockState !== 'none') return
    if (e.key === 'Backspace') {
      if (otp[idx]) { const n = [...otp]; n[idx] = ''; setOtp(n) }
      else if (idx > 0) focusInput(idx - 1)
    } else if (e.key === 'ArrowLeft'  && idx > 0)              focusInput(idx - 1)
      else if (e.key === 'ArrowRight' && idx < OTP_LENGTH - 1) focusInput(idx + 1)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (lockState !== 'none') return
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    e.preventDefault()
    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((c, i) => { next[i] = c })
    setOtp(next)
    focusInput(Math.min(pasted.length, OTP_LENGTH - 1))
  }

  function classifyError(message: string): 'temporary' | 'permanent' | 'none' {
    if (message.toLowerCase().includes('permanently locked')) return 'permanent'
    if (message.toLowerCase().includes('please contact'))    return 'permanent'
    if (
      message.toLowerCase().includes('temporarily locked') ||
      message.toLowerCase().includes('account locked')     ||
      message.toLowerCase().includes('too many failed')
    ) return 'temporary'
    return 'none'
  }

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const code = otp.join('')

  const handleSubmit = useCallback(async () => {
    if (code.length !== OTP_LENGTH || lockState !== 'none') return
    setLoading(true); setError('')
    try {
      const res = await verifyOtp(email, code)
      const destination = res.portalUrl ?? getFallbackRoute(res.user.role)
      onSuccess(res.user, destination)
    } catch (err) {
      const message = extractErrorMessage(err, 'Invalid or expired code. Please try again.')
      const detected = classifyError(message)
      setError(message)
      setLockState(detected)
      setOtp(Array(OTP_LENGTH).fill(''))

      if (detected === 'temporary') {
        try {
          const status = await getAuthStatus(email)
          if (status.locked_until) {
            const expiry = new Date(status.locked_until).getTime()
            lockExpiresAt.current = expiry
            setLockRemaining(Math.max(0, Math.floor((expiry - now()) / 1000)))
          }
        } catch {
          const expiry = now() + 3 * 60 * 1000
          lockExpiresAt.current = expiry
          setLockRemaining(3 * 60)
        }
      }

      if (detected === 'none') focusInput(0)
    } finally {
      setLoading(false)
    }
  }, [code, email, onSuccess, lockState])

  useEffect(() => {
    if (code.length === OTP_LENGTH) handleSubmit()
  }, [code, handleSubmit])

  const handleResend = async () => {
    if (lockState !== 'none') return
    setResending(true); setError('')
    try {
      await requestOtp(email)
      try {
        const status = await getAuthStatus(email)
        applyStatus(status)
      } catch {}
      resendExpiresAt.current = now() + RESEND_SECS * 1000
      setResendSec(RESEND_SECS)
      setOtp(Array(OTP_LENGTH).fill(''))
      focusInput(0)
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to resend. Please try again.'))
    } finally {
      setResending(false)
    }
  }

  if (!statusChecked) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="inline-block w-5 h-5 border-2 border-white/20
          border-t-white/60 rounded-full animate-spin" />
      </div>
    )
  }

  if (lockState === 'permanent') {
    return <PermanentLockScreen onBack={onBack} />
  }

  return (
    <motion.div
      key="otp-step"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-[#4df9ed]">
          <IconShield />
          <span
            className="text-[0.72rem] font-semibold tracking-[0.18em] uppercase"
            style={{ fontFamily: "'League Spartan', sans-serif" }}
          >
            Check your email
          </span>
        </div>
        <p
          className="text-white/40 text-[0.8rem] leading-relaxed"
          style={{ fontFamily: "'League Spartan', sans-serif" }}
        >
          6-digit code sent to{' '}
          <span className="text-[#4df9ed]/70 break-all" style={{ fontFamily: 'monospace' }}>
            {email}
          </span>
        </p>
      </div>

      <div className="flex gap-2" onPaste={handlePaste}>
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
            disabled={lockState !== 'none'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`flex-1 min-w-0 h-14 text-center text-xl font-bold outline-none
              rounded-2xl transition-all duration-200
              disabled:opacity-40 disabled:cursor-not-allowed
              ${error && lockState === 'none' ? 'shake' : ''}`}
            style={{
              background: lockState !== 'none'
                ? 'rgba(255,255,255,0.04)'
                : digit ? 'rgba(77,249,237,0.08)' : 'rgba(255,255,255,0.08)',
              border: lockState === 'temporary'
                ? '1px solid rgba(251,146,60,0.4)'
                : digit
                  ? '1px solid rgba(77,249,237,0.4)'
                  : '1px solid rgba(255,255,255,0.13)',
              backdropFilter: 'blur(12px)',
              color: digit ? '#4df9ed' : '#fff',
              fontFamily: 'monospace',
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {lockState === 'temporary' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl px-4 py-3 text-[0.78rem] leading-relaxed flex items-center justify-between gap-4"
            style={{
              background: 'rgba(251,146,60,0.08)',
              border: '1px solid rgba(251,146,60,0.25)',
              color: 'rgba(251,146,60,0.85)',
              fontFamily: "'League Spartan', sans-serif",
            }}
          >
            <span>Account temporarily locked. Try again in</span>
            <span
              className="font-bold shrink-0"
              style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: 'rgba(251,146,60,1)' }}
            >
              {formatCountdown(lockRemaining)}
            </span>
          </motion.div>
        )}

        {lockState === 'none' && error && (
          <ErrorMessage message={error} />
        )}
      </AnimatePresence>

      <PrimaryButton
        loading={loading}
        disabled={code.length !== OTP_LENGTH || lockState !== 'none'}
        onClick={handleSubmit}
      >
        {lockState === 'temporary' ? 'Locked' : 'Verify & Sign In'}
      </PrimaryButton>

      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} label="Back" />

        {lockState === 'none' && (
          <button
            onClick={handleResend}
            disabled={resendSec > 0 || resending}
            className="text-[0.78rem] bg-transparent border-none cursor-pointer transition-colors
              disabled:text-white/25 disabled:cursor-not-allowed
              enabled:text-[#4df9ed]/70 enabled:hover:text-[#4df9ed]"
            style={{ fontFamily: "'League Spartan', sans-serif" }}
          >
            {resending ? 'Sending…' : resendSec > 0 ? `Resend in ${resendSec}s` : 'Resend code'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── Step 3b: Password ────────────────────────────────────────────────────────

function PasswordStep({
  email,
  onSuccess,
  onBack,
}: {
  email: string
  onSuccess: (user: AuthUser, portalUrl: string) => void
  onBack: () => void
}) {
  const lockExpiresAt = useRef<number>(0)
  const [password,      setPassword]      = useState('')
  const [showPassword,  setShowPassword]  = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [lockState,     setLockState]     = useState<'none' | 'temporary' | 'permanent'>('none')
  const [lockRemaining, setLockRemaining] = useState(0)

  useEffect(() => {
    if (lockState !== 'temporary') return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((lockExpiresAt.current - now()) / 1000))
      setLockRemaining(remaining)
      if (remaining <= 0) {
        setLockState('none')
        setError('')
      }
    }, 500)
    return () => clearInterval(interval)
  }, [lockState])

  function classifyError(message: string): 'temporary' | 'permanent' | 'none' {
    if (message.toLowerCase().includes('permanently locked')) return 'permanent'
    if (message.toLowerCase().includes('please contact'))    return 'permanent'
    if (
      message.toLowerCase().includes('temporarily locked') ||
      message.toLowerCase().includes('account locked')     ||
      message.toLowerCase().includes('too many failed')
    ) return 'temporary'
    return 'none'
  }

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || lockState !== 'none') return
    setLoading(true); setError('')
    try {
      const res = await loginWithPassword(email, password)
      const destination = res.portalUrl ?? getFallbackRoute(res.user.role)
      onSuccess(res.user, destination)
    } catch (err) {
      const message = extractErrorMessage(err, 'Incorrect password. Please try again.')
      const detected = classifyError(message)
      setError(message)
      setLockState(detected)
      setPassword('')

      if (detected === 'temporary') {
        try {
          const status = await getAuthStatus(email)
          if (status.locked_until) {
            const expiry = new Date(status.locked_until).getTime()
            lockExpiresAt.current = expiry
            setLockRemaining(Math.max(0, Math.floor((expiry - now()) / 1000)))
          }
        } catch {
          const expiry = now() + 3 * 60 * 1000
          lockExpiresAt.current = expiry
          setLockRemaining(3 * 60)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  if (lockState === 'permanent') {
    return <PermanentLockScreen onBack={onBack} />
  }

  return (
    <motion.div
      key="password-step"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-white/60">
          <IconLock />
          <span
            className="text-[0.72rem] font-semibold tracking-[0.18em] uppercase"
            style={{ fontFamily: "'League Spartan', sans-serif" }}
          >
            Enter your password
          </span>
        </div>
        <p
          className="text-white/40 text-[0.8rem] leading-relaxed"
          style={{ fontFamily: "'League Spartan', sans-serif" }}
        >
          Signing in as{' '}
          <span className="text-[#4df9ed]/70 break-all" style={{ fontFamily: 'monospace' }}>
            {email}
          </span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <GlassInput icon={<IconLock />} label="Password">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            placeholder="••••••••"
            required
            autoFocus
            disabled={lockState !== 'none'}
            className="w-full bg-transparent text-white text-[0.95rem] outline-none
              placeholder-white/20 disabled:opacity-40"
            style={{ fontFamily: "'League Spartan', sans-serif" }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="text-white/30 hover:text-white/60 transition-colors
              bg-transparent border-none cursor-pointer shrink-0 p-0"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <IconEye visible={showPassword} />
          </button>
        </GlassInput>

        <AnimatePresence mode="wait">
          {lockState === 'temporary' && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl px-4 py-3 text-[0.78rem] leading-relaxed flex items-center justify-between gap-4"
              style={{
                background: 'rgba(251,146,60,0.08)',
                border: '1px solid rgba(251,146,60,0.25)',
                color: 'rgba(251,146,60,0.85)',
                fontFamily: "'League Spartan', sans-serif",
              }}
            >
              <span>Account temporarily locked. Try again in</span>
              <span
                className="font-bold shrink-0"
                style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: 'rgba(251,146,60,1)' }}
              >
                {formatCountdown(lockRemaining)}
              </span>
            </motion.div>
          )}
          {lockState === 'none' && error && (
            <ErrorMessage message={error} />
          )}
        </AnimatePresence>

        <PrimaryButton
          type="submit"
          loading={loading}
          disabled={!password || lockState !== 'none'}
        >
          {lockState === 'temporary' ? 'Locked' : 'Sign In'}
        </PrimaryButton>
      </form>

      {/* ── Forgot password ── */}
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} label="Back" />
        <a
          href={`mailto:${ADMIN_EMAIL}?subject=Password%20Reset%20Request`}
          className="text-[0.75rem] transition-colors no-underline"
          style={{
            color: 'rgba(255,255,255,0.28)',
            fontFamily: "'League Spartan', sans-serif",
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(77,249,237,0.65)')}
          onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.28)')}
        >
          Forgot password?
        </a>
      </div>

      {/* ── Forgot password hint ── */}
      <p
        className="text-[0.71rem] leading-relaxed -mt-3 text-center"
        style={{
          color: 'rgba(255,255,255,0.18)',
          fontFamily: "'League Spartan', sans-serif",
        }}
      >
        Password resets are managed by your administrator.{' '}
        <a
          href={`mailto:${ADMIN_EMAIL}?subject=Password%20Reset%20Request`}
          className="underline underline-offset-2 transition-opacity hover:opacity-80 no-underline"
          style={{ color: 'rgba(77,249,237,0.45)', textDecoration: 'underline' }}
        >
          {ADMIN_EMAIL}
        </a>
      </p>
    </motion.div>
  )
}

// ─── Success ──────────────────────────────────────────────────────────────────

function SuccessStep() {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center gap-5 py-8 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.1 }}
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(77,249,237,0.1)', border: '1px solid rgba(77,249,237,0.3)' }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
          stroke="#4df9ed" strokeWidth="1.6">
          <path d="m20 6-11 11-5-5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.div>

      <p
        className="text-white/40 text-sm"
        style={{ fontFamily: "'League Spartan', sans-serif" }}
      >
        Redirecting...
      </p>

      <div className="flex gap-1.5">
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

// ─── Modal shell ──────────────────────────────────────────────────────────────

type Step = 'email' | 'method' | 'otp' | 'password' | 'success'

const STEP_ORDER:    Step[] = ['email', 'method', 'otp',      'success']
const STEP_ORDER_PW: Step[] = ['email', 'method', 'password', 'success']

interface SignInModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const router              = useRouter()
  const [step,   setStep]   = useState<Step>('email')
  const [email,  setEmail]  = useState('')
  const [method, setMethod] = useState<'otp' | 'password' | null>(null)
  const resendExpiresAt     = useRef<number>(0)

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, handleClose])

  const handleEmailSuccess = (e: string) => {
    setEmail(e)
    setStep('method')
  }

  const handleSelectOtp = (retryAfter?: number) => {
    setMethod('otp')
    resendExpiresAt.current = now() + (retryAfter ?? RESEND_SECS) * 1000
    setStep('otp')
  }

  const handleSelectPassword = () => {
    setMethod('password')
    setStep('password')
  }

  const handleAuthSuccess = async (user: AuthUser, portalUrl: string) => {
    const mustChange = user.must_change_password

    let finalUser = user
    try {
      const freshUser = await getMe()
      finalUser = { ...freshUser, must_change_password: freshUser.must_change_password ?? mustChange }
    } catch {
      // keep original login response user
    }

    useAuthStore.getState().setUser(finalUser)

    const shouldChangePassword = finalUser.must_change_password

    setStep('success')
    setTimeout(() => {
      handleClose()
      setStep('email')
      setEmail('')
      setMethod(null)
      resendExpiresAt.current = 0

      if (shouldChangePassword) {
        router.replace(`/change-password?redirect=${encodeURIComponent(portalUrl)}`)
      } else {
        const ch = new BroadcastChannel(`auth_sync_${finalUser.user_id}`)
        ch.postMessage({ type: 'LOGIN', user: finalUser, portalUrl })
        ch.close()
        router.replace(portalUrl)
      }
    }, 1800)
  }

  const progressSteps = method === 'password' ? STEP_ORDER_PW : STEP_ORDER
  const currentIdx    = progressSteps.indexOf(step === 'success' ? 'success' : step)

  return (
    <>
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-5px)}
          40%{transform:translateX(5px)}
          60%{transform:translateX(-3px)}
          80%{transform:translateX(3px)}
        }
        .shake { animation: shake 0.38s ease; }
      `}</style>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[80] bg-black/50"
            />

            <motion.aside
              key="panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="fixed top-0 right-0 bottom-0 z-[90] flex flex-col
                w-full sm:w-[480px] lg:w-[42vw] max-w-[560px]"
              style={{
                background: 'rgba(10, 10, 10, 0.2)',
                backdropFilter: 'blur(5px)',
                borderLeft: '1px solid rgba(255,255,255,0.07)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 right-0 h-[1px]
                bg-gradient-to-r from-transparent via-[#4df9ed]/40 to-transparent" />

              <div className="relative flex flex-col h-full px-8 sm:px-12 py-10 overflow-y-auto">
                <button
                  onClick={handleClose}
                  aria-label="Close"
                  className="self-end w-9 h-9 rounded-full flex items-center justify-center
                    text-white/40 hover:text-white hover:bg-white/[0.08]
                    transition-all duration-200 mb-10 cursor-pointer bg-transparent border-none"
                >
                  <IconClose />
                </button>

                <div className="mb-10">
                  <h2 className="text-white font-body tracking-[0.15em] uppercase leading-tight">
                    Sign In Your Account
                  </h2>

                  {step !== 'success' && (
                    <div className="flex gap-1.5 mt-4">
                      {progressSteps.filter(s => s !== 'success').map((s, i) => (
                        <motion.div
                          key={s}
                          className="h-[3px] rounded-full"
                          animate={{
                            width: i === currentIdx ? 28 : 10,
                            backgroundColor: i === currentIdx
                              ? 'rgba(77,249,237,0.85)'
                              : i < currentIdx
                                ? 'rgba(77,249,237,0.35)'
                                : 'rgba(255,255,255,0.12)',
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  {step === 'email' && (
                    <EmailStep key="email" onSuccess={handleEmailSuccess} />
                  )}
                  {step === 'method' && (
                    <MethodStep
                      key="method"
                      email={email}
                      onSelectOtp={handleSelectOtp}
                      onSelectPassword={handleSelectPassword}
                      onBack={() => setStep('email')}
                    />
                  )}
                  {step === 'otp' && (
                    <OtpStep
                      key="otp"
                      email={email}
                      resendExpiresAt={resendExpiresAt}
                      onSuccess={handleAuthSuccess}
                      onBack={() => setStep('method')}
                    />
                  )}
                  {step === 'password' && (
                    <PasswordStep
                      key="password"
                      email={email}
                      onSuccess={handleAuthSuccess}
                      onBack={() => setStep('method')}
                    />
                  )}
                  {step === 'success' && (
                    <SuccessStep key="success" />
                  )}
                </AnimatePresence>

                {/* ── Be Our Partner footer — visible on all steps except success ── */}
                {step !== 'success' && (
                  <div className="mt-auto pt-10">
                    <div
                      className="h-[1px] mb-6"
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                    />
                    <div className="flex items-center justify-between gap-4">
                      <p
                        className="text-[0.73rem] leading-snug"
                        style={{
                          color: 'rgba(255,255,255,0.25)',
                          fontFamily: "'League Spartan', sans-serif",
                        }}
                      >
                        Interested in working with us?
                      </p>
                      <a
                        href="#contact"
                        onClick={handleClose}
                        className="shrink-0 text-[0.75rem] tracking-[0.15em] uppercase
                          px-4 py-2 rounded-xl transition-all duration-200 no-underline"
                        style={{
                          fontFamily: "'League Spartan', sans-serif",
                          background: 'rgba(77,249,237,0.06)',
                          border: '1px solid rgba(77,249,237,0.2)',
                          color: 'rgba(77,249,237,0.75)',
                        }}
                        onMouseEnter={e => {
                          const el = e.currentTarget as HTMLAnchorElement
                          el.style.background = 'rgba(77,249,237,0.12)'
                          el.style.color = 'rgba(77,249,237,1)'
                        }}
                        onMouseLeave={e => {
                          const el = e.currentTarget as HTMLAnchorElement
                          el.style.background = 'rgba(77,249,237,0.06)'
                          el.style.color = 'rgba(77,249,237,0.75)'
                        }}
                      >
                        Be Our Partner
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}