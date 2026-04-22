'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import FormHelperText from '@mui/material/FormHelperText'
import type {
  UserTab,
  ClientUser,
  DriverUser,
  VendorUser,
  AnyUser,
} from '@/app/types/admin/user-management.types'
import {
  clientService,
  driverService,
  vendorService,
  accountantService,
  generalManagerService,
  humanResourcesService,
  fleetAdminService,
  operationsAdminService,
} from '@/app/lib/services/admin/user-management.service'

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
  'fleet-admins':      'Fleet Admin',
  'operations-admins': 'Operations Admin',
}

type FormState = Record<string, string | boolean | number>

interface ValidationError {
  field: string
  message: string
}

type ApiResponseBody = {
  errors?: ValidationError[]
  message?: string
}

type ApiErrorShape = {
  response?: { data?: ApiResponseBody }
  data?: ApiResponseBody
}

function isApiResponseBody(val: unknown): val is ApiResponseBody {
  return typeof val === 'object' && val !== null
}

function buildInitialState(tab: UserTab, user: AnyUser | null): FormState {
  const base: FormState = {
    username:       user?.username       ?? '',
    email:          user?.email          ?? '',
    phone:          user?.phone          ?? '',
    first_name:     user?.first_name     ?? '',
    last_name:      user?.last_name      ?? '',
    middle_initial: user?.middle_initial ?? '',
    suffix:         user?.suffix         ?? '',
  }

  if (tab === 'clients') {
    const c = (user as ClientUser | null)?.clients
    return {
      ...base,
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
      license_number:   d?.license_number               ?? '',
      license_expiry:   d?.license_expiry?.split('T')[0] ?? '',
      is_vendor_driver: d?.is_vendor_driver              ?? false,
      vendor_id:        d?.vendor_id                    ?? '',
    }
  }
  if (tab === 'vendors') {
    const v = (user as VendorUser | null)?.vendors
    return {
      ...base,
      subcontractor_type: v?.subcontractor_type ?? 'individual',
      company_name:       v?.company_name       ?? '',
      business_permit:    v?.business_permit    ?? '',
    }
  }
  return base
}

async function submitForm(tab: UserTab, form: FormState, editId?: string): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(form).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
  switch (tab) {
    case 'clients':
      return editId
        ? clientService.update(editId, clean).then()
        : clientService.create(clean as unknown as Parameters<typeof clientService.create>[0]).then()
    case 'drivers':
      return editId
        ? driverService.update(editId, clean).then()
        : driverService.create(clean as unknown as Parameters<typeof driverService.create>[0]).then()
    case 'vendors':
      return editId
        ? vendorService.update(editId, clean).then()
        : vendorService.create(clean as unknown as Parameters<typeof vendorService.create>[0]).then()
    case 'accountants':
      return editId
        ? accountantService.update(editId, clean).then()
        : accountantService.create(clean as unknown as Parameters<typeof accountantService.create>[0]).then()
    case 'general-managers':
      return editId
        ? generalManagerService.update(editId, clean).then()
        : generalManagerService.create(clean as unknown as Parameters<typeof generalManagerService.create>[0]).then()
    case 'human-resources':
      return editId
        ? humanResourcesService.update(editId, clean).then()
        : humanResourcesService.create(clean as unknown as Parameters<typeof humanResourcesService.create>[0]).then()
    case 'fleet-admins':
      return editId
        ? fleetAdminService.update(editId, clean).then()
        : fleetAdminService.create(clean as unknown as Parameters<typeof fleetAdminService.create>[0]).then()
    case 'operations-admins':
      return editId
        ? operationsAdminService.update(editId, clean).then()
        : operationsAdminService.create(clean as unknown as Parameters<typeof operationsAdminService.create>[0]).then()
  }
}

