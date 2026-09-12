'use client'

import { motion, AnimatePresence } from 'framer-motion'

/**
 * Shared password-entry primitives for the two places a user sets a password:
 * the forced first-login change (/change-password) and an admin-approved reset
 * (/reset-password).
 *
 * One definition on purpose. These rules have to match the backend's
 * `passwordField()` zod rule exactly, and keeping two copies is how they drift
 * apart until a form accepts something the API then rejects.
 */

export interface Requirement {
  label: string
  test:  (v: string) => boolean
}

/**
 * The rules that actually GATE submission — these mirror `passwordField()` in
 * logistics-backend/src/schema/admin/shared.schema.ts one for one.
 *
 * Note what is absent: a special-character rule. Both of these screens used to
 * display one as if it were required, but the API has never enforced it, so it
 * was a rule users had to satisfy for no reason. It lives in STRENGTH_BONUS
 * below instead, where it reads as the advice it always was. If the backend rule
 * ever gains a special-character requirement, move it back up here.
 */
export const REQUIREMENTS: Requirement[] = [
  { label: 'At least 8 characters',     test: v => v.length >= 8 },
  { label: 'One uppercase letter (A–Z)', test: v => /[A-Z]/.test(v) },
  { label: 'One lowercase letter (a–z)', test: v => /[a-z]/.test(v) },
  { label: 'One number (0–9)',           test: v => /\d/.test(v) },
]

// Advisory only — these move the strength meter but never block the button.
const STRENGTH_BONUS: Requirement[] = [
  { label: '12 characters or more',  test: v => v.length >= 12 },
  { label: 'A symbol (!@#…)',        test: v => /[^A-Za-z0-9]/.test(v) },
]

const STRENGTH_STEPS = REQUIREMENTS.length + STRENGTH_BONUS.length

/** True when every gating rule is satisfied. */
export function meetsRequirements(password: string): boolean {
  return REQUIREMENTS.every(r => r.test(password))
}

export function getStrength(password: string): number {
  if (password.length === 0) return 0
  return [...REQUIREMENTS, ...STRENGTH_BONUS].filter(r => r.test(password)).length
}

export function StrengthBar({ strength }: { strength: number }) {
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#4df9ed', '#4df9ed']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent', 'Excellent']

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {Array.from({ length: STRENGTH_STEPS }).map((_, i) => (
          <motion.div
            key={i}
            className="flex-1 h-[3px] rounded-full"
            animate={{
              backgroundColor: i < strength
                ? colors[Math.min(strength - 1, colors.length - 1)]
                : 'rgba(255,255,255,0.1)',
            }}
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
            style={{ color: colors[Math.min(strength - 1, colors.length - 1)] }}
          >
            {labels[Math.min(strength, labels.length - 1)]}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

export function IconEye({ visible }: { visible: boolean }) {
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

export function IconLock({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

export function IconCheck({ filled }: { filled: boolean }) {
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

/** The requirements checklist panel, identical on both screens. */
export function RequirementsPanel({ password }: { password: string }) {
  return (
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
            key={req.label}
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
  )
}
