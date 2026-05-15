'use client'

import {
  useState,
  useEffect,
  useMemo,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import type {
  UserTab,
  ClientUser,
  DriverUser,
  VendorUser,
  AnyUser,
} from '@/app/types/admin/user-management.types'
import { USER_SUFFIXES } from '@/lib/validation/user-management.validation'
import {
  clientService,
  driverService,
  vendorService,
  accountantService,
  generalManagerService,
  humanResourcesService,
  fleetAdminService,
  operationsAdminService,
  itAdminService,
} from '@/lib/services/admin/user-management.service'
import { validateForm } from '@/lib/validation/user-management.validation'
import ReusableModal from '@/components/layout/ReusableModal'
import { appToast } from '@/lib/toast'
import { extractApiError } from '@/lib/api-error'
import LandlineInputRow, { toLocalLandlineDigits } from './LandLineInputRow'

interface UserFormModalProps {
  tab: UserTab
  user: AnyUser | null
  onClose: () => void
  onSaved: () => void
}

const TAB_LABELS: Record<UserTab, string> = {
  clients:             'Client',
  drivers:             'Driver',
  vendors:             'Vendor',
  accountants:         'Accountant',
  'general-managers':  'General Manager',
  'human-resources':   'HR Officer',
  'fleet-admins':      'Fleet Manager',
  'operations-admins': 'Operations Manager',
  'it-admins':         'IT Admin',
}

type FormState = Record<string, string | boolean | number>

function toLocalDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('63')) return digits.slice(2)
  if (digits.startsWith('0'))  return digits.slice(1)
  return digits
}

function attachCountryCode(local: string): string {
  return `+63${local.replace(/\D/g, '')}`
}

function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '')
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 10)}`
}

function buildInitialState(tab: UserTab, user: AnyUser | null): FormState {
  const base: FormState = {
    first_name:  user?.first_name  ?? '',
    last_name:   user?.last_name   ?? '',
    middle_name: user?.middle_name ?? '',
    suffix:      user?.suffix      ?? '',
    email:       user?.email       ?? '',
    phone:       user?.phone ? toLocalDigits(user.phone) : '',
  }

  if (tab === 'clients') {
    const c = (user as ClientUser | null)?.clients
    return {
      ...base,
      landline:        c?.landline ? toLocalLandlineDigits(c.landline) : '',
      company_name:    c?.company_name    ?? '',
      billing_address: c?.billing_address ?? '',
      payment_terms:   c?.payment_terms   ?? 30,
    }
  }

  if (tab === 'drivers') {
    const d = (user as DriverUser | null)?.drivers
    return {
      ...base,
      password:         '',
      license_number:   d?.license_number                ?? '',
      license_expiry:   d?.license_expiry?.split('T')[0] ?? '',
      is_vendor_driver: d?.is_vendor_driver              ?? false,
      vendor_id:        d?.vendor_id                     ?? '',
    }
  }

  if (tab === 'vendors') {
    const v = (user as VendorUser | null)?.vendors
    return {
      ...base,
      landline:        v?.landline ? toLocalLandlineDigits(v.landline) : '',
      vendor_type:     v?.vendor_type     ?? 'individual',
      company_name:    v?.company_name    ?? '',
      business_permit: v?.business_permit ?? '',
    }
  }

  return base
}

async function submitForm(tab: UserTab, form: FormState, editId?: string): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  )
  if (clean.phone)    clean.phone    = attachCountryCode(String(clean.phone))
  if (clean.landline) clean.landline = attachCountryCode(String(clean.landline))

  switch (tab) {
    case 'clients':           return editId ? clientService.update(editId, clean as never).then()           : clientService.create(clean as never).then()
    case 'drivers':           return editId ? driverService.update(editId, clean as never).then()           : driverService.create(clean as never).then()
    case 'vendors':           return editId ? vendorService.update(editId, clean as never).then()           : vendorService.create(clean as never).then()
    case 'accountants':       return editId ? accountantService.update(editId, clean as never).then()       : accountantService.create(clean as never).then()
    case 'general-managers':  return editId ? generalManagerService.update(editId, clean as never).then()   : generalManagerService.create(clean as never).then()
    case 'human-resources':   return editId ? humanResourcesService.update(editId, clean as never).then()   : humanResourcesService.create(clean as never).then()
    case 'fleet-admins':      return editId ? fleetAdminService.update(editId, clean as never).then()       : fleetAdminService.create(clean as never).then()
    case 'operations-admins': return editId ? operationsAdminService.update(editId, clean as never).then()  : operationsAdminService.create(clean as never).then()
    case 'it-admins':         return editId ? itAdminService.update(editId, clean as never).then()          : itAdminService.create(clean as never).then()
  }
}

interface FieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}

function Field({ label, required, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#818181]">
        {label}
        {hint && <span className="ml-1 normal-case font-normal text-[#555]">({hint})</span>}
        {required && <span className="ml-0.5 text-[#4df9ed]">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-[11px] text-red-400 leading-tight whitespace-pre-line">{error}</p>
      )}
    </div>
  )
}

const inputBase =
  'w-full rounded-[10px] border border-[#424242] bg-[#2a2a2a99] px-3 py-2 text-[13px] text-white placeholder-[#555] outline-none transition-colors duration-150 focus:border-[#4df9ed] hover:border-[#4df9ed50]'

function Input({
  error,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'required'> & { error?: string }) {
  return (
    <input
      {...props}
      className={`${inputBase} ${error ? 'border-red-500/60' : ''} ${className}`}
    />
  )
}

function Textarea({
  error,
  className = '',
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'required'> & { error?: string }) {
  return (
    <textarea
      {...props}
      rows={props.rows ?? 2}
      className={`${inputBase} resize-none ${error ? 'border-red-500/60' : ''} ${className}`}
    />
  )
}

function Select({
  error,
  className = '',
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'required'> & { error?: string }) {
  return (
    <select
      {...props}
      className={`${inputBase} appearance-none bg-[#2a2a2a] ${error ? 'border-red-500/60' : ''} ${className}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
      }}
    >
      {children}
    </select>
  )
}

