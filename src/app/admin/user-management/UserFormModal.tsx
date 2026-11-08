'use client'

import {
  useState,
  useEffect,
  useMemo,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Pencil, Eye, Upload, Undo2 } from 'lucide-react'
import LicenseHistory from './LicenseHistory'
import type {
  UserTab,
  ClientUser,
  DriverUser,
  AnyUser,
} from '@/app/types/admin/user-management.types'
import { USER_SUFFIXES } from '@/lib/validation/user-management.validation'
import {
  adminService,
  clientService,
  driverService,
  generalManagerService,
  fleetAdminService,
  operationsAdminService,
  itAdminService,
  ocrService,
  type VehicleEligibility,
  type LicenseOCRResult,
} from '@/lib/services/admin/user-management.service'
import { validateForm } from '@/lib/validation/user-management.validation'
import ReusableModal from '@/components/layout/ReusableModal'
import { appToast } from '@/lib/toast'
import { extractApiError } from '@/lib/api-error'
import LandlineInputRow, { toLocalLandlineDigits } from './LandLineInputRow'
import PhoneInputRow, { attachCountryCode, toLocalDigits } from '@/components/ui/PhoneInputRow'
import { normalizePhMobile, PH_MOBILE_REGEX, blockPaste, confirmEmailError } from '@/lib/validation/fields'
import BillingAddressField from './BillingAddressField'
import { ScanLine, CheckCircle } from 'lucide-react'
import proxyApi from '@/lib/api/auth.api'
import { EMPTY_FLAGS, MODULES_BY_ROLE, levelToFlags, type ManagedRole, type ModuleFlags } from '@/constants/modules'
import { permissionsService } from '@/lib/services/admin/permissions.service'
import ModulePermissionMatrix, { lockedLevelFor } from '@/app/it_admin/administrator-management/ModulePermissionMatrix'
import { useRecordLock } from '@/lib/hooks/useRecordLock'
import { useSignedLinkRefresh } from '@/lib/hooks/useSignedLinkRefresh'
import RecordLockBanner, { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import { writeAccess } from '@/components/layout/ModuleAccess'
import { ProtectedImg } from '@/components/ui/FileViewer'

interface UserFormModalProps {
  tab: UserTab
  user: AnyUser | null
  onClose: () => void
  onSaved: () => void
  // When set, a module-access matrix is shown on creation so the IT Admin can
  // assign permissions up front (admin management).
  enablePermissions?: boolean
  // Open an existing account read-only; "Edit Details" unlocks the same form.
  startInView?: boolean
  // Hide "Edit Details" where this view can't edit (e.g. the combined lists).
  canEdit?: boolean
  // Show "Edit Details" but disabled: a Read Only tier sees it, can't use it.
  editDisabled?: boolean
  // Someone else is editing this account (from the list's lock state).
  lockedBy?: string
  // Drivers only, on create: which kind of driver the form starts on. Opened
  // from the Vendor Drivers tab it starts on Vendor; the admin can still switch.
  driverSource?: DriverSource
}

export type DriverSource = 'company' | 'vendor'

const TAB_LABELS: Record<UserTab, string> = {
  admins:              'Administrator',
  clients:             'Client',
  drivers:             'Driver',
  'general-managers':  'General Manager',
  'fleet-admins':      'Fleet Manager',
  'operations-admins': 'Operations Manager',
  'it-admins':         'IT Administrator',
}

// Maps an admin-management tab to its role so the create-time matrix only lists
// the modules that role actually has pages for.
const TAB_TO_ROLE: Partial<Record<UserTab, ManagedRole>> = {
  admins:              'admin',
  'general-managers':  'general_manager',
  'fleet-admins':      'fleet_manager',
  'operations-admins': 'operations_manager',
}

type FormState = Record<string, string | boolean | number | null>

/** The license-derived fields (the ones a scan fills). */
const LICENSE_FIELDS = ['first_name', 'last_name', 'middle_name', 'license_number', 'license_expiry'] as const

/**
 * Editing an existing driver: the license-derived fields that hold a value open
 * locked, each with its own Edit button, the same as after a scan.
 */
function savedLicenseLocks(tab: UserTab, state: FormState, isEdit: boolean): Set<string> {
  if (!isEdit || tab !== 'drivers') return new Set()
  return new Set(LICENSE_FIELDS.filter(k => String(state[k] ?? '').trim() !== ''))
}

/** The value each locked field had when it was locked: what Undo goes back to. */
function lockValuesOf(keys: Iterable<string>, state: FormState): Record<string, string> {
  return Object.fromEntries([...keys].map(k => [k, String(state[k] ?? '')]))
}

/** Same license number, ignoring dashes and spaces. */
const sameLicenseNumber = (a: unknown, b: unknown) =>
  String(a ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') === String(b ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Names compared without accents (a worn Ñ scans as N) or case. */
const nameKey = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim()

interface ScanEligibilityState {
  dl_codes:            string[]
  restriction_codes:   string[]
  vehicle_eligibility: VehicleEligibility
}

// An older vendor contact may be free text (a person's name). Only a real PH
// mobile is loaded into the number box; anything else starts blank and is left
// alone on save unless someone types a number.
function vendorContactDigits(raw: string | null | undefined): string {
  if (!raw) return ''
  const mobile = normalizePhMobile(raw)
  return PH_MOBILE_REGEX.test(mobile) ? toLocalDigits(mobile) : ''
}

// Name fields auto-capitalize the first letter of each word as the user types / from OCR autofill.
const NAME_FIELDS = new Set(['first_name', 'last_name', 'middle_name'])

function toNameCase(value: string): string {
  return value.replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
}

function buildInitialState(tab: UserTab, user: AnyUser | null, driverSource: DriverSource = 'company'): FormState {
  const base: FormState = {
    first_name:  user?.first_name  ?? '',
    last_name:   user?.last_name   ?? '',
    middle_name: user?.middle_name ?? '',
    suffix:      user?.suffix      ?? null,
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
      contract_valid_until: c?.contract_valid_until?.split('T')[0] ?? '',
    }
  }

  if (tab === 'drivers') {
    const d = (user as DriverUser | null)?.drivers
    return {
      ...base,
      license_number:   d?.license_number                ?? '',
      license_expiry:   d?.license_expiry?.split('T')[0] ?? '',
      // Fixed once the driver exists: a driver never moves between 8338 and a vendor.
      is_external:      user ? d?.is_external === true : driverSource === 'vendor',
      vendor_name:      d?.vendor_name    ?? '',
      vendor_contact:   vendorContactDigits(d?.vendor_contact),
    }
  }

  return base
}

/** Optional fields an edit can empty: sent as null so the server clears them. */
const CLEARABLE_FIELDS = ['middle_name', 'suffix', 'landline'] as const

// Returns the affected user's id (the new account's id on create, editId on edit).
async function submitForm(
  tab: UserTab,
  form: FormState,
  licenseFile: File | null,
  editId?: string,
  initial?: FormState,
  // A license change on an existing driver: the LTMS confirmation and the note.
  licenseExtra?: Record<string, string>,
): Promise<string | undefined> {
  const clean = Object.fromEntries(
    Object.entries(form).filter(([key, value]) =>
      value !== undefined && (value !== null ? (value !== '' ? true : key === 'suffix') : key === 'suffix'),
    ),
  )
  // On an edit, an optional field that had a value and was emptied is sent as
  // null so the server clears it (a cleared middle name used to be dropped above
  // and never saved). Only the fields whose schemas take null for "none".
  if (editId && initial) {
    for (const key of CLEARABLE_FIELDS) {
      const before = initial[key], now = form[key]
      const hadValue = typeof before === 'string' && before !== ''
      const isEmpty  = now === null || now === undefined || now === ''
      if (hadValue && isEmpty) clean[key] = null
    }
  }
  if (clean.phone)    clean.phone    = attachCountryCode(String(clean.phone))
  if (clean.landline) clean.landline = attachCountryCode(String(clean.landline))
  if (clean.vendor_contact) clean.vendor_contact = attachCountryCode(String(clean.vendor_contact))

  if (tab === 'drivers') {
    if (form.is_external === true) {
      if (editId) {
        // Only sent when changed, so an older free-text contact the box could not
        // show is not wiped; sent blank when cleared, so clearing really clears it.
        if (form.vendor_contact === initial?.vendor_contact) delete clean.vendor_contact
        else if (!clean.vendor_contact) clean.vendor_contact = ''
      }
    } else {
      delete clean.vendor_name
      delete clean.vendor_contact
    }
    // Chosen on create only; the server refuses to move a driver between kinds.
    if (editId) delete clean.is_external
    if (licenseExtra) Object.assign(clean, licenseExtra)
  }

  if (tab === 'drivers' && (!editId || licenseFile)) {
    const fd = new FormData()
    // FormData stringifies null to "null"; send '' so a cleared suffix stays empty.
    Object.entries(clean).forEach(([k, v]) => fd.append(k, v === null ? '' : String(v)))
    if (licenseFile) fd.append('image', licenseFile)
    const url    = editId ? `/admin/drivers/${editId}` : '/admin/drivers'
    const method = editId ? 'patch' : 'post'
    const res = await proxyApi[method](url, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return editId ?? (res.data?.data?.user_id as string | undefined)
  }

  const newId = (u: unknown): string | undefined => (u as { user_id?: string })?.user_id

  switch (tab) {
    case 'admins':            return editId ? adminService.update(editId, clean as never).then(() => editId)            : adminService.create(clean as never).then(newId)
    case 'clients':           return editId ? clientService.update(editId, clean as never).then(() => editId)           : clientService.create(clean as never).then(newId)
    case 'drivers':           return editId ? driverService.update(editId, clean as never).then(() => editId)           : driverService.create(clean as never).then(newId)
    case 'general-managers':  return editId ? generalManagerService.update(editId, clean as never).then(() => editId)   : generalManagerService.create(clean as never).then(newId)
    case 'fleet-admins':      return editId ? fleetAdminService.update(editId, clean as never).then(() => editId)       : fleetAdminService.create(clean as never).then(newId)
    case 'operations-admins': return editId ? operationsAdminService.update(editId, clean as never).then(() => editId)  : operationsAdminService.create(clean as never).then(newId)
    // A new IT Admin only ever comes from the handover, never this form.
    case 'it-admins':
      if (!editId) throw new Error('A new IT Administrator is added through the handover on the IT Administrator dashboard.')
      return itAdminService.update(editId, clean as never).then(() => editId)
  }
}

interface FieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  /** Shown at the right of the label row, e.g. the Edit button on a scanned field. */
  action?: React.ReactNode
  children: React.ReactNode
}

function Field({ label, required, error, hint, action, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#818181]">
          {label}
          {hint && <span className="ml-1 normal-case font-normal text-[#555]">({hint})</span>}
          {required && <span className="ml-0.5 text-[#4df9ed]">*</span>}
        </label>
        {action}
      </div>
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

export default function UserFormModal({
  tab, user, onClose, onSaved, enablePermissions = false,
  startInView = false, canEdit = true, editDisabled = false, lockedBy, driverSource = 'company',
}: UserFormModalProps) {
  const isEdit = Boolean(user)
  const [viewing, setViewing] = useState(isEdit && startInView)
  const formRole    = TAB_TO_ROLE[tab]
  const roleModules = formRole ? MODULES_BY_ROLE[formRole] : []
  const showPermissions = enablePermissions && !isEdit && roleModules.length > 0

  const initialState = useMemo(() => buildInitialState(tab, user, driverSource), [tab, user, driverSource])

  const [perms, setPerms] = useState<Record<string, ModuleFlags>>({})

  // One person edits an account at a time. If it changed while this form was
  // waiting on someone else, the form is stale: close it rather than save over them.
  const lock = useRecordLock({
    type:    'user',
    id:      isEdit ? user!.user_id : null,
    enabled: !viewing,
    onStale: () => {
      appToast.info('This account was just changed by someone else. Reopen it to edit the latest.', {
        action: 'user-stale', entityId: user?.user_id,
      })
      onClose()
    },
  })

  const [form, setForm]               = useState<FormState>(initialState)
  const [loading, setLoading]         = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmSave,  setConfirmSave]  = useState(false)
  const [showCustomSuffix, setShowCustomSuffix] = useState(false)

  const [licenseFile,    setLicenseFile]    = useState<File | null>(null)
  const [licensePreview, setLicensePreview] = useState<string | null>(null)
  // Clicking the license photo reveals its actions; View License opens it full size.
  const [licenseActions, setLicenseActions] = useState(false)
  const [licenseFull,    setLicenseFull]    = useState(false)

  const [scanLoading, setScanLoading] = useState(false)
  const [scanDone,    setScanDone]    = useState(false)
  const [scanError,   setScanError]   = useState<string | null>(null)
  const [eligibility, setEligibility] = useState<ScanEligibilityState | null>(null)
  // The license prints "LAST, FIRST MIDDLE" with nothing marking where the first
  // name ends, so "John Georzon" (no middle name) reads the same as
  // "Jerryfel Mandawe". The scan guesses the last word is the middle name; this
  // holds that guess until the admin confirms it.
  const [nameCheck, setNameCheck] = useState<{ first: string; middle: string } | null>(null)
  // Fields the scan filled stay read-only until the admin presses their Edit, so
  // the license's values aren't changed by a stray keystroke. An existing
  // driver's license details open the same way (savedLicenseLocks).
  const [scanLocked, setScanLocked] = useState<Set<string>>(() => savedLicenseLocks(tab, initialState, isEdit))
  // What Undo restores for each field that was locked (the scan's or the saved value).
  const [lockValues, setLockValues] = useState<Record<string, string>>(() => lockValuesOf(savedLicenseLocks(tab, initialState, isEdit), initialState))
  // A license change on a saved driver (renewal, new photo, corrected number):
  // the editor confirms the card against LTO's LTMS, and explains anything the
  // checks flag. The server runs the same checks on its own scan.
  const [licenseVerified, setLicenseVerified] = useState(false)
  const [licenseNote,     setLicenseNote]     = useState('')
  const [licenseIssues,   setLicenseIssues]   = useState<string[]>([])
  const [renewalScanning, setRenewalScanning] = useState(false)
  // Words where the scan may have read an Ñ as a plain N.
  const [nChecks, setNChecks] = useState<NonNullable<LicenseOCRResult['name_n_checks']>>([])

  // Licence links expire after 10–15 minutes. A fresh one is kept here rather
  // than in `user`, because a new `user` resets whatever the admin has typed.
  const [freshLicense, setFreshLicense] = useState<{ userId: string; url: string | null } | null>(null)
  const savedLicenseUrl =
    tab === 'drivers' ? (user as DriverUser | null)?.drivers?.license_image_url ?? null : null
  const storedLicenseUrl =
    freshLicense && freshLicense.userId === user?.user_id ? freshLicense.url : savedLicenseUrl
  useSignedLinkRefresh(storedLicenseUrl, () => {
    const id = user?.user_id
    if (!id) return
    driverService.getOne(id)
      .then((d) => setFreshLicense({ userId: id, url: d?.drivers?.license_image_url ?? null }))
      .catch(() => {})
  }, tab === 'drivers' && !!user?.user_id)

  useEffect(() => {
    return () => { if (licensePreview) URL.revokeObjectURL(licensePreview) }
  }, [licensePreview])

  async function handleLicenseScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLicenseFile(file)
    if (licensePreview) URL.revokeObjectURL(licensePreview)
    setLicensePreview(URL.createObjectURL(file))
    setFieldErrors(prev => { const n = { ...prev }; delete n.license_image; return n })

    setScanLoading(true)
    setScanDone(false)
    setScanError(null)
    setEligibility(null)
    setNameCheck(null)
    setNChecks([])
    setScanLocked(new Set())

    try {
      const result = await ocrService.scanLicense(file)
      setNChecks((result.name_n_checks ?? []).map(c => ({
        ...c, word: toNameCase(c.word), suggested: toNameCase(c.suggested),
      })))
      if (result.first_name && result.middle_name) {
        setNameCheck({ first: toNameCase(result.first_name), middle: toNameCase(result.middle_name) })
      }
      setForm(prev => ({
        ...prev,
        ...(result.first_name     && { first_name:     toNameCase(result.first_name) }),
        ...(result.last_name      && { last_name:      toNameCase(result.last_name) }),
        ...(result.middle_name    && { middle_name:    toNameCase(result.middle_name) }),
        ...(result.suffix         && { suffix:         result.suffix }),
        ...(result.license_number && { license_number: result.license_number }),
        ...(result.license_expiry && { license_expiry: result.license_expiry }),
      }))
      const scannedKeys = LICENSE_FIELDS.filter(k => result[k])
      setScanLocked(new Set(scannedKeys))
      setLockValues(Object.fromEntries(scannedKeys.map(k => [k,
        k === 'license_number' || k === 'license_expiry' ? String(result[k] ?? '') : toNameCase(String(result[k] ?? '')),
      ])))
      if (result.vehicle_eligibility) {
        setEligibility({
          dl_codes:            result.dl_codes          ?? [],
          restriction_codes:   result.restriction_codes ?? [],
          vehicle_eligibility: result.vehicle_eligibility,
        })
      }
      setScanDone(true)
      appToast.success('License scanned — review and confirm the pre-filled fields.', { action: 'ocr-scan' })
    } catch {
      setScanError('Scan failed — fields were not auto-filled, but the image is still attached.')
    } finally {
      setScanLoading(false)
      e.target.value = ''
    }
  }

  // Replacing the license on an existing driver (usually a renewal). The new
  // card is scanned: its expiry is filled in (locked, with Undo), and the name
  // and license number are only COMPARED with the saved ones, never overwritten,
  // so another person's license shows up as a mismatch instead of quietly
  // replacing this driver's details.
  async function handleLicenseReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLicenseFile(file)
    if (licensePreview) URL.revokeObjectURL(licensePreview)
    setLicensePreview(URL.createObjectURL(file))
    setLicenseActions(false)
    setLicenseVerified(false)
    setFieldErrors(prev => { const n = { ...prev }; delete n.license_image; return n })

    setRenewalScanning(true)
    const issues: string[] = []
    try {
      const r = await ocrService.scanLicense(file)
      if (r.license_number && !sameLicenseNumber(r.license_number, form.license_number)) {
        issues.push(`The new card reads license number ${r.license_number}, not ${String(form.license_number)}. It may be another person's license.`)
      }
      const savedName = `${String(form.first_name ?? '')} ${String(form.last_name ?? '')}`
      const cardName  = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim()
      if (cardName && nameKey(r.last_name) && !nameKey(savedName).includes(nameKey(r.last_name))) {
        issues.push(`The new card reads the name ${toNameCase(cardName)}, not ${savedName.trim()}.`)
      }
      if (r.license_expiry) {
        const expiry = r.license_expiry
        setForm(prev => ({ ...prev, license_expiry: expiry }))
        setScanLocked(prev => new Set(prev).add('license_expiry'))
        setLockValues(prev => ({ ...prev, license_expiry: expiry }))
      } else {
        issues.push('The expiry could not be read from the new card. Enter it by hand.')
      }
    } catch {
      issues.push('The new card could not be read automatically. Check its details by eye.')
    } finally {
      setRenewalScanning(false)
      setLicenseIssues(issues)
    }
  }

  useEffect(() => {
    if (!licenseFull) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setLicenseFull(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [licenseFull])

  // "Confirm email": kept out of the form so it is never sent or counted as a
  // change. Asked on every new account, and on an edit that changes the email.
  const [confirmEmail, setConfirmEmail] = useState('')
  const emailChanged = String(form.email ?? '').trim().toLowerCase() !== String(initialState.email ?? '').trim().toLowerCase()
  const needsEmailConfirm = !isEdit || emailChanged

  const isDirty = useMemo(() => {
    const formDirty = Object.keys(initialState).some(key => form[key] !== initialState[key])
    if (tab === 'drivers') return formDirty || licenseFile !== null
    return formDirty
  }, [form, initialState, licenseFile, tab])

  useEffect(() => {
    setForm(initialState)
    setConfirmEmail('')
    setPerms({})
    setGlobalError(null)
    setFieldErrors({})
    setLicenseFile(null)
    setLicensePreview(null)
    setScanDone(false)
    setScanError(null)
    setEligibility(null)
    setNameCheck(null)
    setNChecks([])
    setScanLocked(savedLicenseLocks(tab, initialState, isEdit))
    setLockValues(lockValuesOf(savedLicenseLocks(tab, initialState, isEdit), initialState))
    setLicenseVerified(false)
    setLicenseNote('')
    setLicenseIssues([])
    setShowCustomSuffix(
      !!initialState.suffix && !USER_SUFFIXES.includes(initialState.suffix as never),
    )
  }, [initialState])

  function buildValidationPayload(currentForm: FormState): Record<string, unknown> {
    const payload: Record<string, unknown> = { ...currentForm }
    if (payload.phone)    payload.phone    = attachCountryCode(String(payload.phone))
    if (payload.landline) payload.landline = attachCountryCode(String(payload.landline))
    else                  delete payload.landline
    if (payload.vendor_contact) payload.vendor_contact = attachCountryCode(String(payload.vendor_contact))
    else                        delete payload.vendor_contact
    return payload
  }

  function validateField(key: string, value: unknown, currentForm: FormState) {
    const merged: FormState = { ...currentForm, [key]: value as string | boolean | number }
    const payload = buildValidationPayload(merged)
    const errors  = validateForm(tab, isEdit, payload)
    setFieldErrors(prev => {
      const next = { ...prev }
      if (errors[key]) next[key] = errors[key]
      else             delete next[key]
      return next
    })
  }

  function set(key: string, value: string | boolean | number | null) {
    if (typeof value === 'string' && NAME_FIELDS.has(key)) value = toNameCase(value)
    // Typing in either name field is its own answer to the middle-name question.
    if (key === 'first_name' || key === 'middle_name') setNameCheck(null)
    if (NAME_FIELDS.has(key)) setNChecks(prev => prev.filter(c => c.field !== key))
    setForm(prev => {
      const next = { ...prev, [key]: value }
      validateField(key, value, next)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError(null)

    if (tab === 'drivers' && !isEdit && !licenseFile) {
      setFieldErrors(prev => ({ ...prev, license_image: 'License image is required' }))
      return
    }

    const payload = buildValidationPayload(form)
    const errors  = validateForm(tab, isEdit, payload)
    const confirmError = needsEmailConfirm ? confirmEmailError(String(form.email ?? ''), confirmEmail) : undefined
    if (confirmError) errors.confirm_email = confirmError
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return }
    if (licenseCheck && !licenseVerified) {
      setGlobalError('Tick that you checked this license against LTO (LTMS) before saving.')
      return
    }
    if (licenseCheck && shownIssues.length > 0 && licenseNote.trim().length < 10) {
      setGlobalError('Add a note explaining the flagged license details before saving.')
      return
    }
    setConfirmSave(true)
  }

  async function handleConfirmedSubmit() {
    setConfirmSave(false)
    setLoading(true)
    setGlobalError(null)
    setFieldErrors({})
    try {
      const newUserId = await submitForm(tab, form, licenseFile, isEdit ? user!.user_id : undefined, initialState,
        licenseCheck ? { license_verified: 'true', license_change_note: licenseNote.trim() } : undefined)

      // Persist the module-access matrix for newly created accounts. Only sent
      // when at least one module is granted — otherwise the account keeps its
      // default role access. A permissions failure must not undo the account.
      if (showPermissions && newUserId) {
        const anyGranted = Object.values(perms).some((f) => f.can_view)
        if (anyGranted) {
          try {
            await permissionsService.save(
              newUserId,
              // A module with one box is saved with it ticked, as the matrix shows it.
              roleModules.map((m) => {
                const locked = lockedLevelFor(m)
                return { module_name: m, ...(locked ? levelToFlags(locked) : perms[m] ?? EMPTY_FLAGS) }
              }),
            )
          } catch {
            appToast.error('Account created, but saving module access failed. Set it via Manage Access.', { action: 'user-form-error' })
          }
        }
      }

      appToast.success(
        isEdit
          ? `${formLabel} updated successfully.`
          : isVendorDriver
            ? `New ${formLabel} added. A setup link for the app was emailed to them.`
            : `New ${formLabel} account created.`,
        { action: isEdit ? 'edit-user' : 'create-user', entityId: user?.user_id ?? 'new' },
      )
      onSaved()
    } catch (err: unknown) {
      const { message, fieldErrors: fe } = extractApiError(err)
      setFieldErrors(fe)
      // The server's own license checks: show what it found, so the note can answer it.
      const serverIssues = (err as { response?: { data?: { issues?: unknown } } })?.response?.data?.issues
      if (Array.isArray(serverIssues) && serverIssues.length) setLicenseIssues(serverIssues.map(String))
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

  // Opened from view mode, closing the edit returns to the read-only view
  // (changes reverted) instead of closing the panel.
  function leaveEdit() {
    setForm(initialState)
    setConfirmEmail('')
    setFieldErrors({})
    setGlobalError(null)
    setLicenseFile(null)
    setLicensePreview(null)
    setLicenseActions(false)
    setScanLocked(savedLicenseLocks(tab, initialState, isEdit))
    setLockValues(lockValuesOf(savedLicenseLocks(tab, initialState, isEdit), initialState))
    setLicenseVerified(false)
    setLicenseNote('')
    setLicenseIssues([])
    setViewing(true)
  }

  function requestCancel() {
    if (startInView) {
      if (isDirty) setConfirmClose(true)
      else leaveEdit()
    } else {
      setConfirmClose(true)
    }
  }

  // The license on a saved driver is changing: a new photo, number or expiry,
  // or the holder's name (it is printed on the license too).
  const nameEdited = (['first_name', 'middle_name', 'last_name'] as const)
    .filter(k => nameKey(form[k]) !== nameKey(initialState[k]))
  const licenseChanging = tab === 'drivers' && isEdit && (
    licenseFile !== null
    || !sameLicenseNumber(form.license_number, initialState.license_number)
    || String(form.license_expiry ?? '') !== String(initialState.license_expiry ?? '')
    || nameEdited.length > 0
  )
  // Every new driver gets the license check too (LTMS tick, note for anything
  // that differs from the card), as does every license change on a saved one.
  const licenseCheck = licenseChanging || (tab === 'drivers' && !isEdit)
  // New driver: a scanned field changed by hand no longer matches the card.
  const LICENSE_LABEL: Record<string, string> = {
    first_name: 'first name', last_name: 'last name', middle_name: 'middle name',
    license_number: 'license number', license_expiry: 'license expiry',
  }
  const createIssues = tab === 'drivers' && !isEdit
    ? [
        ...(scanError ? ['The license could not be read automatically, so its details were typed by hand.'] : []),
        ...Object.entries(lockValues)
          .filter(([k, v]) => v !== '' && String(form[k] ?? '').trim() !== v.trim())
          .map(([k, v]) => `The ${LICENSE_LABEL[k] ?? k} was changed from what the card reads (${v}) to ${String(form[k] ?? '') || 'empty'}.`),
      ]
    : []
  // Saved driver: a name edited away from the license on file.
  const fullName = (st: FormState) => [st.first_name, st.middle_name, st.last_name].map(v => String(v ?? '').trim()).filter(Boolean).join(' ')
  const editIssues = tab === 'drivers' && isEdit && nameEdited.length > 0
    ? [licenseFile
        ? `The driver's name changes from ${fullName(initialState)} to ${fullName(form)}.`
        : `The driver's name changes from ${fullName(initialState)} to ${fullName(form)}, but the license on file still reads ${fullName(initialState)}. Upload the new license if the name on it changed.`]
    : []
  const localIssues = [...createIssues, ...editIssues]
  const shownIssues = [...localIssues, ...licenseIssues.filter((m) => !localIssues.includes(m))]
  const isSaveDisabled = loading || (isEdit && !isDirty)
  const fe = fieldErrors

  const isVendorDriver = tab === 'drivers' && form.is_external === true
  const formLabel      = isVendorDriver ? 'Vendor Driver' : TAB_LABELS[tab]

  function unlockScanned(key: string) {
    setScanLocked(prev => { const n = new Set(prev); n.delete(key); return n })
    requestAnimationFrame(() => document.getElementById(`user-form-${key}`)?.focus())
  }

  /** Undo: put back the value it was locked with, and lock it again. */
  function relockScanned(key: string) {
    if (!(key in lockValues)) return
    setForm(prev => ({ ...prev, [key]: lockValues[key] }))
    setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n })
    setScanLocked(prev => new Set(prev).add(key))
  }

  /** Read-only props for a field the scan filled, plus the Edit button that unlocks it. */
  function scanned(key: string) {
    const locked = scanLocked.has(key)
    return {
      input: {
        id: `user-form-${key}`,
        readOnly: locked,
        ...(locked && { title: isEdit ? "From the driver's license. Press Edit to change it." : 'Filled from the license scan. Press Edit to change it.' }),
      },
      // No cyan hover/focus border or caret while locked: it must not look typeable.
      lockedClass: locked
        ? 'opacity-70 cursor-default caret-transparent hover:border-[#424242]! focus:border-[#424242]!'
        : '',
      // Viewing: the whole form is read-only already, so no Edit buttons. Once
      // unlocked, Edit becomes Undo, which puts the scanned/saved value back and
      // locks the field again: the way back from an edit that was a mistake.
      action: viewing ? undefined : locked ? (
        <button
          type="button"
          onClick={() => unlockScanned(key)}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4df9ed] transition [@media(hover:hover)]:hover:text-[#7bfbf5]"
        >
          <Pencil size={11} /> Edit
        </button>
      ) : key in lockValues ? (
        <button
          type="button"
          onClick={() => relockScanned(key)}
          title={`Back to ${lockValues[key] || 'empty'} and lock it again`}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#818181] transition [@media(hover:hover)]:hover:text-white"
        >
          <Undo2 size={11} /> Undo{String(form[key] ?? '') !== lockValues[key] ? ` (was ${lockValues[key] || 'empty'})` : ''}
        </button>
      ) : undefined,
    }
  }

  const isKnownSuffix = USER_SUFFIXES.includes(form.suffix as never)
  const suffixSelectValue = showCustomSuffix ? 'others' : ((form.suffix ?? '') as string)

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
          className="relative z-10 w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] shadow-2xl [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#2a2a2a] bg-[#1b1b1b] px-6 py-4">
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#4df9ed]">
                {viewing ? 'View' : isEdit ? 'Edit' : 'Create'}
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-white">
                {formLabel}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => (viewing || !isDirty ? onClose() : setConfirmClose(true))}
              className="rounded-lg p-2 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 px-6 py-6">
            <RecordLockBanner lock={lock} noun="account" />
            {tab === 'drivers' && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#818181]">Driver from</p>
                {/* Picked before the form opened (Create User → type), and fixed once the driver exists. */}
                <p className="text-sm text-white">
                  {isVendorDriver ? 'Vendor' : '8338 Logistics (company driver)'}
                </p>
              </div>
            )}
            {tab === 'drivers' && (
              <div className="rounded-xl border border-dashed border-[#424242] bg-[#2a2a2a]/30 px-4 py-4">

                {/* Header */}
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#818181]">
                    License Image
                  </p>
                  {licenseFile && (
                    <span className="text-[10px] text-[#4df9ed] font-medium truncate max-w-[180px]">
                      {licenseFile.name}
                    </span>
                  )}
                </div>

                {!isEdit && (
                  <p className="mb-3 text-[11px] leading-snug text-[#818181]">
                    Upload the driver&apos;s license first — scanning auto-fills the full name and license details below.
                  </p>
                )}

                {(licensePreview ?? storedLicenseUrl) ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setLicenseActions(v => !v)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLicenseActions(v => !v) } }}
                    className="relative mb-3 cursor-pointer overflow-hidden rounded-lg border border-[#424242] outline-none focus-visible:border-[#4df9ed]"
                  >
                    <ProtectedImg
                      src={licensePreview ?? storedLicenseUrl!}
                      alt="License preview"
                      className="h-32 w-full object-cover"
                    />
                    {licenseActions && (
                      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/70 backdrop-blur-[2px]">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setLicenseActions(false); setLicenseFull(true) }}
                          className="flex items-center gap-2 rounded-lg border border-[#424242] bg-[#1b1b1b] px-4 py-2 text-sm font-medium text-white transition hover:border-[#4df9ed50]"
                        >
                          <Eye size={14} /> View License
                        </button>
                        {isEdit && !viewing && !lock.readOnly && (
                          <label
                            onClick={e => e.stopPropagation()}
                            className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#4df9ed] px-4 py-2 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5]"
                          >
                            <Upload size={14} /> Update License
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              onChange={handleLicenseReplace}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                ) : isEdit && (
                  <p className="mb-3 text-[11px] text-[#818181]">No license image on file.</p>
                )}

                {isEdit && !viewing && !lock.readOnly && !(licensePreview ?? storedLicenseUrl) && (
                  <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-[#424242] bg-[#1b1b1b] px-4 py-2 text-sm text-[#818181] transition hover:border-[#4df9ed50] hover:text-white">
                    <Upload size={14} /> Upload License
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={handleLicenseReplace}
                    />
                  </label>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2">

                  {!isEdit && (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#424242] bg-[#1b1b1b] px-4 py-2 text-sm text-[#818181] transition hover:border-[#4df9ed50] hover:text-white">
                      {scanLoading
                        ? <Loader2 size={14} className="animate-spin" />
                        : scanDone
                        ? <CheckCircle size={14} className="text-[#4df9ed]" />
                        : <ScanLine size={14} />}
                      <span>
                        {scanLoading ? 'Scanning…' : scanDone ? 'Re-scan' : 'Scan & auto-fill'}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={handleLicenseScan}
                        disabled={scanLoading}
                      />
                    </label>
                  )}

                  {scanError && (
                    <p className="w-full text-[11px] text-red-400">{scanError}</p>
                  )}
                </div>

                {fe.license_image && (
                  <p className="mt-2 text-[11px] text-red-400">{fe.license_image}</p>
                )}

                {isEdit && user?.user_id && <LicenseHistory userId={user.user_id} />}

              </div>
            )}

            <fieldset
              disabled={viewing || lock.readOnly}
              className={`flex flex-col gap-5 min-w-0 border-0 p-0 m-0 ${
                lock.readOnly ? 'pointer-events-none opacity-70' : viewing ? 'pointer-events-none' : ''
              }`}
            >

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name" required error={fe.first_name} action={scanned('first_name').action}>
                <Input
                  {...scanned('first_name').input}
                  className={scanned('first_name').lockedClass}
                  value={form.first_name as string}
                  onChange={e => set('first_name', e.target.value)}
                  placeholder="Juan"
                  error={fe.first_name}
                />
              </Field>
              <Field label="Last Name" required error={fe.last_name} action={scanned('last_name').action}>
                <Input
                  {...scanned('last_name').input}
                  className={scanned('last_name').lockedClass}
                  value={form.last_name as string}
                  onChange={e => set('last_name', e.target.value)}
                  placeholder="Dela Cruz"
                  error={fe.last_name}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Middle Name" hint="Optional" error={fe.middle_name} action={scanned('middle_name').action}>
                <Input
                  {...scanned('middle_name').input}
                  className={scanned('middle_name').lockedClass}
                  value={form.middle_name as string}
                  onChange={e => set('middle_name', e.target.value)}
                  placeholder="Reyes"
                  error={fe.middle_name}
                />
              </Field>
              <Field label="Suffix" error={fe.suffix}>
                <div className={`grid gap-2 items-end grid-cols-1 ${suffixSelectValue === 'others' ? 'sm:grid-cols-[1fr_1.4fr]' : ''}`}>
                  <Select
                    value={suffixSelectValue}
                    onChange={e => {
                      const value = e.target.value
                      if (value === 'others') {
                        setShowCustomSuffix(true)
                        set('suffix', '')
                      } else {
                        setShowCustomSuffix(false)
                        set('suffix', value === '' ? null : value)
                      }
                    }}
                    error={fe.suffix}
                  >
                    <option value=""> N/A </option>
                    {USER_SUFFIXES.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="others">Others…</option>
                  </Select>
                  {suffixSelectValue === 'others' ? (
                    <Input
                      value={form.suffix as string}
                      onChange={e => set('suffix', e.target.value)}
                      placeholder="Type suffix…"
                      maxLength={20}
                      error={fe.suffix}
                      className="border-0 border-b border-[#555] bg-transparent px-0 py-2 text-sm text-white placeholder:text-[#777]"
                      style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
                      autoFocus
                    />
                  ) : (
                    <div />
                  )}
                </div>
              </Field>
            </div>

            {nChecks.map(c => (
              <div
                key={`${c.field}:${c.word}`}
                className="flex flex-col gap-2.5 rounded-[10px] border border-[#4df9ed40] bg-[#4df9ed0d] px-3.5 py-3"
              >
                <p className="text-[12px] leading-snug text-[#cfcfcf]">
                  The scan wasn&apos;t sure about an &ldquo;N&rdquo; in{' '}
                  <span className="font-semibold text-white">&ldquo;{c.word}&rdquo;</span>. Check the license: is it spelled{' '}
                  <span className="font-semibold text-white">&ldquo;{c.suggested}&rdquo;</span>?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const swap = (v: string) => v.split(' ').map(w => (w === c.word ? c.suggested : w)).join(' ')
                      setForm(prev => ({ ...prev, [c.field]: swap(String(prev[c.field] ?? '')) }))
                      setNameCheck(prev => prev && { first: swap(prev.first), middle: swap(prev.middle) })
                      // The card's own reading, corrected: not a change from the card.
                      setLockValues(prev => c.field in prev ? { ...prev, [c.field]: swap(prev[c.field]) } : prev)
                      setNChecks(prev => prev.filter(x => x !== c))
                    }}
                    className="rounded-[8px] border border-[#424242] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:border-[#4df9ed]"
                  >
                    Yes, use &ldquo;{c.suggested}&rdquo;
                  </button>
                  <button
                    type="button"
                    onClick={() => setNChecks(prev => prev.filter(x => x !== c))}
                    className="rounded-[8px] border border-[#424242] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:border-[#4df9ed]"
                  >
                    No, keep &ldquo;{c.word}&rdquo;
                  </button>
                </div>
              </div>
            ))}

            {nameCheck && (
              <div className="flex flex-col gap-2.5 rounded-[10px] border border-[#4df9ed40] bg-[#4df9ed0d] px-3.5 py-3">
                <p className="text-[12px] leading-snug text-[#cfcfcf]">
                  The license doesn&apos;t show where the first name ends. Is{' '}
                  <span className="font-semibold text-white">&ldquo;{nameCheck.middle}&rdquo;</span>{' '}
                  the middle name, or part of the first name?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNameCheck(null)}
                    className="rounded-[8px] border border-[#424242] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:border-[#4df9ed]"
                  >
                    Middle name
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const { first, middle } = nameCheck
                      setForm(prev => ({ ...prev, first_name: `${first} ${middle}`, middle_name: '' }))
                      // How the card's name splits, not a change from the card.
                      setLockValues(prev => ({ ...prev, first_name: `${first} ${middle}`, middle_name: '' }))
                      setFieldErrors(prev => { const n = { ...prev }; delete n.first_name; delete n.middle_name; return n })
                      setNameCheck(null)
                    }}
                    className="rounded-[8px] border border-[#424242] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:border-[#4df9ed]"
                  >
                    Part of the first name (&ldquo;{nameCheck.first} {nameCheck.middle}&rdquo;, no middle name)
                  </button>
                </div>
              </div>
            )}

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
              {needsEmailConfirm && !viewing && (
                <Field label="Confirm Email" required error={fe.confirm_email}>
                  <Input
                    type="email"
                    value={confirmEmail}
                    onChange={e => {
                      const next = e.target.value
                      setConfirmEmail(next)
                      // Checked as they type once something is there; required only on save.
                      setFieldErrors(prev => {
                        const n = { ...prev }
                        const err = next.trim() ? confirmEmailError(String(form.email ?? ''), next) : undefined
                        if (err) n.confirm_email = err
                        else delete n.confirm_email
                        return n
                      })
                    }}
                    onPaste={blockPaste}
                    onDrop={blockPaste}
                    autoComplete="off"
                    placeholder="Type the email again"
                    error={fe.confirm_email}
                  />
                </Field>
              )}
            </div>

            <Field label="Mobile" required error={fe.phone}>
              <PhoneInputRow
                value={form.phone as string}
                onChange={digits => set('phone', digits)}
                error={fe.phone}
              />
            </Field>

            {tab === 'clients' && (<>
              <Field label="Landline" hint="Optional" error={fe.landline}>
                <LandlineInputRow
                  value={form.landline as string}
                  onChange={digits => set('landline', digits)}
                  error={fe.landline}
                />
              </Field>

              <Field label="Company Name" required error={fe.company_name}>
                <Input
                  value={form.company_name as string}
                  onChange={e => set('company_name', e.target.value)}
                  placeholder="Acme Corp"
                  error={fe.company_name}
                />
              </Field>

              <Field label="Billing Address" required error={fe.billing_address}>
                <BillingAddressField
                  value={form.billing_address as string}
                  onChange={v => set('billing_address', v)}
                  placeholder="Unit 1203, 12/F Tower A, Ayala Ave, Makati City"
                  rows={2}
                  maxLength={300}
                  textareaClassName={`${inputBase} resize-none ${fe.billing_address ? 'border-red-500/60' : ''}`}
                />
              </Field>

              <Field label="Contract Valid Until" required={!isEdit} error={fe.contract_valid_until}>
                <Input
                  type="date"
                  value={form.contract_valid_until as string}
                  onChange={e => set('contract_valid_until', e.target.value)}
                  error={fe.contract_valid_until}
                  className="[color-scheme:dark]"
                />
              </Field>
            </>)}

            {tab === 'drivers' && (<>

              {isVendorDriver && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Company Name" required error={fe.vendor_name}>
                    <Input
                      value={form.vendor_name as string}
                      onChange={e => set('vendor_name', e.target.value)}
                      placeholder="ABC Trucking Services"
                      maxLength={120}
                      error={fe.vendor_name}
                    />
                  </Field>
                  <Field label="Vendor Contact" hint="Optional" error={fe.vendor_contact}>
                    <PhoneInputRow
                      value={form.vendor_contact as string}
                      onChange={digits => set('vendor_contact', digits)}
                      error={fe.vendor_contact}
                    />
                  </Field>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="License Number" required error={fe.license_number} action={scanned('license_number').action}>
                  <Input
                    {...scanned('license_number').input}
                    className={scanned('license_number').lockedClass}
                    value={form.license_number as string}
                    onChange={e => set('license_number', e.target.value.toUpperCase().replace(/\s+/g, ''))}
                    placeholder="N01-23-456789"
                    error={fe.license_number}
                  />
                </Field>
                <Field label="License Expiry" required error={fe.license_expiry} action={scanned('license_expiry').action}>
                  <Input
                    {...scanned('license_expiry').input}
                    type="date"
                    value={form.license_expiry as string}
                    onChange={e => set('license_expiry', e.target.value)}
                    error={fe.license_expiry}
                    className={`[color-scheme:dark] ${scanned('license_expiry').lockedClass}`}
                  />
                </Field>
              </div>
            </>)}

            {showPermissions && (
              <div className="rounded-xl border border-[#2a2a2a] bg-[#0f0f0f]/60 p-4">
                <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#4df9ed]">Module Access</p>
                <p className="mt-1 mb-3 text-[11px] leading-snug text-[#818181]">
                  Choose what this account can access on creation: <b>Read Only</b> (view &amp; export)
                  or <b>Manage All</b> (view, create, edit, export &amp; archive). Leave all unchecked to
                  keep default role access — you can change this later via Manage Access.
                </p>
                <ModulePermissionMatrix
                  modules={roleModules}
                  value={perms}
                  onChange={(m, next) => setPerms((prev) => ({ ...prev, [m]: next }))}
                />
              </div>
            )}

            {licenseCheck && (
              <div className="rounded-xl border border-[#FFEA00]/30 bg-[#FFEA00]/[0.05] px-4 py-3.5 flex flex-col gap-3">
                <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#FFEA00]">{isEdit ? 'License change' : 'License check'}</p>
                {renewalScanning && (
                  <p className="flex items-center gap-2 text-[12px] text-[#c4c4c4]"><Loader2 size={13} className="animate-spin" /> Reading the new card…</p>
                )}
                {shownIssues.length > 0 && (
                  <ul className="flex flex-col gap-1.5 text-[12px] leading-snug text-white/85 list-disc pl-4">
                    {shownIssues.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                )}
                <label className="flex items-start gap-2.5 text-[12px] leading-snug text-white/85 cursor-pointer">
                  <input type="checkbox" checked={licenseVerified} onChange={e => setLicenseVerified(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#4df9ed]" />
                  I checked this license against LTO (LTMS): it is valid and belongs to this driver.
                </label>
                {shownIssues.length > 0 && (
                  <div>
                    <label htmlFor="license-change-note" className="block text-[11px] font-semibold uppercase tracking-widest text-[#818181] mb-1.5">
                      Note<span className="text-red-400"> *</span>
                    </label>
                    <textarea id="license-change-note" rows={3} maxLength={1000} value={licenseNote}
                      onChange={e => setLicenseNote(e.target.value)}
                      placeholder="e.g. Married name on the new card; LTMS shows the same license number."
                      className="w-full resize-none rounded-lg border border-[#424242] bg-[#1b1b1b] px-3 py-2 text-base sm:text-sm text-white outline-none focus:border-[#4df9ed]" />
                  </div>
                )}
                {isEdit && <p className="text-[11px] text-[#818181]">The previous license is kept in the driver&apos;s license history.</p>}
              </div>
            )}

            {globalError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3"
              >
                <p className="text-sm text-red-400 whitespace-pre-line">{globalError}</p>
              </motion.div>
            )}

            </fieldset>

            {viewing ? (
            <div className="flex items-center justify-end gap-3 border-t border-[#2a2a2a] pt-5 mt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#424242] px-5 py-2.5 text-sm font-medium text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
              >
                Close
              </button>
              {canEdit && (lockedBy ? (
                <RecordLockBadge holder={lockedBy} />
              ) : (
                <button
                  type="button"
                  onClick={() => setViewing(false)}
                  {...writeAccess(!editDisabled)}
                  className="flex items-center gap-2 rounded-lg bg-[#4df9ed] px-5 py-2.5 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#4df9ed]"
                >
                  <Pencil size={14} /> Edit Details
                </button>
              ))}
            </div>
            ) : (
            <div className="flex justify-end gap-3 border-t border-[#2a2a2a] pt-5 mt-1">
              <button
                type="button"
                onClick={requestCancel}
                className="rounded-lg border border-[#424242] px-5 py-2.5 text-sm font-medium text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaveDisabled || lock.readOnly}
                title={lock.readOnly ? 'Someone else is editing this account' : isEdit && !isDirty ? 'No changes to save' : undefined}
                className="flex items-center gap-2 rounded-lg bg-[#4df9ed] px-5 py-2.5 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? 'Saving…' : isEdit ? 'Save Changes' : `Create ${formLabel}`}
              </button>
            </div>
            )}
          </form>
        </motion.div>
      </div>

      {licenseFull && (licensePreview ?? storedLicenseUrl) && (
        <motion.div
          key="license-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setLicenseFull(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setLicenseFull(false)}
            className="absolute right-4 top-4 rounded-lg p-2 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
          >
            <X size={20} />
          </button>
          <ProtectedImg
            src={licensePreview ?? storedLicenseUrl!}
            alt="Driver license"
            onClick={e => e.stopPropagation()}
            className="max-h-[90dvh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        </motion.div>
      )}

      <ReusableModal
        key="confirm-close"
        open={confirmClose}
        title="Discard changes?"
        description="Any unsaved changes will be lost. Are you sure you want to close this form?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmClose(false)
          if (startInView && isEdit) leaveEdit()
          else onClose()
        }}
        onCancel={() => setConfirmClose(false)}
      />

      <ReusableModal
        key="confirm-save"
        open={confirmSave}
        title={isEdit ? `Save changes to this ${formLabel}?` : `Create new ${formLabel}?`}
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