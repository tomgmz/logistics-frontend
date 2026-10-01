import { z } from 'zod'

/**
 * The person-field rules every form in the web app uses: names, email, phone.
 *
 * Mirrors logistics-backend/src/schema/admin/shared.schema.ts. Keep the two in
 * step — a value this side accepts but the backend rejects shows up as a
 * confusing server error after the user thought the form was fine.
 */

export const PH_MOBILE_REGEX   = /^\+639[0-9]{9}$/
export const PH_LANDLINE_REGEX = /^\+63[0-9]{9}$/

const EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9]|[._%+-](?=[a-zA-Z0-9]))*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/

const FIRST_NAME_REGEX  = /^[\p{L}]+\.?(?:[ '-][\p{L}]+\.?)*$/u
const LAST_NAME_REGEX   = /^[\p{L}](?:[\p{L}'-]*[\p{L}])?(?: [\p{L}'-]+[\p{L}])*$/u
const MIDDLE_NAME_REGEX = /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u

/** Capitalize the first letter of each word (start, space, hyphen, apostrophe). */
export function toNameCase(value: string): string {
  return value.replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
}

/**
 * Whatever someone typed for a PH mobile — "0917 123 4567", "9171234567",
 * "+63 917-123-4567" — as +639XXXXXXXXX. Anything that is not a mobile number
 * is returned trimmed and unchanged, so the validator can say what is wrong.
 */
export function normalizePhMobile(raw: string): string {
  const trimmed = raw.trim()
  const digits  = trimmed.replace(/\D/g, '')
  if (/^09\d{9}$/.test(digits))  return `+63${digits.slice(1)}`
  if (/^639\d{9}$/.test(digits)) return `+${digits}`
  if (/^9\d{9}$/.test(digits))   return `+63${digits}`
  return trimmed
}

export const firstNameField = z
  .string({ error: 'First name is required' })
  .trim()
  .min(2, 'First name must be at least 2 characters')
  .max(50, 'First name is too long')
  .regex(FIRST_NAME_REGEX, 'First name may only contain letters, spaces, hyphens, or apostrophes')

export const lastNameField = z
  .string({ error: 'Last name is required' })
  .trim()
  .min(2, 'Last name must be at least 2 characters')
  .max(50, 'Last name is too long')
  .regex(LAST_NAME_REGEX, 'Last name may only contain letters, spaces, hyphens, or apostrophes')

export const middleNameField = z
  .string()
  .optional()
  .nullable()
  .transform(v => (v == null ? v : v.trim() === '' ? null : v.trim()))
  .refine(v => v == null || v.length >= 2, 'Middle name must be at least 2 characters')
  .refine(v => v == null || v.length <= 50, 'Middle name is too long')
  .refine(
    v => v == null || MIDDLE_NAME_REGEX.test(v),
    'Middle name may only contain letters, spaces, hyphens, or apostrophes',
  )

export const suffixField = z.preprocess(
  v => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string()
    .max(20, 'Suffix is too long')
    .regex(/^[\p{L}0-9 .,'-]*$/u, 'Suffix may only contain letters, numbers, spaces, periods, commas, apostrophes, or hyphens')
    .optional()
    .nullable(),
)

/** A whole name in one box, e.g. a vendor driver: "Juan Dela Cruz Jr.". */
export const fullNameField = (label = 'Name') =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(100, `${label} is too long`)
    .regex(FIRST_NAME_REGEX, `${label} may only contain letters, spaces, hyphens, periods, or apostrophes`)

export const emailField = z
  .string({ error: 'Email is required' })
  .trim()
  .min(5, 'Email is too short')
  .max(254, 'Email is too long')
  .regex(EMAIL_REGEX, 'Please enter a valid email address')
  .refine(v => v.split('@')[0].length <= 64, 'Email local part is too long')
  .refine(v => {
    const domain = v.split('@')[1]
    if (!domain) return true
    const parts = domain.split('.')
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === parts[i + 1]) return false
    }
    return true
  }, 'Please enter a valid email address')
  .transform(v => v.toLowerCase())

/** Blank is allowed and means "none given". */
export const optionalEmailField = z.preprocess(
  v => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  emailField.optional(),
)

export const mobileField = z
  .string({ error: 'Phone is required' })
  .trim()
  .regex(PH_MOBILE_REGEX, 'Enter a valid PH mobile number (+639XXXXXXXXX)')

/** Blank is allowed and means "none given". */
export const optionalMobileField = z.preprocess(
  v => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  mobileField.optional(),
)

export const optionalLandlineField = z
  .string()
  .regex(PH_LANDLINE_REGEX, 'Enter a valid PH landline')
  .optional()
  .nullable()
  .transform(v => (v === '' ? null : v))

/** First message per field, keyed by the field name — the shape every form here renders. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[issue.path.length - 1] as string
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}
