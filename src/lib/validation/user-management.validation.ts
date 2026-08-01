import { z } from 'zod'

export const USER_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const

const PH_MOBILE_REGEX   = /^\+639[0-9]{9}$/
const PH_LANDLINE_REGEX = /^\+63[0-9]{9}$/

const emailRegex =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9]|[._%+-](?=[a-zA-Z0-9]))*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/

const firstName = z
  .string({ error: 'First name is required' })
  .min(2, 'First name must be at least 2 characters')
  .max(50, 'First name is too long')
  .regex(
    /^[\p{L}]+\.?(?:[ '-][\p{L}]+\.?)*$/u,
    'First name may only contain letters, spaces, hyphens, or apostrophes',
  )

const lastName = z
  .string({ error: 'Last name is required' })
  .min(2, 'Last name must be at least 2 characters')
  .max(50, 'Last name is too long')
  .regex(
    /^[\p{L}](?:[\p{L}'-]*[\p{L}])?(?: [\p{L}'-]+[\p{L}])*$/u,
    'Last name may only contain letters, spaces, hyphens, or apostrophes',
  )

const middleName = z
  .string()
  .optional()
  .nullable()
  .transform(v => (v === '' ? null : v))
  .refine(
    v => v == null || v.length >= 2,
    'Middle name must be at least 2 characters',
  )
  .refine(
    v => v == null || v.length <= 50,
    'Middle name is too long',
  )
  .refine(
    v => v == null || /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u.test(v),
    'Middle name may only contain letters, spaces, hyphens, or apostrophes',
  )

const suffix = z.preprocess(
  v => (v === '' ? null : v),
  z.string()
    .max(20, 'Suffix is too long')
    .regex(/^[\p{L}0-9 .,'-]*$/u, 'Suffix may only contain letters, numbers, spaces, periods, commas, apostrophes, or hyphens')
    .optional()
    .nullable(),
)

const suffixWithOthersCheck = suffix.refine(
  v => v == null || v !== 'others',
  'Please type a suffix when Others is selected',
)

const email = z
  .string({ error: 'Email is required' })
  .min(5, 'Email is too short')
  .max(254, 'Email is too long')
  .regex(emailRegex, 'Please enter a valid email address')
  .refine(
    v => v.split('@')[0].length <= 64,
    'Email local part is too long',
  )
  .refine(v => {
    const domain = v.split('@')[1]
    if (!domain) return true
    const parts  = domain.split('.')
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === parts[i + 1]) return false
    }
    return true
  }, 'Please enter a valid email address')
  .transform(v => v.trim().toLowerCase())

const phone = z
  .string({ error: 'Phone is required' })
  .regex(PH_MOBILE_REGEX, 'Enter a valid PH mobile number (+639XXXXXXXXX)')

const phoneOptional = z
  .string()
  .regex(PH_MOBILE_REGEX, 'Enter a valid PH mobile number (+639XXXXXXXXX)')
  .optional()
  .transform(v => (v === '' ? null : v))

const landlineOptional = z
  .string()
  .regex(PH_LANDLINE_REGEX, 'Enter a valid PH landline')
  .optional()
  .nullable()
  .transform(v => (v === '' ? null : v))

const licenseNumber = z
  .string({ error: 'License number is required' })
  .regex(/^[A-Z]\d{2}-\d{2}-\d{6}$/, 'Use LTO format: A01-23-456789')

const licenseExpiry = z
  .string({ error: 'License expiry is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(val => !isNaN(new Date(val).getTime()), 'Invalid date')
  .refine(val => isNaN(new Date(val).getTime()) || new Date(val) > new Date(), 'License is already expired')

const baseCreateFields = {
  first_name:  firstName,
  last_name:   lastName,
  middle_name: middleName,
  suffix:      suffixWithOthersCheck,
  email,
  phone,
}

const baseUpdateFields = {
  first_name:  firstName.optional(),
  last_name:   lastName.optional(),
  middle_name: middleName,
  suffix:      suffixWithOthersCheck,
  email:       email.optional(),
  phone:       phoneOptional,
}

export const createClientSchema = z.object({
  ...baseCreateFields,
  landline: landlineOptional,
  company_name: z
    .string({ error: 'Company name is required' })
    .min(1, 'Company name is required')
    .max(100, 'Company name is too long'),
  billing_address: z
    .string({ error: 'Billing address is required' })
    .min(1, 'Billing address is required'),
  payment_terms: z
    .number({ error: 'Payment terms must be a number' })
    .int()
    .positive()
    .default(30)
    .optional(),
})

export const updateClientSchema = z.object({
  ...baseUpdateFields,
  landline:        landlineOptional,
  company_name:    z.string().max(100, 'Company name is too long').optional(),
  billing_address: z.string().optional(),
  payment_terms:   z.number().int().positive().optional(),
})

export const createDriverSchema = z
  .object({
    ...baseCreateFields,
    license_number:   licenseNumber,
    license_expiry:   licenseExpiry,
  })

export const updateDriverSchema = z
  .object({
    ...baseUpdateFields,
    license_number: licenseNumber.optional(),
    license_expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .refine(val => !val || !isNaN(new Date(val).getTime()), 'Invalid date')
      .refine(val => !val || new Date(val) > new Date(), 'License is already expired')
      .optional(),
  })

export const createAdminSchema           = z.object(baseCreateFields)
export const updateAdminSchema           = z.object(baseUpdateFields)
export const createAccountantSchema      = z.object(baseCreateFields)
export const updateAccountantSchema      = z.object(baseUpdateFields)
export const createGeneralManagerSchema  = z.object(baseCreateFields)
export const updateGeneralManagerSchema  = z.object(baseUpdateFields)
export const createFleetAdminSchema      = z.object(baseCreateFields)
export const updateFleetAdminSchema      = z.object(baseUpdateFields)
export const createOperationsAdminSchema = z.object(baseCreateFields)
export const updateOperationsAdminSchema = z.object(baseUpdateFields)
export const createITAdminSchema         = z.object(baseCreateFields)
export const updateITAdminSchema         = z.object(baseUpdateFields)

import type { UserTab } from '@/app/types/admin/user-management.types'

type SchemaPair = { create: z.ZodTypeAny; update: z.ZodTypeAny }

export const FORM_SCHEMAS: Record<UserTab, SchemaPair> = {
  admins:              { create: createAdminSchema,           update: updateAdminSchema           },
  clients:             { create: createClientSchema,          update: updateClientSchema          },
  drivers:             { create: createDriverSchema,          update: updateDriverSchema          },
  accountants:         { create: createAccountantSchema,      update: updateAccountantSchema      },
  'general-managers':  { create: createGeneralManagerSchema,  update: updateGeneralManagerSchema  },
  'fleet-admins':      { create: createFleetAdminSchema,      update: updateFleetAdminSchema      },
  'operations-admins': { create: createOperationsAdminSchema, update: updateOperationsAdminSchema },
  'it-admins':         { create: createITAdminSchema,         update: updateITAdminSchema         },
}

export function validateForm(
  tab: UserTab,
  isEdit: boolean,
  data: Record<string, unknown>,
): Record<string, string> {
  const schema = isEdit ? FORM_SCHEMAS[tab].update : FORM_SCHEMAS[tab].create
  const result = schema.safeParse(data)
  if (result.success) return {}
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = issue.path[issue.path.length - 1] as string
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}