'use client'

import Pagination from '@/components/ui/Pagination'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus, UserRoundPlus, Search, MoreVertical, ChevronDown,
  Pencil, Eye, ShieldCheck, ShieldOff, Archive,
  AlertTriangle, ArrowLeftRight,
  KeyRound, Send, RotateCcw, Flag,
} from 'lucide-react'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import type {
  UserTab, AnyUser, UserStatus,
  ClientUser, DriverUser, AdminUser,
} from '@/app/types/admin/user-management.types'
import {
  userService,
  clientService, driverService, itAdminService,
} from '@/lib/services/admin/user-management.service'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import UserFormModal, { type DriverSource } from './UserFormModal'
import AccountTypePicker, { type AccountTypeOption } from '@/components/admin/AccountTypePicker'
import { useRecordLocks } from '@/lib/hooks/useRecordLock'
import { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import PasswordResetQueue from '@/components/admin/PasswordResetQueue'
import { licenseExpiryState, needsLicenseUpdate } from '@/lib/license-expiry'
import ItAdminTransitionModal from '@/components/admin/ItAdminTransitionModal'
import ModuleSectionTabs, { type ModuleSection } from '@/components/admin/ModuleSectionTabs'
import { passwordResetService } from '@/lib/services/admin/password-reset.service'
import { externalDriverService, type VendorDriverUser } from '@/lib/services/admin/external-driver.service'
import { useAuthStore } from '@/lib/store/auth.store'
import { useModuleAccess } from '@/components/layout/ModuleAccess'

import RefreshButton from '@/components/ui/RefreshButton'
type UserMgmtTab = Extract<UserTab, 'clients' | 'drivers' | 'it-admins'>
// The dropdown below filters the directory by role. Password resets are a queue
// you act on, not a slice of the directory, so they are a top-level section
// instead — see ModuleSectionTabs.
//
// Drivers split into two tabs under the one dropdown entry. Vendor drivers are
// role='driver' too, but they are passkey-only subcontractors — no password, not
// company crew — so they get their own list and their own access actions. Both
// kinds are added and edited through the same driver form.
type TabValue = UserMgmtTab | 'vendor-drivers' | 'all'
type DirectoryTab = Exclude<TabValue, 'all'>

const DRIVER_TABS: { key: 'drivers' | 'vendor-drivers'; label: string }[] = [
  { key: 'drivers',        label: 'Company Drivers' },
  { key: 'vendor-drivers', label: 'Vendor Drivers'  },
]

// Kept for the ?tab=password-resets deep-link a reset notification sends.
const RESETS_DEEPLINK = 'password-resets'

const TABS: { key: TabValue; label: string }[] = [
  { key: 'all',        label: 'All Users' },
  { key: 'clients',    label: 'Clients'   },
  { key: 'drivers',    label: 'Drivers'   },
  { key: 'it-admins',  label: 'IT Administrator'  },
]

type NewAccountType = 'clients' | 'company-driver' | 'vendor-driver' | 'it-admins'

const NEW_ACCOUNT_TYPES: AccountTypeOption<NewAccountType>[] = [
  { key: 'clients',        label: 'Client',                  hint: 'A company that books deliveries.' },
  { key: 'company-driver', label: 'Company Driver',          hint: '8338 Logistics driver. Signs in with a password.' },
  { key: 'vendor-driver',  label: 'Vendor Driver',           hint: 'Supplied by a vendor. Signs in with a passkey.' },
  { key: 'it-admins',      label: 'IT Administrator',        hint: 'Runs the system. Only one can be active.' },
]

const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4df9ed' },
    background: { paper: '#1b1b1b' },
  },
})

const PAGE_SIZE = 10

async function fetchByTab(tab: DirectoryTab): Promise<AnyUser[]> {
  switch (tab) {
    case 'clients':   return clientService.getAll() as Promise<AnyUser[]>
    case 'drivers':   return driverService.getAll() as Promise<AnyUser[]>
    case 'vendor-drivers': return externalDriverService.list() as Promise<AnyUser[]>
    case 'it-admins': return itAdminService.getAll() as unknown as Promise<AnyUser[]>
  }
}

function serviceForTab(tab: UserMgmtTab) {
  if (tab === 'clients')   return clientService
  if (tab === 'it-admins') return itAdminService
  return driverService
}

async function updateStatus(tab: UserMgmtTab, id: string, status: UserStatus): Promise<void> {
  const svc = serviceForTab(tab)

  if (status === 'active')      return svc.activate(id).then()
  if (status === 'deactivated') return svc.deactivate(id).then()
  if (status === 'archived')    return svc.remove(id)

  return svc.update(id, { status } as never).then()
}