const muiTextFieldSx = {
  '& .MuiInputBase-root': {
    bgcolor: '#2a2a2a99',
    borderRadius: '10px',
    color: '#fff',
  },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#424242' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4df9ed50' },
  '& .MuiInputLabel-root': {
    color: '#818181',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  '& .MuiInputLabel-root.Mui-focused': { color: '#4df9ed' },
  '& .MuiFormHelperText-root': { marginLeft: 0 },
} as const

interface BaseFieldsProps {
  form: FormState
  set: (k: string, v: string | boolean | number) => void
  fe: Record<string, string>
  isEdit: boolean
}

function BaseFields({ form, set, fe }: BaseFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="First Name"
          value={form.first_name as string}
          onChange={(e) => set('first_name', e.target.value)}
          placeholder="Juan"
          error={!!fe.first_name}
          helperText={fe.first_name}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
        <TextField
          label="Last Name"
          value={form.last_name as string}
          onChange={(e) => set('last_name', e.target.value)}
          placeholder="Dela Cruz"
          error={!!fe.last_name}
          helperText={fe.last_name}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
        <TextField
          label="Middle Initial"
          value={form.middle_initial as string}
          onChange={(e) => set('middle_initial', e.target.value)}
          placeholder="R."
          inputProps={{ maxLength: 5 }}
          error={!!fe.middle_initial}
          helperText={fe.middle_initial}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
        <TextField
          label="Suffix"
          value={form.suffix as string}
          onChange={(e) => set('suffix', e.target.value)}
          placeholder="Jr., III…"
          error={!!fe.suffix}
          helperText={fe.suffix}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Username"
          value={form.username as string}
          onChange={(e) => set('username', e.target.value)}
          placeholder="jdelacruz"
          required
          error={!!fe.username}
          helperText={fe.username}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
        <TextField
          label="Email"
          type="email"
          value={form.email as string}
          onChange={(e) => set('email', e.target.value)}
          placeholder="juan@8338logistics.com"
          required
          error={!!fe.email}
          helperText={fe.email}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
      </div>

      <TextField
        label="Phone"
        type="tel"
        value={form.phone as string}
        onChange={(e) => set('phone', e.target.value)}
        placeholder="+63 912 345 6789"
        error={!!fe.phone}
        helperText={fe.phone}
        fullWidth
        size="small"
        sx={muiTextFieldSx}
      />
    </>
  )
}

function ClientExtraFields({ form, set, fe }: Omit<BaseFieldsProps, 'isEdit'>) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Company Name"
          value={form.company_name as string}
          onChange={(e) => set('company_name', e.target.value)}
          placeholder="Acme Corp"
          error={!!fe.company_name}
          helperText={fe.company_name}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
        <TextField
          label="Payment Terms (days)"
          type="number"
          value={String(form.payment_terms as number)}
          onChange={(e) => set('payment_terms', Number(e.target.value))}
          inputProps={{ min: 0 }}
          placeholder="30"
          error={!!fe.payment_terms}
          helperText={fe.payment_terms}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
      </div>
      <TextField
        label="Billing Address"
        value={form.billing_address as string}
        onChange={(e) => set('billing_address', e.target.value)}
        placeholder="123 Main St, Makati City, Metro Manila"
        error={!!fe.billing_address}
        helperText={fe.billing_address}
        fullWidth
        size="small"
        multiline
        minRows={2}
        sx={muiTextFieldSx}
      />
    </>
  )
}

