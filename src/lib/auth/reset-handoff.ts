/**
 * Hands a password-reset token from the code screen (sign-in "Reset with an
 * emailed code", Profile → Reset Password) to /reset-password IN MEMORY, so it
 * never goes into the address bar, the browser history or a Referer header
 * (2026-11-23). Client-side navigation keeps this module alive between the two
 * screens. A reload of the reset page loses it on purpose: the person asks for
 * a new code.
 *
 * Read with peek (React may run state initialisers twice in development) and
 * clear once the page has it.
 */
let pending: string | null = null

export function handOffResetToken(token: string): void {
  pending = token
}

export function peekResetToken(): string | null {
  return pending
}

export function clearResetToken(): void {
  pending = null
}