function tabFromRole(role: string): UserMgmtTab {
  if (role === 'driver')   return 'drivers'
  if (role === 'it_admin') return 'it-admins'
  return 'clients'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Table text, per the Figma (3156:400): names in regular Alegreya Sans bold cyan,
// the rest bold white. Headers stay grey small caps.
// MUI sx has no 3xl; this is the same 1920px step.
const FIGMA_MQ = '@media (min-width: 1920px)'
const REGULAR_FONT = "var(--font-alegreya), 'Alegreya Sans', sans-serif"
const NAME_TEXT = 'ff-regular text-[13px] 3xl:text-[15px] font-bold text-[#4df9ed]'
const TD_NAME   = `px-4 3xl:px-5 py-2 3xl:py-2.5 ${NAME_TEXT}`
const TD_MUTED  = 'ff-regular px-4 3xl:px-5 py-2 3xl:py-2.5 text-[12px] 3xl:text-[14px] font-bold text-white'

// The page-header action (Add User / Transition IT Administrator): cyan outline.
// The Figma is drawn at 1920px; its exact sizes apply only from 3xl (1920px) up.
// Below that everything is compact, so laptops (1366x768, or 1920 at 125%
// scaling = 1536x864) still show a useful number of rows.
const HEADER_BTN =
  'flex h-8 3xl:h-9 shrink-0 items-center gap-2 whitespace-nowrap max-sm:w-full max-sm:justify-center rounded-[10px] border border-[#4df9ed] bg-[#4df9ed]/[0.19] ' +
  'px-3 3xl:px-4 text-[13px] 3xl:text-[15px] text-[#4df9ed] transition hover:bg-[#4df9ed]/30 active:scale-95'
const HEADER_ICON = 'size-4 3xl:size-[18px]'



/** Long addresses are cut short with an ellipsis at the edge of their column. */
function EmailText({ value }: { value: string | null | undefined }) {
  return <span title={value ?? undefined} className="block min-w-0 max-lg:max-w-[170px] truncate">{value ?? '—'}</span>
}

/** "[date], [time]": two lines at the Figma's full size, one line when compact. */
function LastLogin({ iso }: { iso: string | null }) {
  if (!iso) return <>Never</>
  const d = new Date(iso)
  return (
    <span className="inline-flex gap-x-1.5 whitespace-nowrap 3xl:flex-col">
      <span>{d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}<span className="3xl:hidden">,</span></span>
      <span>{d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
    </span>
  )
}

const STATUS_CFG: Record<UserStatus, { label: string; cls: string }> = {
  active:             { label: 'Active',      cls: 'bg-[#4df9ed]/[0.24] text-[#4df9ed] border-[#4df9ed]' },
  inactive:           { label: 'Inactive',    cls: 'bg-[#818181]/20 text-[#818181] border-[#818181]'     },
  deactivated:        { label: 'Deactivated', cls: 'bg-[#ff7a30]/20 text-[#ff7a30] border-[#ff7a30]'     },
  archived:           { label: 'Archived',    cls: 'bg-[#ffea00]/20 text-[#ffea00] border-[#ffea00]'     },
  permanently_locked: { label: 'Locked',      cls: 'bg-[#f62626]/20 text-[#f62626] border-[#f62626]'     },
}

function StatusBadge({ status }: { status: UserStatus }) {
  const { label, cls } = STATUS_CFG[status] ?? STATUS_CFG.inactive
  return (
    <span className={`font-[family-name:var(--font-alegreya-sc)] inline-flex h-5 min-w-[58px] 3xl:h-[22px] 3xl:min-w-[64px] items-center justify-center whitespace-nowrap rounded-[15px] border-[0.5px] px-1.5 pb-0.5 text-[11px] 3xl:text-[13px] font-bold ${cls}`}>
      {label}
    </span>
  )
}

interface RowMenuProps {
  user: AnyUser
  tab: TabValue
  onView: () => void
  onEdit: () => void
  onStatusChange: (s: UserStatus) => void
  /** Someone else has this account open for editing: no actions until they finish. */
  lockedBy?: string
}

function RowMenu({ user, tab, onView, onEdit, onStatusChange, lockedBy }: RowMenuProps) {
  const access = useModuleAccess()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const statusActions = ([
    { label: 'Set Active', status: 'active'      as UserStatus, icon: <ShieldCheck size={13} /> },
    { label: 'Deactivate', status: 'deactivated' as UserStatus, icon: <ShieldOff size={13} />   },
    { label: 'Archive',    status: 'archived'    as UserStatus, icon: <Archive size={13} />     },
  ]).filter((a) => a.status !== user.status)
    // Activate/deactivate is an edit; archiving goes through DELETE, so it
    // needs the delete permission (the module's "All" tier).
    .filter((a) => (a.status === 'archived' ? access.canDelete : access.canEdit))

  const canEdit = tab !== 'all' && access.canEdit

  // Viewing is read-only, so it stays available while someone else is editing.
  if (lockedBy) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <RecordLockBadge holder={lockedBy} />
        <button
          onClick={onView}
          title="View Details"
          className="rounded-md p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
        >
          <Eye size={15} />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="rounded-md p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
      >
        <MoreVertical size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-8 z-50 w-48 rounded-xl border border-[#424242] bg-[#1b1b1b] py-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setOpen(false); onView() }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
            >
              <Eye size={13} /> View Details
            </button>
            {canEdit && (
              <button
                onClick={() => { setOpen(false); onEdit() }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
              >
                <Pencil size={13} /> Edit
              </button>
            )}
            {statusActions.length > 0 && (
              <>
                <div className="my-1 border-t border-[#424242]" />
                {statusActions.map((a) => (
                  <button
                    key={a.status}
                    onClick={() => { setOpen(false); onStatusChange(a.status) }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-sm transition ${
                      a.status === 'archived'
                        ? 'text-yellow-400 hover:bg-yellow-500/10'
                        : a.status === 'deactivated'
                        ? 'text-orange-400 hover:bg-orange-500/10'
                        : 'text-[#818181] hover:bg-[#2a2a2a] hover:text-white'
                    }`}
                  >
                    {a.icon} {a.label}
                  </button>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Where a vendor driver's passkey sign-in stands, in one badge. */
function AccessBadge({ access }: { access: VendorDriverUser['access'] | undefined }) {
  // A row without access state is not a vendor account (or not loaded yet).
  if (!access) return <span className="text-sm text-[#818181]">—</span>
  const cfg = !access.account_active
    ? { label: 'Revoked',          cls: 'bg-red-500/15 text-red-400 border-red-500/30' }
    : access.enrolled
      ? { label: `Passkey set up${access.passkey_count > 1 ? ` (${access.passkey_count})` : ''}`,
          cls: 'bg-[#4df9ed]/10 text-[#4df9ed] border-[#4df9ed]/30' }
      : access.invite_pending
        ? { label: 'Setup link sent', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' }
        : { label: 'Not set up',      cls: 'bg-[#818181]/10 text-[#818181] border-[#818181]/30' }
  return (
    <span
      title={access.last_used_at ? `Last used ${formatDateTime(access.last_used_at)}` : undefined}
      className={`font-[family-name:var(--font-alegreya-sc)] inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${cfg.cls}`}
    >
      <KeyRound size={10} /> {cfg.label}
    </span>
  )
}

/**
 * The flag on a vendor account whose access was revoked: automatically once the
 * booking they drove was completed, or by hand. Says when and why, so whoever
 * picks a vendor crew next knows to restore access first.
 */
function RevokedFlag({ user }: { user: VendorDriverUser }) {
  if (!user.access || user.access.account_active) return null
  const at     = user.drivers?.access_revoked_at ?? null
  const reason = user.drivers?.access_revoked_reason ?? null
  return (
    <span
      title={at ? `Revoked ${formatDateTime(at)}` : undefined}
      className="font-[family-name:var(--font-alegreya-sc)] mt-1 inline-flex max-w-[260px] items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-300"
    >
      <Flag size={10} className="shrink-0" />
      <span className="truncate">
        Flagged: access revoked{reason ? ` (${reason})` : ''}{at ? ` · ${formatDate(at)}` : ''}
      </span>
    </span>
  )
}

/**
 * Actions for a vendor driver: the shared view/edit form, plus the access actions
 * a passkey-only account needs instead of a password reset.
 */
function VendorRowMenu({ user, onDone, onView, onEdit, lockedBy }: {
  user:      VendorDriverUser
  onDone:    () => Promise<void> | void
  onView:    () => void
  onEdit:    () => void
  lockedBy?: string
}) {
  const { canEdit } = useModuleAccess()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  if (lockedBy) {
    return (
      <div className="flex items-center justify-end">
        <RecordLockBadge holder={lockedBy} />
      </div>
    )
  }

  const run = async (work: Promise<unknown>, loading: string, success: string, fallback: string) => {
    setOpen(false)
    try {
      await appToast.promise(
        work,
        { loading, success, error: (e) => getApiErrorMessage(e, fallback) },
        { action: 'vendor-driver-access', entityId: user.user_id },
      )
      await onDone()
    } catch { /* handled by toast */ }
  }

  const resend = () => run(
    externalDriverService.reinvite(user.user_id),
    'Sending setup link…', 'Setup link sent to the driver.', 'Could not send the setup link.',
  )

  const revoke = () => {
    if (!window.confirm(
      `Revoke ${user.email}'s app access?\n\n` +
      'Their passkeys stop working immediately and they are signed out. ' +
      'You can restore access later; they will need to set up sign-in again.'
    )) return
    void run(
      externalDriverService.revoke(user.user_id),
      'Revoking access…', 'Access revoked.', 'Could not revoke access.',
    )
  }

  const restore = () => run(
    externalDriverService.restore(user.user_id),
    'Restoring access…', 'Access restored. A new setup link was sent.', 'Could not restore access.',
  )

  const item = 'flex w-full items-center gap-2.5 px-3.5 py-2 text-sm transition'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="rounded-md p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
      >
        <MoreVertical size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-8 z-50 w-52 rounded-xl border border-[#424242] bg-[#1b1b1b] py-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => { setOpen(false); onView() }} className={`${item} text-[#818181] hover:bg-[#2a2a2a] hover:text-white`}>
              <Eye size={13} /> View Details
            </button>
            {canEdit && (
              <button onClick={() => { setOpen(false); onEdit() }} className={`${item} text-[#818181] hover:bg-[#2a2a2a] hover:text-white`}>
                <Pencil size={13} /> Edit Details
              </button>
            )}
            {canEdit && <div className="my-1 border-t border-[#424242]" />}
            {!canEdit || !user.access ? null : user.access.account_active ? (
              <>
                <button onClick={resend} className={`${item} text-[#818181] hover:bg-[#2a2a2a] hover:text-white`}>
                  <Send size={13} /> Resend Setup Link
                </button>
                <div className="my-1 border-t border-[#424242]" />
                <button onClick={revoke} className={`${item} text-red-400 hover:bg-red-500/10`}>
                  <ShieldOff size={13} /> Revoke Access
                </button>
              </>
            ) : (
              <button onClick={restore} className={`${item} text-[#818181] hover:bg-[#2a2a2a] hover:text-white`}>
                <RotateCcw size={13} /> Restore Access
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: PAGE_SIZE }).map((_, i) => (
        <tr key={i} className="border-b border-[#424242]">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 3xl:px-5 py-2 3xl:py-2.5">
              <div
                className="h-3 animate-pulse rounded bg-[#2a2a2a]"
                style={{ width: j === 0 ? '140px' : j === cols - 1 ? '60px' : '100px', animationDelay: `${i * 40}ms` }}
              />
              {j === 0 && (
                <div className="mt-1.5 h-2.5 animate-pulse rounded bg-[#2a2a2a]" style={{ width: '80px', animationDelay: `${i * 40 + 20}ms` }} />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function EmptyState({ tab, onAdd, canAdd }: { tab: TabValue; onAdd: () => void; canAdd: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 rounded-full border border-[#424242] bg-[#1b1b1b] p-4">
        <Users size={28} className="text-[#818181]" />
      </div>
      <p className="text-base font-semibold text-white">No records found</p>
      <p className="mt-1 text-sm text-[#818181]">
        {tab === 'vendor-drivers'
          ? 'No vendor drivers yet. Add one here, then pick them in Booking Management for a vendor-supplied delivery.'
          : `No ${tab === 'all' ? 'users' : tab} match your current filters.`}
      </p>
      {tab !== 'all' && canAdd && (
        <button
          onClick={onAdd}
          className="mt-6 flex items-center gap-2 rounded-lg bg-[#4df9ed] px-4 py-2 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5]"
        >
          <UserPlus size={14} /> Add First User
        </button>
      )}
    </div>
  )
}

const ROLE_COLORS: Record<string, string> = {
  driver: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  client: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
}
const ROLE_LABELS: Record<string, string> = {
  driver: 'Driver',
  client: 'Client',
}

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLORS[role] ?? 'bg-[#818181]/10 text-[#818181] border-[#818181]/30'
  const label = ROLE_LABELS[role] ?? role
  return (
    <span className={`font-[family-name:var(--font-alegreya-sc)] inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

/**
 * Flags a license that expires within a month (amber) or has already expired
 * (red), so the Company Administrator knows to update the driver's details.
 * Renders nothing while the license is comfortably in date.
 */
function LicenseExpiryBadge({ expiry }: { expiry: string | null }) {
  const state = licenseExpiryState(expiry)
  if (state.kind === 'ok') return null

  const expired = state.kind === 'expired'
  const label = expired
    ? 'Expired'
    : state.daysLeft === 0 ? 'Expires today'
    : state.daysLeft === 1 ? 'Expires tomorrow'
    : `Expires in ${state.daysLeft} days`
  const cls = expired
    ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'

  return (
    <span
      title="Update this driver's license details once it is renewed."
      className={`font-[family-name:var(--font-alegreya-sc)] inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap ${cls}`}
    >
      <AlertTriangle size={11} /> {label}
    </span>
  )
}

function renderCells(user: AnyUser, tab: TabValue) {
  if (tab === 'all') {
    const name = [user.first_name, user.middle_name, user.last_name, user.suffix].filter(Boolean).join(' ') || '—'
    return (
      <>
        <td className={TD_NAME}>{name}</td>
        <td className={TD_MUTED}><EmailText value={user.email} /></td>
        <td className={TD_MUTED}>{user.phone ?? '—'}</td>
        <td className="px-4 3xl:px-5 py-2 3xl:py-2.5"><RoleBadge role={user.role} /></td>
        <td className="px-4 3xl:px-5 py-2 3xl:py-2.5"><StatusBadge status={user.status} /></td>
      </>
    )
  }

  switch (tab) {
    case 'clients': {
      const u = user as ClientUser
      const name = [u.first_name, u.middle_name, u.last_name, u.suffix].filter(Boolean).join(' ') || '—'
      return (
        <>
          <td className={TD_NAME}>{name}</td>
          <td className={TD_MUTED}><EmailText value={u.email} /></td>
          <td className={TD_MUTED}>{u.clients?.company_name ?? '—'}</td>
          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5"><StatusBadge status={u.status} /></td>
          <td className={TD_MUTED}><LastLogin iso={u.last_login_at ?? null} /></td>
        </>
      )
    }
    case 'drivers': {
      const u = user as DriverUser
      const name = [u.first_name, u.middle_name, u.last_name, u.suffix].filter(Boolean).join(' ') || '—'
      const drvStatus = u.drivers?.status
      return (
        <>
          <td className={TD_NAME}>{name}</td>
          <td className={TD_MUTED}>{u.drivers?.license_number ?? '—'}</td>
          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5 text-[12px] 3xl:text-[14px] text-white">
            <div className="flex flex-col items-start gap-1">
              <span className="ff-regular font-bold">{formatDate(u.drivers?.license_expiry ?? null)}</span>
              <LicenseExpiryBadge expiry={u.drivers?.license_expiry ?? null} />
            </div>
          </td>
          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5">
            {drvStatus && (
              <span className="font-[family-name:var(--font-alegreya-sc)] inline-flex items-center rounded-full border border-[#4df9ed]/30 bg-[#4df9ed]/10 px-2 py-0.5 text-[11px] font-semibold text-[#4df9ed]">
                {drvStatus.replace(/_/g, ' ')}
              </span>
            )}
          </td>
          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5"><StatusBadge status={u.status} /></td>
        </>
      )
    }
    case 'vendor-drivers': {
      const u = user as VendorDriverUser
      const name = [u.first_name, u.middle_name, u.last_name, u.suffix].filter(Boolean).join(' ') || '—'
      return (
        <>
          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5">
            <p className={NAME_TEXT}>{name}</p>
            <RevokedFlag user={u} />
          </td>
          <td className={TD_MUTED}>{u.drivers?.vendor_name || '—'}</td>
          <td className={TD_MUTED}><EmailText value={u.email} /></td>
          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5 text-[12px] 3xl:text-[14px] text-white">
            <div className="flex flex-col items-start gap-1">
              <span className="ff-regular font-bold">{formatDate(u.drivers?.license_expiry ?? null)}</span>
              <LicenseExpiryBadge expiry={u.drivers?.license_expiry ?? null} />
            </div>
          </td>
          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5"><AccessBadge access={u.access} /></td>
          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5"><StatusBadge status={u.status} /></td>
        </>
      )
    }
    case 'it-admins': {
      const name = [user.first_name, user.middle_name, user.last_name, user.suffix].filter(Boolean).join(' ') || '—'
      return (
        <>
          <td className={TD_NAME}>{name}</td>
          <td className={TD_MUTED}><EmailText value={user.email} /></td>
          <td className={TD_MUTED}>{user.phone ?? '—'}</td>
          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5"><StatusBadge status={user.status} /></td>
          <td className={TD_MUTED}><LastLogin iso={user.last_login_at ?? null} /></td>
        </>
      )
    }
  }
}

// What the count beside the search bar calls a row: "2 Client Accounts".
const ACCOUNT_NOUN: Record<TabValue, string> = {
  all:              'User',
  clients:          'Client',
  drivers:          'Company Driver',
  'vendor-drivers': 'Vendor Driver',
  'it-admins':      'IT Administrator',
}

// The resets panel brings its own table, so only the directory tabs are here.
const HEADERS: Record<TabValue, string[]> = {
  all:         ['Name', 'Email', 'Phone', 'Role', 'Status'],
  clients:     ['Name', 'Email', 'Company', 'Status', 'Last Login'],
  drivers:     ['Name', 'License #', 'Expiry', 'Driver Status', 'Acct. Status'],
  'vendor-drivers': ['Name', 'Vendor', 'Email', 'Expiry', 'App Access', 'Acct. Status'],
  'it-admins': ['Name', 'Email', 'Phone', 'Status', 'Last Login'],
}

export default function UserManagementClient() {
  const searchParams = useSearchParams()
  // A password-reset notification deep-links here as ?tab=password-resets&request=…
  const deepLinkTab     = searchParams.get('tab')
  const focusRequestId  = searchParams.get('request')

  const [section,          setSection]          = useState<ModuleSection>(
    deepLinkTab === RESETS_DEEPLINK ? 'password-resets' : 'directory',
  )
  const [activeTab,        setActiveTab]        = useState<TabValue>('clients')
  const [resetCount,       setResetCount]       = useState(0)
  const [allRows,          setAllRows]          = useState<AnyUser[]>([])
  const [loading,          setLoading]          = useState(true)
  const [fetching,         setFetching]         = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [searchInput,      setSearchInput]      = useState('')
  const [search,           setSearch]           = useState('')
  const [page,             setPage]             = useState(1)
  // Drivers tab: narrow the list to licenses that are expiring or expired.
  const [licenseOnly,      setLicenseOnly]      = useState(false)
  const [stats,            setStats]            = useState({ total: 0, active: 0, archived: 0 })
  const [serverTotal,      setServerTotal]      = useState(0)
  const [serverTotalPages, setServerTotalPages] = useState(1)
  const [showForm,         setShowForm]         = useState(false)
  const [editUser,         setEditUser]         = useState<AnyUser | null>(null)
  const [formViewOnly,     setFormViewOnly]     = useState(false)
  const userLocks = useRecordLocks('user')
  const [formTab,          setFormTab]          = useState<UserMgmtTab>('clients')
  const [formDriverSource, setFormDriverSource] = useState<DriverSource>('company')
  const [showTransition,   setShowTransition]   = useState(false)
  const [showTypePicker,   setShowTypePicker]   = useState(false)

  // Only the primary administrator may hand the IT Admin role over. The API
  // enforces it; this just keeps a button that would 403 out of the way.
  const isRootAdmin = useAuthStore((s) => s.user?.is_root_admin ?? false)
  // This module's tier for a managed role: Read-only hides every write control.
  const access = useModuleAccess()

  const isResetsTab    = section === 'password-resets'
  // Both driver tabs sit under the one "Drivers" entry in the role dropdown.
  const isDriverTab    = activeTab === 'drivers' || activeTab === 'vendor-drivers'
  const dropdownTab: TabValue = isDriverTab ? 'drivers' : activeTab
  const isITAdminTab   = activeTab === 'it-admins'
  // The system allows exactly one active IT Admin, so the row that matters on
  // this tab is the active one — the rest are kept records of predecessors.
  const activeITAdmin  = isITAdminTab
    ? (allRows.find((u) => u.status === 'active') ?? null)
    : null

  const isInitialAllFetch = useRef(true)

  // Drop the old tab's rows in the same render that switches the tab. Leaving it
  // to the fetch effect is one render too late: that render draws the previous
  // tab's rows with the new tab's cells — company drivers through the vendor
  // columns, which read an `access` field they don't have.
  const switchTab = useCallback((tab: TabValue) => {
    if (tab === activeTab) return
    setAllRows([])
    setLoading(true)
    setActiveTab(tab)
  }, [activeTab])

  // Seeded once on mount so the tab can show a badge before anyone opens it —
  // the panel itself only fetches when it is mounted, which is too late to tell
  // someone there is work waiting. Best effort: a failure just means no badge.
  const loadResetCount = useCallback(() => {
    passwordResetService.list()
      .then((rows) => setResetCount(rows.filter((r) => r.status === 'pending' || r.status === 'expired').length))
      .catch(() => {})
  }, [])

  useEffect(() => { loadResetCount() }, [loadResetCount])

  useLiveTable(['live:password_resets'], loadResetCount)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // `quiet` re-reads in place (a live signal): no spinner, and a failed re-read
  // keeps the rows already on screen instead of replacing them with an error.
  const fetchAllUsers = useCallback(async (searchQuery: string, hard = false, quiet = false) => {
    if (!quiet) {
      if (hard) setLoading(true); else setFetching(true)
      setError(null)
    }
    try {
      const [result, statsResult] = await Promise.all([
        userService.getAll({ search: searchQuery || undefined, role: 'client,driver' }),
        userService.getStats('client,driver'),
      ])
      // Left the All tab while this was in flight: its rows don't belong here.
      if (currentTabRef.current !== 'all') return
      setAllRows(result.data)
      setServerTotal(result.total)
      setServerTotalPages(Math.ceil(result.total / PAGE_SIZE))
      setStats({ total: statsResult.total, active: statsResult.active, archived: statsResult.archived })
    } catch {
      if (!quiet) setError('Failed to load users. Check your connection or permissions.')
    } finally {
      if (!quiet) {
        setLoading(false)
        setFetching(false)
      }
    }
  }, [])

  // The tab whose rows may land. A request for a tab the admin has already left
  // (Drivers, then straight to Vendor Drivers, with Drivers answering last) must
  // not put its rows under the new tab's columns — company drivers drawn
  // through the vendor cells crashed the page on their missing `access`.
  const currentTabRef = useRef<TabValue>(activeTab)
  currentTabRef.current = activeTab

  const fetchTabUsers = useCallback(async (tab: DirectoryTab, quiet = false) => {
    if (!quiet) {
      setLoading(true)
      setError(null)
      setAllRows([])
    }
    try {
      const [rows, statsResult] = await Promise.all([
        fetchByTab(tab),
        userService.getStats('client,driver')
      ])
      if (currentTabRef.current !== tab) return
      setAllRows(rows)
      setStats({ total: statsResult.total, active: statsResult.active, archived: statsResult.archived })
    } catch {
      if (!quiet && currentTabRef.current === tab) setError('Failed to load users. Check your connection or permissions.')
    } finally {
      if (!quiet && currentTabRef.current === tab) setLoading(false)
    }
  }, [])

  // Someone else (or the driver app) changed an account: re-read the open tab.
  useLiveTable(['live:users'], () => {
    if (isResetsTab) return
    if (activeTab === 'all') void fetchAllUsers(search, false, true)
    else void fetchTabUsers(activeTab, true)
  })

  useEffect(() => {
    isInitialAllFetch.current = true
    setPage(1)
    setLicenseOnly(false)
    setSearch('')
    setSearchInput('')
    // The resets panel loads its own data and has no user list to fetch.
    if (isResetsTab) { setLoading(false); return }
    if (activeTab === 'all') fetchAllUsers('', true)
    else fetchTabUsers(activeTab)
  }, [activeTab, isResetsTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isResetsTab || activeTab !== 'all') return
    if (isInitialAllFetch.current) { isInitialAllFetch.current = false; return }
    fetchAllUsers(search, false)
  }, [search, activeTab, isResetsTab, fetchAllUsers])

  /** Reload whichever user list is showing. A no-op on the resets panel, which owns its own data. */
  const refetchCurrentTab = useCallback(async () => {
    if (isResetsTab) return
    if (activeTab === 'all') await fetchAllUsers(search, false)
    else await fetchTabUsers(activeTab)
  }, [isResetsTab, activeTab, search, fetchAllUsers, fetchTabUsers])

  // Counted over the whole roster, not the current page or search, so the notice
  // never undercounts.
  const licenseFlagCount = isDriverTab
    ? allRows.filter((u) => needsLicenseUpdate((u as DriverUser).drivers?.license_expiry)).length
    : 0

  const filtered = activeTab === 'all' || isResetsTab
    ? allRows
    : allRows.filter((u) => {
        // Ignored once nothing is flagged, so updating the last driver can't strand
        // the admin on an empty list with the notice (and its toggle) gone.
        if (licenseOnly && licenseFlagCount > 0 && isDriverTab && !needsLicenseUpdate((u as DriverUser).drivers?.license_expiry)) return false
        if (!search) return true
        const q = search.toLowerCase()
        return (
          u.email?.toLowerCase().includes(q) ||
          u.first_name?.toLowerCase().includes(q) ||
          u.last_name?.toLowerCase().includes(q)
        )
      })

  const total      = activeTab === 'all' ? serverTotal     : filtered.length
  const totalPages = activeTab === 'all' ? serverTotalPages : Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const users      = activeTab === 'all'
    ? allRows
    : filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  async function handleStatusChange(user: AnyUser, status: UserStatus) {
    const serviceTab = activeTab === 'clients' || activeTab === 'drivers'
      ? activeTab
      : tabFromRole(user.role)
    try {
      await appToast.promise(
        updateStatus(serviceTab, user.user_id, status),
        {
          loading: 'Updating account…',
          success: `Status updated → ${STATUS_CFG[status].label}`,
          error:   (e) => getApiErrorMessage(e, 'Failed to update account.'),
        },
        { action: 'update-status', entityId: user.user_id },
      )
      await refetchCurrentTab()
    } catch { /* handled by toast */ }
  }

  function openEdit(user: AnyUser, viewOnly = false) {
    const tab = activeTab === 'clients' || activeTab === 'drivers'
      ? activeTab
      : tabFromRole(user.role)
    setFormTab(tab)
    setEditUser(user)
    setFormViewOnly(viewOnly)
    setShowForm(true)
  }

  // "Create User" asks for the account type first; the form opens once one is picked.
  function openCreate() {
    setShowTypePicker(true)
  }

  function createAccount(type: NewAccountType) {
    setShowTypePicker(false)
    setFormTab(type === 'company-driver' || type === 'vendor-driver' ? 'drivers' : type)
    setFormDriverSource(type === 'vendor-driver' ? 'vendor' : 'company')
    setEditUser(null)
    setFormViewOnly(false)
    setShowForm(true)
  }

  // Only one IT Administrator may be active, and the seat is only known while
  // its tab is open: offer it there when it is empty. A filled seat is handed
  // over with Transition IT Administrator instead.
  const newAccountTypes = NEW_ACCOUNT_TYPES.filter(
    (t) => t.key !== 'it-admins' || (isITAdminTab && !loading && !activeITAdmin),
  )

  function handleRefresh() {
    void refetchCurrentTab()
  }

  const colCount = isResetsTab ? 1 : HEADERS[activeTab].length + 1

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
        <div className="flex flex-col lg:flex-1 lg:min-h-0 px-3 py-3 sm:px-4 lg:px-5 3xl:px-6 lg:pt-3 lg:pb-4 3xl:pb-5 gap-3 3xl:gap-4 lg:overflow-hidden">

          {/* Header */}
          {/* As tall as the Add User button even when it is hidden (Password Reset tab),
              so switching tabs doesn't shift the page. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 lg:min-h-8 3xl:min-h-9 shrink-0">
            <h1 className="text-[17px] 3xl:text-[20px] font-bold text-white">User Management</h1>
            {/*
              On the IT Admin tab "Create User" is the wrong verb: only one may be
              active, so while the seat is filled the only move is to hand it over.
              If it is somehow empty, creating one is exactly right.
            */}
            {!isResetsTab && (
              isITAdminTab && activeITAdmin ? (
                isRootAdmin && (
                  <button
                    onClick={() => setShowTransition(true)}
                    className={HEADER_BTN}
                  >
                    Transition IT Administrator <ArrowLeftRight className={HEADER_ICON} />
                  </button>
                )
              ) : access.canCreate && (
                <button
                  onClick={openCreate}
                  className={HEADER_BTN}
                >
                  Add User <UserRoundPlus className={HEADER_ICON} />
                </button>
              )
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 3xl:gap-4 shrink-0">
            {[
              { label: 'Total Users', value: stats.total,    color: 'text-white'     },
              { label: 'Active',      value: stats.active,   color: 'text-[#4df9ed]' },
              { label: 'Archived',    value: stats.archived, color: 'text-[#ffea00]' },
            ].map((s) => (
              <div key={s.label} className="min-w-0 rounded-[10px] border border-[#424242] bg-[#2a2828] px-2.5 py-2 sm:px-4 sm:py-2.5 3xl:px-5 3xl:py-3 shadow-[0_4px_4px_rgba(0,0,0,0.25)]">
                <p className="text-[10px] leading-tight sm:text-[11px] 3xl:text-[13px] font-bold uppercase text-[#818181]">{s.label}</p>
                <p className={`mt-1 3xl:mt-2 text-[18px] sm:text-[20px] 3xl:text-[24px] font-bold leading-none ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Table card */}
          <div className="flex flex-col lg:flex-1 lg:min-h-0 rounded-[10px] border-[0.5px] border-[#424242] bg-[#1b1b1b] shadow-[0_4px_4px_rgba(0,0,0,0.25)] lg:overflow-hidden">

            {/* Directory vs. queue — two different jobs, so two top-level tabs. */}
            <ModuleSectionTabs
              value={section}
              onChange={setSection}
              directoryLabel="Users"
              resetsLabel="Password Reset"
              pendingCount={resetCount}
              variant="large"
            />

            {/* Role filter, search, refresh and the count, on one row as the
                Figma lays them out. The role filter belongs to the directory
                only: there is nothing to filter by role in a queue. */}
            {!isResetsTab && (
            <div className="flex flex-wrap items-center gap-3 3xl:gap-4 border-b border-[#424242] px-3 sm:px-4 3xl:px-5 py-2 3xl:py-2.5 shrink-0">
              <FormControl size="small" sx={{ width: { xs: '100%', sm: 200 }, [FIGMA_MQ]: { width: 220 } }}>
                <Select
                  value={dropdownTab}
                  onChange={(e: SelectChangeEvent) => switchTab(e.target.value as TabValue)}
                  IconComponent={(props) => <ChevronDown size={18} {...props} />}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        bgcolor: '#1b1b1b', border: '1px solid #424242',
                        borderRadius: '10px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                        mt: '6px', '& .MuiList-root': { p: '4px' },
                        // Portaled to <body>, so it sets the regular face itself.
                        fontFamily: REGULAR_FONT,
                      },
                    },
                  }}
                  sx={{
                    height: '34px', borderRadius: '10px', fontFamily: REGULAR_FONT, fontSize: '13px',
                    color: '#4df9ed', bgcolor: '#424242',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#818181' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4df9ed80' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4df9ed', borderWidth: '1px' },
                    '& .MuiSelect-icon': { color: '#818181', right: '10px', top: 'calc(50% - 9px)' },
                    '& .MuiSelect-select': { display: 'flex', alignItems: 'center', paddingLeft: '12px' },
                    [FIGMA_MQ]: { height: '38px', fontSize: '15px', '& .MuiSelect-select': { paddingLeft: '14px' } },
                  }}
                  renderValue={(value) => {
                    const tab = TABS.find((t) => t.key === value)!
                    return (
                      <span className="flex items-center gap-2 text-[13px] 3xl:text-[15px] text-[#4df9ed]">
                        <Users className="size-4 3xl:size-[18px]" /> {tab.label}
                      </span>
                    )
                  }}
                >
                  {TABS.map((t) => (
                    <MenuItem
                      key={t.key} value={t.key}
                      sx={{
                        borderRadius: '8px', mb: '2px', fontFamily: REGULAR_FONT, fontSize: '13px', [FIGMA_MQ]: { fontSize: '14px' },
                        fontWeight: t.key === 'all' ? 700 : 400,
                        color: dropdownTab === t.key ? '#4df9ed' : '#818181',
                        bgcolor: dropdownTab === t.key ? '#4df9ed0d' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        borderTop: t.key === 'clients' ? '1px solid #424242' : 'none',
                        marginTop: t.key === 'clients' ? '4px' : '0',
                        paddingTop: t.key === 'clients' ? '8px' : undefined,
                        '&:hover': {
                          bgcolor: dropdownTab === t.key ? '#4df9ed1a' : '#2a2a2a',
                          color: dropdownTab === t.key ? '#4df9ed' : '#ffffff',
                        },
                        '&.Mui-selected': { bgcolor: '#4df9ed0d', '&:hover': { bgcolor: '#4df9ed1a' } },
                      }}
                    >
                      <span style={{ color: dropdownTab === t.key ? '#4df9ed' : '#818181', display: 'flex' }}>
                        <Users size={16} />
                      </span>
                      {t.label}
                      {dropdownTab === t.key && (
                        <span style={{ marginLeft: 'auto', height: '6px', width: '6px', borderRadius: '50%', backgroundColor: '#4df9ed', flexShrink: 0 }} />
                      )}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <div className="relative min-w-0 flex-1 sm:max-w-[360px] 3xl:max-w-[400px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 3xl:size-[18px] -translate-y-1/2 text-[#818181]" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name or email..."
                  className="h-[34px] 3xl:h-[38px] w-full rounded-[10px] border border-[#818181] bg-[#424242] pl-9 3xl:pl-10 pr-4 text-[13px] 3xl:text-[15px] text-white placeholder-[#818181] outline-none transition focus:border-[#4df9ed]"
                />
              </div>
              <RefreshButton iconOnly onClick={handleRefresh} loading={(loading || fetching)} disabled={loading || fetching} />
              <span className="basis-full text-right sm:basis-auto sm:ml-auto text-[10px] 3xl:text-[11px] font-bold text-[#4df9ed] whitespace-nowrap">
                {total} {ACCOUNT_NOUN[activeTab]} Account{total !== 1 ? 's' : ''}
              </span>
            </div>
            )}

            {!isResetsTab && isDriverTab && (
              <div className="flex gap-1 border-b border-[#424242] px-3 sm:px-4 3xl:px-5 shrink-0">
                {DRIVER_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => switchTab(t.key)}
                    className={`-mb-px border-b px-3 py-2 text-[12px] 3xl:text-[14px] font-bold transition ${
                      activeTab === t.key
                        ? 'border-[#4df9ed] text-[#4df9ed]'
                        : 'border-transparent text-[#818181] hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {isResetsTab ? (
              <PasswordResetQueue
                focusRequestId={focusRequestId}
                onPendingCountChange={setResetCount}
                regularData
              />
            ) : (
            <>
            {isDriverTab && licenseFlagCount > 0 && (
              <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-400 shrink-0">
                <AlertTriangle size={14} className="shrink-0" />
                <span>
                  {licenseFlagCount === 1 ? '1 driver has' : `${licenseFlagCount} drivers have`} a license that expires
                  within a month or has expired. Update their license details once it is renewed.
                </span>
                <button
                  onClick={() => { setLicenseOnly((v) => !v); setPage(1) }}
                  className="ml-auto shrink-0 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/15"
                >
                  {licenseOnly ? 'Show all drivers' : 'Show only these'}
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400 shrink-0">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto lg:flex-1 lg:overflow-auto lg:min-h-0">
              {/* Fixed layout: every column, Actions included, gets the same width.
                  Content starts at the left of its column; the row menu sits right. */}
              <table className="w-full max-lg:min-w-[900px] lg:table-fixed">
                {/* Headers in the small-caps face, every cell below in regular Alegreya Sans. */}
                <thead className="sticky top-0 z-10 bg-[#1b1b1b] font-[family-name:var(--font-alegreya-sc)]">
                  <tr className="border-b border-[#424242]">
                    {HEADERS[activeTab].map((h) => (
                      <th key={h} className={`px-4 3xl:px-5 py-2 3xl:py-2.5 text-[11px] 3xl:text-[13px] font-bold lowercase whitespace-nowrap text-left text-[#818181]`}>
                        {h}
                      </th>
                    ))}
                    <th className="px-4 3xl:px-5 py-2 3xl:py-2.5 text-right text-[11px] 3xl:text-[13px] font-bold lowercase text-[#818181]">
                      actions
                    </th>
                  </tr>
                </thead>
                <tbody className="ff-regular max-lg:whitespace-nowrap">
                  {(loading || fetching) ? (
                    <TableSkeleton cols={colCount} />
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={colCount}>
                        <EmptyState tab={activeTab} onAdd={openCreate} canAdd={access.canCreate} />
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence mode="wait">
                      {users.map((user, i) => (
                        <motion.tr
                          key={user.user_id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="border-b border-[#424242] transition-colors hover:bg-[#2a2a2a]/40"
                        >
                          {renderCells(user, activeTab)}
                          {/* The row menu sits at the far right of the table. */}
                          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5 text-right">
                            {activeTab === 'vendor-drivers' ? (
                              <VendorRowMenu
                                user={user as VendorDriverUser}
                                onDone={refetchCurrentTab}
                                onView={() => openEdit(user, true)}
                                onEdit={() => openEdit(user)}
                                lockedBy={userLocks.get(user.user_id)}
                              />
                            ) : (
                              <RowMenu
                                user={user}
                                tab={activeTab}
                                onView={() => openEdit(user, true)}
                                onEdit={() => openEdit(user)}
                                onStatusChange={(s) => handleStatusChange(user, s)}
                                lockedBy={userLocks.get(user.user_id)}
                              />
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && total > 0 && (
              <Pagination page={safePage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={fetching} />
            )}
            </>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <UserFormModal
          tab={formTab}
          user={editUser}
          driverSource={formDriverSource}
          startInView={formViewOnly}
          // Same rule as the row menu: the combined list can't open the edit form.
          canEdit={activeTab !== 'all' && access.canEdit}
          lockedBy={editUser ? userLocks.get(editUser.user_id) : undefined}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false)
            await refetchCurrentTab()
          }}
        />
      )}

      <AccountTypePicker
        open={showTypePicker}
        options={newAccountTypes}
        onPick={createAccount}
        onClose={() => setShowTypePicker(false)}
      />

      <ItAdminTransitionModal
        open={showTransition}
        outgoing={activeITAdmin as AdminUser | null}
        onClose={() => setShowTransition(false)}
        onDone={refetchCurrentTab}
      />
    </ThemeProvider>
  )
}