function DriverExtraFields({ form, set, fe, isEdit }: BaseFieldsProps) {
  return (
    <>
      {!isEdit && (
        <TextField
          label="Password"
          type="password"
          value={(form.password as string) ?? ''}
          onChange={(e) => set('password', e.target.value)}
          placeholder="Min. 8 characters"
          required
          error={!!fe.password}
          helperText={fe.password}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="License Number"
          value={form.license_number as string}
          onChange={(e) => set('license_number', e.target.value)}
          placeholder="N01-23-456789"
          required
          error={!!fe.license_number}
          helperText={fe.license_number}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
        <TextField
          label="License Expiry"
          type="date"
          value={form.license_expiry as string}
          onChange={(e) => set('license_expiry', e.target.value)}
          required
          error={!!fe.license_expiry}
          helperText={fe.license_expiry}
          fullWidth
          size="small"
          sx={{
            ...muiTextFieldSx,
            '& input': { colorScheme: 'dark' },
          }}
          InputLabelProps={{ shrink: true }}
        />
      </div>
      <div className="rounded-lg border border-[#2a2a2a] bg-[#2a2a2a]/40 px-4 py-2.5">
        <FormControlLabel
          control={
            <Checkbox
              checked={form.is_vendor_driver as boolean}
              onChange={(e) => set('is_vendor_driver', e.target.checked)}
              sx={{
                color: '#818181',
                '&.Mui-checked': { color: '#4df9ed' },
              }}
            />
          }
          label={<span className="text-sm text-[#818181]">This driver belongs to a vendor / subcontractor</span>}
        />
        {fe.vendor_id && (
          <FormHelperText sx={{ color: 'rgb(248 113 113)', marginLeft: 0, marginTop: '-6px' }}>
            {fe.vendor_id}
          </FormHelperText>
        )}
      </div>
    </>
  )
}

function VendorExtraFields({ form, set, fe }: Omit<BaseFieldsProps, 'isEdit'>) {
  return (
    <>
      <TextField
        select
        label="Subcontractor Type"
        value={form.subcontractor_type as string}
        onChange={(e) => set('subcontractor_type', e.target.value)}
        required
        error={!!fe.subcontractor_type}
        helperText={fe.subcontractor_type}
        fullWidth
        size="small"
        sx={muiTextFieldSx}
      >
        <MenuItem value="individual">Individual</MenuItem>
        <MenuItem value="company">Company</MenuItem>
      </TextField>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Company Name"
          value={form.company_name as string}
          onChange={(e) => set('company_name', e.target.value)}
          placeholder="Vendor Co."
          error={!!fe.company_name}
          helperText={fe.company_name}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
        <TextField
          label="Business Permit #"
          value={form.business_permit as string}
          onChange={(e) => set('business_permit', e.target.value)}
          placeholder="BP-2024-XXXXX"
          error={!!fe.business_permit}
          helperText={fe.business_permit}
          fullWidth
          size="small"
          sx={muiTextFieldSx}
        />
      </div>
    </>
  )
}

function RoleInfoBadge({ tab }: { tab: UserTab }) {
  const roleMap: Partial<Record<UserTab, { label: string; color: string }>> = {
    'human-resources':   { label: 'human_resources',  color: 'bg-pink-500/15 text-pink-400 border-pink-500/30' },
    'fleet-admins':      { label: 'fleet_admin',       color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
    'operations-admins': { label: 'operations_admin',  color: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
    'accountants':       { label: 'accountant',        color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    'general-managers':  { label: 'general_manager',   color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  }
  const cfg = roleMap[tab]
  if (!cfg) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#2a2a2a]/40 px-4 py-3">
      <span className="text-xs text-[#818181]">This account will be assigned the role:</span>
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.color}`}>
        {cfg.label.replace(/_/g, ' ')}
      </span>
    </div>
  )
}

function extractApiError(err: unknown): {
  message: string
  fieldErrors: Record<string, string>
} {
  // Axios error shape
  const body =
    (err as ApiErrorShape)?.response?.data ??
    (err as ApiErrorShape)?.data ??
    err

  if (isApiResponseBody(body)) {
    const { errors, message } = body

    if (Array.isArray(errors) && errors.length > 0) {
      const mapped: Record<string, string> = {}
      for (const ve of errors) {
        // Zod uses dot-notation for nested paths e.g. "drivers.license_number"
        // take the last segment so it matches your form field keys
        const key = ve.field.includes('.')
          ? ve.field.split('.').pop()!
          : ve.field
        mapped[key] = mapped[key] ? `${mapped[key]}\n${ve.message}` : ve.message
      }

      const backendMsg =
        typeof message === 'string' && message.trim().length > 0
          ? message.trim()
          : 'Validation failed'

      const combined = errors
        .map((e) => e?.message)
        .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)

      const combinedMsg =
        combined.length > 0
          ? `${backendMsg}:\n${combined.map((m) => `- ${m}`).join('\n')}`
          : backendMsg

      return { message: combinedMsg, fieldErrors: mapped }
    }

    if (typeof message === 'string' && message) {
      return { message, fieldErrors: {} }
    }
  }

  const fallback = err instanceof Error ? err.message : 'Something went wrong.'
  return { message: fallback, fieldErrors: {} }
}


export default function UserFormModal({ tab, user, onClose, onSaved }: UserFormModalProps) {
  const isEdit = Boolean(user)
  const [form, setForm] = useState<FormState>(() => buildInitialState(tab, user))
  const [loading, setLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setForm(buildInitialState(tab, user))
    setGlobalError(null)
    setFieldErrors({})
  }, [tab, user])

  function set(key: string, value: string | boolean | number) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setGlobalError(null)
    setFieldErrors({})
    try {
      await submitForm(tab, form, isEdit ? user!.user_id : undefined)
      onSaved()
    } catch (err: unknown) {
      const { message, fieldErrors: fe } = extractApiError(err)
      setFieldErrors(fe)
      setGlobalError(message)
    } finally {
      setLoading(false)
    }
  }

  const fe = fieldErrors

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
          className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] shadow-2xl"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#2a2a2a] bg-[#1b1b1b] px-6 py-4">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-[#4df9ed]">
                {isEdit ? 'Edit' : 'Create'} {TAB_LABELS[tab]}
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-white">
                {isEdit ? `Update ${user?.username}` : `New ${TAB_LABELS[tab]} Account`}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">

            <BaseFields form={form} set={set} fe={fe} isEdit={isEdit} />

            {tab === 'clients' && (
              <ClientExtraFields form={form} set={set} fe={fe} />
            )}
            {tab === 'drivers' && (
              <DriverExtraFields form={form} set={set} fe={fe} isEdit={isEdit} />
            )}
            {tab === 'vendors' && (
              <VendorExtraFields form={form} set={set} fe={fe} />
            )}

            {(
              tab === 'accountants' ||
              tab === 'general-managers' ||
              tab === 'human-resources' ||
              tab === 'fleet-admins' ||
              tab === 'operations-admins'
            ) && <RoleInfoBadge tab={tab} />}

            {globalError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 whitespace-pre-line"
              >
                {globalError}
              </motion.p>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-[#2a2a2a]">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#424242] px-5 py-2.5 text-sm font-medium text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-[#4df9ed] px-5 py-2.5 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5] disabled:opacity-60"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? 'Saving…' : isEdit ? 'Save Changes' : `Create ${TAB_LABELS[tab]}`}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}