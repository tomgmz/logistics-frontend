'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth.store'
import { changePassword } from '@/lib/api/auth.api'
import { ROLE_ROUTES } from '@/constants/roles'

interface Requirement {
  label: string
  test: (v: string) => boolean
}

const REQUIREMENTS: Requirement[] = [
  { label: 'At least 8 characters',        test: v => v.length >= 8 },
  { label: 'One uppercase letter (A–Z)',    test: v => /[A-Z]/.test(v) },
  { label: 'One lowercase letter (a–z)',    test: v => /[a-z]/.test(v) },
  { label: 'One number (0–9)',              test: v => /\d/.test(v) },
  { label: 'One special character (!@#…)', test: v => /[^A-Za-z0-9]/.test(v) },
]

function getStrength(password: string): number {
  return REQUIREMENTS.filter(r => r.test(password)).length
}

function StrengthBar({ strength }: { strength: number }) {
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#4df9ed']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent']

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <motion.div
            key={i}
            className="flex-1 h-[3px] rounded-full"
            animate={{ backgroundColor: i < strength ? colors[strength - 1] : 'rgba(255,255,255,0.1)' }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        {strength > 0 && (
          <motion.span
            key={strength}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="font-spartan text-[0.65rem] tracking-widest uppercase"
            style={{ color: colors[strength - 1] }}
          >
            {labels[strength]}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

function IconEye({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function IconLock({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

function IconCheck({ filled }: { filled: boolean }) {
  return (
    <motion.svg
      width="13" height="13" viewBox="0 0 24 24" fill="none"
      animate={{ scale: filled ? 1 : 0.85 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <circle
        cx="12" cy="12" r="10"
        fill={filled ? 'rgba(77,249,237,0.15)' : 'transparent'}
        stroke={filled ? '#4df9ed' : 'rgba(255,255,255,0.2)'}
        strokeWidth="1.5"
      />
      {filled && (
        <motion.path
          d="m8 12 3 3 5-5"
          stroke="#4df9ed"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.25 }}
        />
      )}
    </motion.svg>
  )
}

function Logo() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-start gap-0.5"
    >
      <span className="ff-sc text-white text-lg sm:text-[1.35rem] tracking-[0.25em] uppercase leading-none">
        8338
      </span>
      <span className="font-spartan text-[#4df9ed]/60 text-[0.58rem] sm:text-[0.62rem] tracking-[0.35em] uppercase leading-none">
        Logistics Services
      </span>
    </motion.div>
  )
}

export default function ChangePasswordPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const user         = useAuthStore(s => s.user)
  const setUser      = useAuthStore(s => s.setUser)
  const hasHydrated  = useAuthStore(s => s.hasHydrated)

  const [password,     setPassword]     = useState('')
  const [confirm,      setConfirm]      = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [done,         setDone]         = useState(false)

  const strength       = getStrength(password)
  const allMet         = strength === REQUIREMENTS.length
  const passwordsMatch = password === confirm && confirm.length > 0
  const canSubmit      = allMet && passwordsMatch && !loading

  const destination = useCallback(() => {
    const redirect = searchParams.get('redirect')
    if (redirect) return redirect
    if (user?.role) return ROLE_ROUTES[user.role] ?? '/'
    return '/'
  }, [searchParams, user])

  useEffect(() => {
    if (!hasHydrated) return
    if (!user) { router.replace('/'); return }
    // Treat undefined/null the same as false — if must_change_password is not
    // explicitly true, the user has already changed it or doesn't need to
    if (!user.must_change_password) router.replace(destination())
  }, [hasHydrated, user, router, destination])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')
    try {
      await changePassword(password)

      // Clear the middleware gate cookie so other tabs are unblocked
      await fetch('/api/auth/clear-must-change', { method: 'POST' })

      // Update the store so the redirect effect doesn't re-trigger
      setUser({ ...user!, must_change_password: false })

      // Notify all other tabs so they update their store and navigate to portal
      if (user?.user_id) {
        const ch = new BroadcastChannel(`auth_sync_${user.user_id}`)
        ch.postMessage({ type: 'PASSWORD_CHANGED', portalUrl: destination() })
        ch.close()
      }

      setDone(true)
      setTimeout(() => router.replace(destination()), 1800)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!hasHydrated || !user) {
    return (
      <div
        className="bg-[#0a0a0a] flex items-center justify-center"
        style={{ minHeight: '100dvh' }}
      >
        <span className="inline-block w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    )
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
        <Logo />
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="font-spartan text-[0.6rem] sm:text-[0.68rem] tracking-[0.2em] uppercase text-white/20"
        >
          Security Setup
        </motion.span>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-6 sm:py-10">
        <AnimatePresence mode="wait">
          {done ? (
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
                      Set Your Password
                    </h1>
                    <p className="font-spartan text-white/35 text-[0.73rem] sm:text-[0.78rem] leading-relaxed">
                      Welcome,{' '}
                      <span className="text-[#4df9ed]/70">{user.first_name ?? user.email}</span>.
                      {' '}A new password is required to continue.
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

                  <motion.div
                    className="flex flex-col gap-2 py-3 px-4 rounded-xl"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                  >
                    <span className="font-spartan text-[0.62rem] tracking-[0.18em] uppercase text-white/25 mb-0.5">
                      Requirements
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                      {REQUIREMENTS.map((req, i) => (
                        <motion.div
                          key={i}
                          className="flex items-center gap-2"
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.28 + i * 0.04 }}
                        >
                          <IconCheck filled={req.test(password)} />
                          <span
                            className="font-spartan text-[0.72rem] transition-colors duration-200"
                            style={{
                              color: req.test(password)
                                ? 'rgba(77,249,237,0.8)'
                                : 'rgba(255,255,255,0.35)',
                            }}
                          >
                            {req.label}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>

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
                    ) : 'Set Password & Continue'}
                  </motion.button>
                </form>
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="font-spartan text-center text-white/20 text-[0.66rem] tracking-wider mt-4"
              >
                You will only need to do this once.
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
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
          Password Updated
        </h2>
        <p className="font-spartan text-white/35 text-[0.8rem]">
          Redirecting to your dashboard…
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