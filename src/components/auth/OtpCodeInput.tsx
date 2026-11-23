'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'

/**
 * Six boxes for an emailed code, with the look of the sign-in screen's code step
 * (SignInModal OtpStep). Used by Profile → Reset Password (2026-11-23).
 *
 * - Typing moves to the next box; Backspace clears and steps back; arrows move.
 * - Pasting, or iOS / Android filling the code from the email (one-time-code),
 *   puts a whole code in one box at once: it is spread over the boxes.
 * - `value` is the digits typed so far ("" … "123456").
 */

export interface OtpCodeInputHandle { focus: () => void }

interface Props {
  value: string
  onChange: (code: string) => void
  length?: number
  disabled?: boolean
  invalid?: boolean
  /** Names the group for screen readers (and tests). */
  label?: string
  describedBy?: string
  onEnter?: () => void
}

const OtpCodeInput = forwardRef<OtpCodeInputHandle, Props>(function OtpCodeInput(
  { value, onChange, length = 6, disabled, invalid, label = 'Code', describedBy, onEnter },
  ref,
) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')
  const focusAt = (i: number) => inputs.current[Math.max(0, Math.min(length - 1, i))]?.focus()

  useImperativeHandle(ref, () => ({ focus: () => focusAt(Math.min(value.length, length - 1)) }))

  const setFrom = (idx: number, text: string) => {
    const clean = text.replace(/\D/g, '')
    const next = [...digits]
    if (clean.length > 1) {
      // A whole code at once (paste / autofill): fill from the start when it is
      // a full code, else from this box.
      const from = clean.length >= length ? 0 : idx
      clean.slice(0, length - from).split('').forEach((c, i) => { next[from + i] = c })
      onChange(next.join('').slice(0, length))
      focusAt(Math.min(from + clean.length, length - 1))
      return
    }
    next[idx] = clean
    // Keep the digits contiguous: a box left empty in the middle ends the code there.
    onChange(next.join(''))
    if (clean && idx < length - 1) focusAt(idx + 1)
  }

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex gap-2">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`${label} digit ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          value={digit}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '')
            // One new digit typed next to the old one (the box was not selected):
            // keep the new one. Anything longer is a pasted / autofilled code.
            setFrom(i, raw.length === 2 && digit ? (raw.startsWith(digit) ? raw[1] : raw[0]) : raw)
          }}
          onPaste={(e) => { e.preventDefault(); setFrom(i, e.clipboardData.getData('text')) }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              if (digit) { const n = [...digits]; n[i] = ''; onChange(n.join('')) }
              else if (i > 0) { const n = [...digits]; n[i - 1] = ''; onChange(n.join('')); focusAt(i - 1) }
              e.preventDefault()
            } else if (e.key === 'ArrowLeft') focusAt(i - 1)
            else if (e.key === 'ArrowRight') focusAt(i + 1)
            else if (e.key === 'Enter') onEnter?.()
          }}
          onFocus={(e) => e.target.select()}
          className={`h-14 min-w-0 flex-1 rounded-2xl text-center text-xl font-bold outline-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40`}
          style={{
            background: invalid ? 'rgba(246,38,38,0.08)' : digit ? 'rgba(77,249,237,0.08)' : 'rgba(255,255,255,0.08)',
            border: invalid
              ? '1px solid rgba(246,38,38,0.6)'
              : digit ? '1px solid rgba(77,249,237,0.4)' : '1px solid rgba(255,255,255,0.13)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: digit ? '#4df9ed' : '#fff',
          }}
        />
      ))}
    </div>
  )
})

export default OtpCodeInput
