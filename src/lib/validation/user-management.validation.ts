import { z } from 'zod'
import {
  emailField,
  fieldErrors,
  firstNameField,
  lastNameField,
  middleNameField,
  mobileField,
  optionalLandlineField,
  suffixField,
} from './fields'

export const USER_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const

// Name, email and phone rules come from ./fields, the one copy every form in
// the app shares.
const firstName        = firstNameField
const lastName         = lastNameField
const middleName       = middleNameField
const suffix           = suffixField
const email            = emailField
const phone            = mobileField
const phoneOptional    = mobileField.optional()
const landlineOptional = optionalLandlineField

const suffixWithOthersCheck = suffix.refine(
  v => v == null || v !== 'others',
  'Please type a suffix when Others is selected',
)

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
})

export const updateClientSchema = z.object({
  ...baseUpdateFields,
  landline:        landlineOptional,
  company_name:    z.string().max(100, 'Company name is too long').optional(),
  billing_address: z.string().optional(),
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
  return result.success ? {} : fieldErrors(result.error)
}