function PhoneInputRow({
  value,
  onChange,
  placeholder,
  maxLength,
  error,
}: {
  value: string
  onChange: (digits: string) => void
  placeholder: string
  maxLength: number
  error?: string
}) {
  return (
    <div className="flex">
      <span className="flex items-center rounded-l-[10px] border border-r-0 border-[#424242] bg-[#232323] px-3 text-[13px] font-medium text-[#818181] select-none">
        +63
      </span>
      <Input
        type="tel"
        value={value}
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, maxLength)
          onChange(digits)
        }}
        placeholder={placeholder}
        maxLength={maxLength + Math.floor(maxLength / 3)}
        error={error}
        className="rounded-l-none"
      />
    </div>
  )
}

export default function UserFormModal({ tab, user, onClose, onSaved }: UserFormModalProps) {
  const isEdit = Boolean(user)

  const initialState = useMemo(() => buildInitialState(tab, user), [tab, user])

  const [form, setForm]               = useState<FormState>(initialState)
  const [loading, setLoading]         = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmSave,  setConfirmSave]  = useState(false)

  const [vendorList,     setVendorList]     = useState<{ vendor_id: string; name: string }[]>([])
  const [vendorsLoading, setVendorsLoading] = useState(false)

  // True when at least one field differs from the initial state
  const isDirty = useMemo(() => {
    return Object.keys(initialState).some(
      (key) => form[key] !== initialState[key]
    )
  }, [form, initialState])

  useEffect(() => {
    setForm(initialState)
    setGlobalError(null)
    setFieldErrors({})
  }, [initialState])

  useEffect(() => {
    if (tab !== 'drivers') return
    setVendorsLoading(true)
    vendorService.getAll()
      .then((data) => {
        setVendorList(
          (data as VendorUser[])
            .filter((v) => v.vendors?.vendor_id)
            .map((v) => ({
              vendor_id: v.vendors!.vendor_id,
              name:
                [v.first_name, v.last_name].filter(Boolean).join(' ') +
                (v.vendors?.company_name ? ` (${v.vendors.company_name})` : ''),
            }))
        )
      })
      .catch(() => {})
      .finally(() => setVendorsLoading(false))
  }, [tab])

  function buildValidationPayload(currentForm: FormState): Record<string, unknown> {
    const payload: Record<string, unknown> = { ...currentForm }
    if (payload.phone)    payload.phone    = attachCountryCode(String(payload.phone))
    if (payload.landline) payload.landline = attachCountryCode(String(payload.landline))
    else                  delete payload.landline
    if (tab === 'drivers' && !payload.is_vendor_driver) delete payload.vendor_id
    return payload
  }

  function validateField(key: string, value: unknown, currentForm: FormState) {
    const merged: FormState = { ...currentForm, [key]: value as string | boolean | number }
    const payload = buildValidationPayload(merged)
    const errors  = validateForm(tab, isEdit, payload)
    setFieldErrors(prev => {
      const next = { ...prev }
      if (errors[key]) next[key] = errors[key]
      else delete next[key]
      return next
    })
  }

  function set(key: string, value: string | boolean | number) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'is_vendor_driver' && value === false) next.vendor_id = ''
      validateField(key, value, next)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError(null)
    const payload = buildValidationPayload(form)
    const errors  = validateForm(tab, isEdit, payload)
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return }
    setConfirmSave(true)
  }

  async function handleConfirmedSubmit() {
    setConfirmSave(false)
    setLoading(true)
    setGlobalError(null)
    setFieldErrors({})
    try {
      await submitForm(tab, form, isEdit ? user!.user_id : undefined)
      appToast.success(
        isEdit
          ? `${TAB_LABELS[tab]} updated successfully.`
          : `New ${TAB_LABELS[tab]} account created.`,
        { action: isEdit ? 'edit-user' : 'create-user', entityId: user?.user_id ?? 'new' },
      )
      onSaved()
    } catch (err: unknown) {
      const { message, fieldErrors: fe } = extractApiError(err)
      setFieldErrors(fe)
      if (message) {
        setGlobalError(message)
        appToast.error(message, { action: 'user-form-error' })
      } else if (Object.keys(fe).length > 0) {
        appToast.error('Please fix the highlighted fields.', { action: 'user-form-error' })
      }
    } finally {
      setLoading(false)
    }
  }

  // For edit mode: disable save when nothing has changed or while loading.
  // For create mode: always enabled (form starts empty, any input is progress).
  const isSaveDisabled = loading || (isEdit && !isDirty)

  const fe = fieldErrors

  return (
    <AnimatePresence>
      <div key="modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
          className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] shadow-2xl [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#2a2a2a] bg-[#1b1b1b] px-6 py-4">
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#4df9ed]">
                {isEdit ? 'Edit' : 'Create'} {TAB_LABELS[tab]}
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-white">
                {isEdit ? `Update ${TAB_LABELS[tab]}` : `New ${TAB_LABELS[tab]} Account`}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              className="rounded-lg p-2 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 px-6 py-6">

            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" required error={fe.first_name}>
                <Input
                  value={form.first_name as string}
                  onChange={e => set('first_name', e.target.value)}
                  placeholder="Juan"
                  error={fe.first_name}
                />
              </Field>
              <Field label="Last Name" required error={fe.last_name}>
                <Input
                  value={form.last_name as string}
                  onChange={e => set('last_name', e.target.value)}
                  placeholder="Dela Cruz"
                  error={fe.last_name}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Middle Name" hint="Optional" error={fe.middle_name}>
                <Input
                  value={form.middle_name as string}
                  onChange={e => set('middle_name', e.target.value)}
                  placeholder="Reyes"
                  error={fe.middle_name}
                />
              </Field>
              <Field label="Suffix" error={fe.suffix}>
                <Select value={form.suffix as string} onChange={e => set('suffix', e.target.value)} error={fe.suffix}>
                  <option value=""> N/A </option>
                  {USER_SUFFIXES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <Field label="Email" required error={fe.email}>
                <Input
                  type="email"
                  value={form.email as string}
                  onChange={e => set('email', e.target.value)}
                  placeholder="juan@8338logistics.com"
                  error={fe.email}
                />
              </Field>
            </div>

            <Field label="Mobile" required error={fe.phone}>
              <PhoneInputRow
                value={formatPhone(form.phone as string)}
                onChange={digits => {
                  if (digits.length > 0 && (digits.startsWith('0') || digits.startsWith('1'))) return
                  set('phone', digits)
                }}
                placeholder="929-2143-537"
                maxLength={10}
                error={fe.phone}
              />
            </Field>

            {tab === 'drivers' && !isEdit && (
              <Field label="Password" required error={fe.password}>
                <Input
                  type="password"
                  value={form.password as string}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Min. 8 characters"
                  error={fe.password}
                />
              </Field>
            )}

            {tab === 'clients' && (<>
              <Field label="Landline" hint="Optional" error={fe.landline}>
                <LandlineInputRow
                  value={form.landline as string}
                  onChange={digits => set('landline', digits)}
                  error={fe.landline}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Company Name" required error={fe.company_name}>
                  <Input
                    value={form.company_name as string}
                    onChange={e => set('company_name', e.target.value)}
                    placeholder="Acme Corp"
                    error={fe.company_name}
                  />
                </Field>
                <Field label="Payment Terms (Days)" hint="Net days" error={fe.payment_terms}>
                  <Select
                    value={String(form.payment_terms)}
                    onChange={e => set('payment_terms', Number(e.target.value))}
                    error={fe.payment_terms}
                  >
                    <option value="30">30 days</option>
                    <option value="45">45 days</option>
                    <option value="60">60 days</option>
                  </Select>
                </Field>
              </div>

              <Field label="Billing Address" required error={fe.billing_address}>
                <Textarea
                  value={form.billing_address as string}
                  onChange={e => set('billing_address', e.target.value)}
                  placeholder="123 Main St, Makati City, Metro Manila"
                  rows={2}
                  error={fe.billing_address}
                />
              </Field>
            </>)}

            {tab === 'drivers' && (<>
              <div className="grid grid-cols-2 gap-4">
                <Field label="License Number" required error={fe.license_number}>
                  <Input
                    value={form.license_number as string}
                    onChange={e => set('license_number', e.target.value)}
                    placeholder="N01-23-456789"
                    error={fe.license_number}
                  />
                </Field>
                <Field label="License Expiry" required error={fe.license_expiry}>
                  <Input
                    type="date"
                    value={form.license_expiry as string}
                    onChange={e => set('license_expiry', e.target.value)}
                    error={fe.license_expiry}
                    className="[color-scheme:dark]"
                  />
                </Field>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#2a2a2a] bg-[#2a2a2a]/40 px-4 py-3">
                <div className="relative mt-0.5 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={form.is_vendor_driver as boolean}
                    onChange={e => set('is_vendor_driver', e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-4 w-4 rounded border border-[#424242] bg-[#1b1b1b] transition-colors peer-checked:border-[#4df9ed] peer-checked:bg-[#4df9ed]" />
                  <svg
                    className="pointer-events-none absolute inset-0 m-auto hidden h-2.5 w-2.5 text-[#0a0a0a] peer-checked:block"
                    viewBox="0 0 10 10" fill="none"
                  >
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm text-[#818181]">
                  This driver belongs to a vendor / subcontractor
                </span>
              </label>

              {form.is_vendor_driver && (
                <Field label="Vendor" required error={fe.vendor_id}>
                  <Select
                    value={form.vendor_id as string}
                    onChange={e => set('vendor_id', e.target.value)}
                    error={fe.vendor_id}
                    disabled={vendorsLoading}
                  >
                    <option value="">{vendorsLoading ? 'Loading vendors…' : 'Select a vendor'}</option>
                    {vendorList.map((v) => (
                      <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
            </>)}

            {tab === 'vendors' && (<>
              <Field label="Landline" hint="Optional — area code + subscriber, e.g. 32-XXXXXXX" error={fe.landline}>
                <LandlineInputRow
                  value={form.landline as string}
                  onChange={digits => set('landline', digits)}
                  error={fe.landline}
                />
              </Field>

              <Field label="Vendor Type" required error={fe.vendor_type}>
                <Select
                  value={form.vendor_type as string}
                  onChange={e => set('vendor_type', e.target.value)}
                  error={fe.vendor_type}
                >
                  <option value="individual">Individual</option>
                  <option value="company">Company</option>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Company Name" error={fe.company_name}>
                  <Input
                    value={form.company_name as string}
                    onChange={e => set('company_name', e.target.value)}
                    placeholder="Vendor Co."
                    error={fe.company_name}
                  />
                </Field>
                <Field label="Business Permit #" error={fe.business_permit}>
                  <Input
                    value={form.business_permit as string}
                    onChange={e => set('business_permit', e.target.value)}
                    placeholder="BP-2024-XXXXX"
                    error={fe.business_permit}
                  />
                </Field>
              </div>
            </>)}

            {globalError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3"
              >
                <p className="text-sm text-red-400 whitespace-pre-line">{globalError}</p>
              </motion.div>
            )}

            <div className="flex justify-end gap-3 border-t border-[#2a2a2a] pt-5 mt-1">
              <button
                type="button"
                onClick={() => setConfirmClose(true)}
                className="rounded-lg border border-[#424242] px-5 py-2.5 text-sm font-medium text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaveDisabled}
                title={isEdit && !isDirty ? 'No changes to save' : undefined}
                className="flex items-center gap-2 rounded-lg bg-[#4df9ed] px-5 py-2.5 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? 'Saving…' : isEdit ? 'Save Changes' : `Create ${TAB_LABELS[tab]}`}
              </button>
            </div>
          </form>
        </motion.div>
      </div>

      <ReusableModal
        key="confirm-close"
        open={confirmClose}
        title="Discard changes?"
        description="Any unsaved changes will be lost. Are you sure you want to close this form?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={onClose}
        onCancel={() => setConfirmClose(false)}
      />

      <ReusableModal
        key="confirm-save"
        open={confirmSave}
        title={isEdit ? `Save changes to this ${TAB_LABELS[tab]}?` : `Create new ${TAB_LABELS[tab]}?`}
        description={
          isEdit
            ? 'This will update the account with the new information.'
            : 'A new account will be created with the provided details.'
        }
        confirmLabel={isEdit ? 'Save' : 'Create'}
        cancelLabel="Cancel"
        onConfirm={handleConfirmedSubmit}
        onCancel={() => setConfirmSave(false)}
      />
    </AnimatePresence>
  )
}