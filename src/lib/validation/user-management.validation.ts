import { z } from 'zod'

export const USER_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const

const PH_PHONE_REGEX    = /^\+63(9[0-9]{9}|[2-8][0-9]{8})$/
const PH_LANDLINE_REGEX = /^\+63[0-9]{9}$/

const firstName = z
  .string({ error: 'First name is required' })
  .min(2, 'First name must be at least 2 characters')
  .max(50, 'First name is too long')
  .regex(
    /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u,
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

const middleInitial = z
  .string()
  .max(1, 'Middle initial must be a single character')
  .optional()
  .nullable()
  .transform(v => (v === '' ? null : v))

const suffix = z.preprocess(
  v => (v === '' ? null : v),
  z.enum(USER_SUFFIXES, { message: 'Invalid suffix' }).optional().nullable(),
)

const username = z
  .string({ error: 'Username is required' })
  .min(2, 'Username must be at least 2 characters')
  .max(50, 'Username is too long')

const email = z
  .string({ error: 'Email is required' })
  .email('Please enter a valid email address')

const phone = z
  .string({ error: 'Phone is required' })
  .regex(
    PH_PHONE_REGEX,
    'Enter a valid PH mobile number (9XXXXXXXXX)',
  )

const phoneOptional = z
  .string()
  .regex(PH_PHONE_REGEX, 'Enter a valid PH mobile number (9XXXXXXXXX)')
  .optional()
  .transform(v => (v === '' ? null : v))

const landlineOptional = z
  .string()
  .regex(PH_LANDLINE_REGEX, 'Enter a valid PH landline')
  .optional()
  .nullable()
  .transform(v => (v === '' ? null : v))

const baseCreateFields = {
  first_name:     firstName,
  last_name:      lastName,
  middle_initial: middleInitial,
  suffix,
  username,
  email,
  phone,
}

const baseUpdateFields = {
  first_name:     firstName.optional(),
  last_name:      lastName.optional(),
  middle_initial: middleInitial,
  suffix:         z.string().max(10).optional().nullable().transform(v => (v === '' ? null : v)),
  username:       username.optional(),
  email:          email.optional(),
  phone:          phoneOptional,
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
    password: z
      .string({ error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters'),
    license_number: z
      .string({ error: 'License number is required' })
      .regex(/^[A-Z]\d{2}-\d{2}-\d{6}$/, 'Use LTO format: A01-23-456789'),
    license_expiry: z
      .string({ error: 'License expiry is required' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .refine(val => !isNaN(new Date(val).getTime()), 'Invalid date')
      .refine(val => new Date(val) > new Date(), 'License is already expired'),
    is_vendor_driver: z.boolean().optional().default(false),
    vendor_id:        z.string().uuid('Invalid vendor selection').optional().nullable(),
  })
  .refine(
    data => !data.is_vendor_driver || !!data.vendor_id,
    { path: ['vendor_id'], message: 'Please select a vendor for this driver' },
  )

export const updateDriverSchema = z
  .object({
    ...baseUpdateFields,
    license_number: z
      .string()
      .regex(/^[A-Z]\d{2}-\d{2}-\d{6}$/, 'Use LTO format: A01-23-456789')
      .optional(),
    license_expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .refine(val => !val || !isNaN(new Date(val).getTime()), 'Invalid date')
      .refine(val => !val || new Date(val) > new Date(), 'License is already expired')
      .optional(),
    is_vendor_driver: z.boolean().optional(),
    vendor_id:        z.string().uuid('Invalid vendor selection').optional().nullable(),
  })
  .refine(
    data => !data.is_vendor_driver || !!data.vendor_id,
    { path: ['vendor_id'], message: 'Please select a vendor for this driver' },
  )

export const createVendorSchema = z.object({
  ...baseCreateFields,
  landline:        landlineOptional,
  vendor_type:     z.enum(['individual', 'company'], { error: 'Vendor type is required' }),
  company_name:    z.string().max(100).optional().nullable().transform(v => (v === '' ? null : v)),
  business_permit: z.string().max(100).optional().nullable().transform(v => (v === '' ? null : v)),
})

export const updateVendorSchema = z.object({
  ...baseUpdateFields,
  landline:        landlineOptional,
  vendor_type:     z.enum(['individual', 'company']).optional(),
  company_name:    z.string().max(100).optional().nullable().transform(v => (v === '' ? null : v)),
  business_permit: z.string().max(100).optional().nullable().transform(v => (v === '' ? null : v)),
})

export const createAccountantSchema        = z.object(baseCreateFields)
export const updateAccountantSchema        = z.object(baseUpdateFields)
export const createGeneralManagerSchema    = z.object(baseCreateFields)
export const updateGeneralManagerSchema    = z.object(baseUpdateFields)
export const createHumanResourcesSchema    = z.object(baseCreateFields)
export const updateHumanResourcesSchema    = z.object(baseUpdateFields)
export const createFleetAdminSchema        = z.object(baseCreateFields)
export const updateFleetAdminSchema        = z.object(baseUpdateFields)
export const createOperationsAdminSchema   = z.object(baseCreateFields)
export const updateOperationsAdminSchema   = z.object(baseUpdateFields)
export const createITAdminSchema           = z.object(baseCreateFields)
export const updateITAdminSchema           = z.object(baseUpdateFields)

import type { UserTab } from '@/app/types/admin/user-management.types'

type SchemaPair = { create: z.ZodTypeAny; update: z.ZodTypeAny }

export const FORM_SCHEMAS: Record<UserTab, SchemaPair> = {
  clients:             { create: createClientSchema,          update: updateClientSchema          },
  drivers:             { create: createDriverSchema,          update: updateDriverSchema          },
  vendors:             { create: createVendorSchema,          update: updateVendorSchema          },
  accountants:         { create: createAccountantSchema,      update: updateAccountantSchema      },
  'general-managers':  { create: createGeneralManagerSchema,  update: updateGeneralManagerSchema  },
  'human-resources':   { create: createHumanResourcesSchema,  update: updateHumanResourcesSchema  },
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