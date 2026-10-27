'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import Pagination from '@/components/ui/Pagination'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus,
  Pencil, Eye, ShieldCheck, ShieldOff, Archive,
  AlertTriangle,
  KeyRound, Send, RotateCcw, Flag, ArchiveRestore,
} from 'lucide-react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import type {
  UserTab, AnyUser, UserStatus,
  ClientUser, DriverUser,
} from '@/app/types/admin/user-management.types'
import {
  userService,
  clientService, driverService,
} from '@/lib/services/admin/user-management.service'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import UserFormModal, { type DriverSource } from './UserFormModal'
import AccountTypePicker, { type AccountTypeOption } from '@/components/admin/AccountTypePicker'
import { useRecordLocks } from '@/lib/hooks/useRecordLock'
import { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import { licenseExpiryState, needsLicenseUpdate } from '@/lib/license-expiry'
import { externalDriverService, type VendorDriverUser } from '@/lib/services/admin/external-driver.service'
import { READ_ONLY_HINT, useModuleAccess, writeAccess } from '@/components/layout/ModuleAccess'
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import AccountActionConfirm, { restoreConfirmDescription, statusConfirmCopy, type AccountConfirm, type AccountKind } from '@/components/admin/AccountActionConfirm'

import RefreshButton from '@/components/ui/RefreshButton'
import { TableCard } from '@/components/ui/untitled/table-card'
import { Button } from '@/components/ui/untitled/button'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import { Plus } from '@untitledui/icons'
import FilterBar, {
  allowedValues, matchesFilter, optionsFrom, type FilterField, type FilterValues,
} from '@/components/ui/FilterBar'
import { useTablePageSize } from '@/lib/hooks/useTablePageSize'
// No IT Administrator tab: IT Administrators are the IT Administrator's own
// business, and a new one is only made through their handover (2026-10-25).
type UserMgmtTab = Extract<UserTab, 'clients' | 'drivers'>

/**
 * Who is looking. The Company Administrator adds and edits clients and drivers;
 * since 2026-10-24 the IT Administrator owns their account status (Activate,
 * Deactivate, Archive, Restore), vendor drivers' passkey access, and every
 * password reset. The IT Administrator's "Clients & Drivers" tab is this same
 * table in 'it-admin' mode: status and access actions only, no add or edit.
 */
export type UserManagementMode = 'company-admin' | 'it-admin'
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

const TABS: { key: TabValue; label: string }[] = [
  { key: 'all',        label: 'All Users' },
  { key: 'clients',    label: 'Clients'   },
  { key: 'drivers',    label: 'Drivers'   },
]

type NewAccountType = 'clients' | 'company-driver' | 'vendor-driver'

const NEW_ACCOUNT_TYPES: AccountTypeOption<NewAccountType>[] = [
  { key: 'clients',        label: 'Client',                  hint: 'A company that books deliveries.' },
  { key: 'company-driver', label: 'Company Driver',          hint: '8338 Logistics driver. Signs in with a password.' },
  { key: 'vendor-driver',  label: 'Vendor Driver',           hint: 'Supplied by a vendor. Signs in with a passkey.' },
]

const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4df9ed' },
    background: { paper: '#1b1b1b' },
  },
})

// Rows per page: 10 on a phone, 20 on anything wider (the user's call, 2026-10-25).

async function fetchByTab(tab: DirectoryTab): Promise<AnyUser[]> {
  switch (tab) {
    case 'clients':   return clientService.getAll() as Promise<AnyUser[]>
    case 'drivers':   return driverService.getAll() as Promise<AnyUser[]>
    case 'vendor-drivers': return externalDriverService.list() as Promise<AnyUser[]>
  }
}

// The archived view reads /admin/users?status=archived (the per-role lists hide
// archived accounts). Both driver tabs read the drivers and split on is_external.
const ARCHIVED_ROLE: Record<DirectoryTab, string> = {
  clients:          'client',
  drivers:          'driver',
  'vendor-drivers': 'driver',
}

async function fetchArchivedByTab(tab: DirectoryTab): Promise<AnyUser[]> {
  const { data } = await userService.getAll({ role: ARCHIVED_ROLE[tab], status: 'archived' })
  if (tab === 'drivers')        return data.filter((u) => !(u as DriverUser).drivers?.is_external)
  if (tab === 'vendor-drivers') return data.filter((u) =>  (u as DriverUser).drivers?.is_external)
  return data
}

// "Archived" is one of the Status filter's options. Archived accounts come from
// their own list, so the Status filter decides which lists to read:
//   none: current accounts only (no Status filter, or Archived not in it)
//   only: Archived is the one status picked
//   both: Archived plus some current status, both lists merged
type ArchivedMode = 'none' | 'only' | 'both'

// What an unfiltered list holds. "Status is not Active" means the other current
// statuses: archived accounts only show when Archived is picked by name.
const CURRENT_STATUSES: UserStatus[] = ['active', 'inactive', 'deactivated', 'permanently_locked']

function archivedModeOf(f: FilterValues): ArchivedMode {
  const status = allowedValues(f, 'status', CURRENT_STATUSES)
  if (!status?.includes('archived')) return 'none'
  return status.length === 1 ? 'only' : 'both'
}

async function loadTabRows(tab: DirectoryTab, mode: ArchivedMode): Promise<AnyUser[]> {
  if (mode === 'only') return fetchArchivedByTab(tab)
  if (mode === 'both') return (await Promise.all([fetchByTab(tab), fetchArchivedByTab(tab)])).flat()
  return fetchByTab(tab)
}

/** Company driver, vendor driver or anyone else: what the pop-ups say about passkeys. */
function accountKind(u: AnyUser): AccountKind {
  if (u.role !== 'driver') return 'other'
  return (u as DriverUser).drivers?.is_external ? 'vendor-driver' : 'company-driver'
}

function displayName(u: AnyUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email
}

function serviceForTab(tab: UserMgmtTab) {
  if (tab === 'clients')   return clientService
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
const NAME_TEXT = 'ff-regular text-[13px] 3xl:text-[15px] font-bold text-[#4df9ed]'
const TD_NAME   = `px-4 3xl:px-5 py-2 3xl:py-2.5 ${NAME_TEXT}`
const TD_MUTED  = 'ff-regular px-4 3xl:px-5 py-2 3xl:py-2.5 text-[12px] 3xl:text-[14px] font-bold text-white'




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
  inactive:           { label: 'Revoked',     cls: 'bg-[#818181]/20 text-[#818181] border-[#818181]'     },
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

/** Someone else is editing the account: their name, and View (read-only) still works. */
function LockedRow({ holder, onView }: { holder: string; onView: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <RecordLockBadge holder={holder} />
      <button
        onClick={onView}
        title="View Details"
        aria-label="View Details"
        className="rounded-md p-1.5 text-[#818181] transition [@media(hover:hover)]:hover:bg-[#2a2a2a] [@media(hover:hover)]:hover:text-white"
      >
        <Eye size={15} />
      </button>
    </div>
  )
}

/** Read Only tier: the action shows, disabled, with the hint. */
function gated(allowed: boolean): Pick<RowAction, 'disabled' | 'title'> {
  return allowed ? {} : { disabled: true, title: READ_ONLY_HINT }
}

const STATUS_ACTIONS: { status: UserStatus; label: string; icon: React.ReactNode; tone: RowAction['tone']; description: string }[] = [
  { status: 'active',      label: 'Activate',   icon: <ShieldCheck size={15} />, tone: 'default', description: 'Let them sign in again' },
  { status: 'deactivated', label: 'Deactivate', icon: <ShieldOff size={15} />,   tone: 'caution', description: 'Sign them out and block sign-in' },
  { status: 'archived',    label: 'Archive',    icon: <Archive size={15} />,     tone: 'warning', description: 'Remove from the list; can be restored' },
]

interface RowMenuProps {
  user: AnyUser
  mode: UserManagementMode
  onView: () => void
  onEdit: () => void
  onStatusChange: (s: UserStatus) => void
  /** Someone else has this account open for editing: no actions until they finish. */
  lockedBy?: string
}

function RowMenu({ user, mode, onView, onEdit, onStatusChange, lockedBy }: RowMenuProps) {
  const access = useModuleAccess()
  const itMode = mode === 'it-admin'
  if (lockedBy) return <LockedRow holder={lockedBy} onView={onView} />

  // A client's or driver's account status is the IT Administrator's to change.
  // Activate/deactivate is an edit, archive needs Manage All; the IT Administrator
  // is never limited by a tier.
  const statusAllowed = (s: UserStatus) => itMode || (s === 'archived' ? access.canDelete : access.canEdit)

  const actions: RowAction[] = [
    { label: 'View Details', icon: <Eye size={15} />, onSelect: onView, section: 'Details', description: 'Open the account read-only' },
    ...(!itMode
      ? [{ label: 'Edit', icon: <Pencil size={15} />, onSelect: onEdit, section: 'Details', description: 'Change their details', ...gated(access.canEdit) }]
      : []),
    ...(itMode
      ? STATUS_ACTIONS.filter((a) => a.status !== user.status).map((a) => ({
          label: a.label, icon: a.icon, tone: a.tone, section: 'Account', description: a.description,
          onSelect: () => onStatusChange(a.status), ...gated(statusAllowed(a.status)),
        }))
      : []),
  ]
  return <RowActionMenu actions={actions} heading={displayName(user)} subheading={user.email} iconSize={18} />
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
 * picks a vendor crew next knows to ask the IT Administrator to restore access.
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

/** The archived view's row menu: look at the account, or bring it back. */
function ArchivedRowMenu({ user, mode, onView, onRestore, lockedBy }: {
  user:      AnyUser
  mode:      UserManagementMode
  onView:    () => void
  onRestore: () => void
  lockedBy?: string
}) {
  // Restoring undoes an archive, so it needs the same "All" tier archiving does.
  // Like archiving, a client or driver is restored by the IT Administrator.
  const { canDelete } = useModuleAccess()
  const itMode = mode === 'it-admin'
  if (lockedBy) return <LockedRow holder={lockedBy} onView={onView} />

  const actions: RowAction[] = [
    { label: 'View Details', icon: <Eye size={15} />, onSelect: onView, section: 'Details', description: 'Open the account read-only' },
    ...(itMode
      ? [{ label: 'Restore', icon: <ArchiveRestore size={15} />, tone: 'accent' as const, onSelect: onRestore,
           section: 'Account', description: 'Bring the account back as Active', ...gated(itMode || canDelete) }]
      : []),
  ]
  return <RowActionMenu actions={actions} heading={displayName(user)} subheading={user.email} iconSize={18} />
}

/**
 * Actions for a vendor driver: the shared view/edit form, plus the access actions
 * a passkey-only account needs instead of a password reset.
 */
function VendorRowMenu({ user, mode, onDone, onView, onEdit, confirm, lockedBy }: {
  user:      VendorDriverUser
  mode:      UserManagementMode
  /** Opens the page's confirm pop-up; the action runs only once it is confirmed. */
  confirm:   (action: AccountConfirm) => void
  onDone:    () => Promise<void> | void
  onView:    () => void
  onEdit:    () => void
  lockedBy?: string
}) {
  const { canEdit } = useModuleAccess()
  // Passkey access (re-invite, revoke, restore) is the IT Administrator's;
  // editing the driver's details stays with the Company Administrator.
  const itMode = mode === 'it-admin'
  if (lockedBy) return <LockedRow holder={lockedBy} onView={onView} />

  const run = async (work: Promise<unknown>, loading: string, success: string, fallback: string) => {
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

  const revoke = () => confirm({
    title:        `Revoke ${displayName(user)}'s app access?`,
    description:  'Their passkeys stop working immediately and they are signed out. ' +
                  'You can restore access later; they will need to set up sign-in again.',
    confirmLabel: 'Revoke Access',
    run: () => run(
      externalDriverService.revoke(user.user_id),
      'Revoking access…', 'Access revoked.', 'Could not revoke access.',
    ),
  })

  const restore = () => confirm({
    title:        `Restore ${displayName(user)}'s app access?`,
    description:  'Their account is turned back on and a new setup link is emailed to them.',
    confirmLabel: 'Restore Access',
    run: () => run(
      externalDriverService.restore(user.user_id),
      'Restoring access…', 'Access restored. A new setup link was sent.', 'Could not restore access.',
    ),
  })

  const accessActions: RowAction[] = !itMode || !user.access ? [] : user.access.account_active
    ? [
        { label: 'Resend Setup Link', icon: <Send size={15} />, onSelect: () => void resend(), section: 'App access', description: 'Email a new passkey setup link' },
        { label: 'Revoke Access', icon: <ShieldOff size={15} />, tone: 'danger', onSelect: revoke, section: 'App access', description: 'End their passkeys and sign them out' },
      ]
    : [
        { label: 'Restore Access', icon: <RotateCcw size={15} />, tone: 'accent', onSelect: restore, section: 'App access', description: 'Turn access back on with a new setup link' },
      ]

  const actions: RowAction[] = [
    { label: 'View Details', icon: <Eye size={15} />, onSelect: onView, section: 'Details', description: 'Open the driver read-only' },
    ...(!itMode
      ? [{ label: 'Edit Details', icon: <Pencil size={15} />, onSelect: onEdit, section: 'Details', description: 'Change their details', ...gated(canEdit) }]
      : []),
    ...accessActions,
  ]
  return <RowActionMenu actions={actions} heading={displayName(user)} subheading={user.drivers?.vendor_name || user.email} iconSize={18} />
}

function TableSkeleton({ cols, rows }: { cols: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
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

function EmptyState({ tab, onAdd, showAdd, canAdd, archived = false, filtered, onClear }: { tab: TabValue; onAdd: () => void; showAdd: boolean; canAdd: boolean; archived?: boolean; filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 rounded-full border border-[#424242] bg-[#1b1b1b] p-4">
        <Users size={28} className="text-[#818181]" />
      </div>
      <p className="text-base font-semibold text-white">No records found</p>
      <p className="mt-1 text-sm text-[#818181]">
        {archived
          ? `No archived ${tab === 'all' ? 'users' : ACCOUNT_NOUN[tab].toLowerCase() + 's'}.`
          : tab === 'vendor-drivers'
          ? 'No vendor drivers yet. Add one here, then pick them in Booking Management for a vendor-supplied delivery.'
          : `No ${tab === 'all' ? 'users' : tab} match your current filters.`}
      </p>
      <ClearFiltersLink show={filtered} onClear={onClear} className="mt-4" />
      {tab !== 'all' && showAdd && !archived && (
        <button
          onClick={onAdd}
          {...writeAccess(canAdd)}
          className="mt-6 flex items-center gap-2 rounded-lg bg-[#4df9ed] px-4 py-2 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#4df9ed]"
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
  }
}

// What the count beside the search bar calls a row: "2 Client Accounts".
const ACCOUNT_NOUN: Record<TabValue, string> = {
  all:              'User',
  clients:          'Client',
  drivers:          'Company Driver',
  'vendor-drivers': 'Vendor Driver',
}

// The resets panel brings its own table, so only the directory tabs are here.
const HEADERS: Record<TabValue, string[]> = {
  all:         ['Name', 'Email', 'Phone', 'Role', 'Status'],
  clients:     ['Name', 'Email', 'Company', 'Status', 'Last Login'],
  drivers:     ['Name', 'License #', 'Expiry', 'Driver Status', 'Acct. Status'],
  'vendor-drivers': ['Name', 'Vendor', 'Email', 'Expiry', 'App Access', 'Acct. Status'],
}

// The Filters panel. Archived is a status like the rest (see ArchivedMode).
const STATUS_OPTIONS = ([...CURRENT_STATUSES, 'archived'] as UserStatus[])
  .map((s) => ({ value: s, label: STATUS_CFG[s].label }))

const LICENSE_OPTIONS = [
  { value: 'attention', label: 'Expiring or expired' },
  { value: 'ok',        label: 'In date' },
]

const ACCESS_OPTIONS = [
  { value: 'enrolled',   label: 'Passkey set up' },
  { value: 'invited',    label: 'Setup link sent' },
  { value: 'not_set_up', label: 'Not set up' },
  { value: 'revoked',    label: 'Revoked' },
]

/** The same states AccessBadge draws, as filter values. */
function accessState(access: VendorDriverUser['access'] | undefined): string | null {
  if (!access) return null
  if (!access.account_active) return 'revoked'
  if (access.enrolled)        return 'enrolled'
  return access.invite_pending ? 'invited' : 'not_set_up'
}

/** "on_trip" → "On Trip". */
function humanize(v: string): string {
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Company, vendor and driver-status choices come from the accounts loaded. */
function filterFields(tab: TabValue, rows: AnyUser[], archivedOnly: boolean): FilterField[] {
  // Only a vendor driver whose app access was revoked is ever Inactive (shown as Revoked), so the
  // option is offered only where vendor drivers are listed.
  const statusOptions = tab === 'vendor-drivers' || tab === 'all'
    ? STATUS_OPTIONS
    : STATUS_OPTIONS.filter((o) => o.value !== 'inactive')
  const status: FilterField[] = [{ key: 'status', label: 'Account Status', options: statusOptions }]
  const license: FilterField = { key: 'license', label: 'License', options: LICENSE_OPTIONS }
  switch (tab) {
    case 'all':
      return [
        { key: 'role', label: 'Role', options: [{ value: 'client', label: 'Client' }, { value: 'driver', label: 'Driver' }] },
        ...status,
      ]
    case 'clients':
      return [...status, { key: 'company', label: 'Company', options: optionsFrom(rows.map((u) => (u as ClientUser).clients?.company_name)) }]
    case 'drivers':
      return [
        ...status,
        { key: 'driver_status', label: 'Driver Status', options: optionsFrom(rows.map((u) => (u as DriverUser).drivers?.status), humanize) },
        license,
      ]
    case 'vendor-drivers':
      return [
        ...status,
        { key: 'vendor', label: 'Vendor', options: optionsFrom(rows.map((u) => (u as VendorDriverUser).drivers?.vendor_name)) },
        ...(archivedOnly ? [] : [{ key: 'access', label: 'App Access', options: ACCESS_OPTIONS }]),
        license,
      ]
  }
}

/** The client-side half of the filters. The All tab filters on the server instead. */
function matchesFilters(u: AnyUser, tab: DirectoryTab, f: FilterValues): boolean {
  if (!matchesFilter(f, 'status', u.status)) return false
  if (tab === 'clients') return matchesFilter(f, 'company', (u as ClientUser).clients?.company_name)
  if (tab === 'drivers' || tab === 'vendor-drivers') {
    const d = (u as VendorDriverUser).drivers
    if (!matchesFilter(f, 'license', needsLicenseUpdate(d?.license_expiry) ? 'attention' : 'ok')) return false
    if (tab === 'drivers') return matchesFilter(f, 'driver_status', d?.status)
    return matchesFilter(f, 'vendor', d?.vendor_name) && matchesFilter(f, 'access', accessState((u as VendorDriverUser).access))
  }
  return true
}

export default function UserManagementClient({ mode = 'company-admin', sectionTabs }: {
  mode?:        UserManagementMode
  /** The IT Admin page's own section tabs, drawn where this page's would be. */
  sectionTabs?: ReactNode
}) {
  const itMode = mode === 'it-admin'
  // The IT Administrator's staff live on their own tab of their page.
  const tabs = TABS

  // Opens on All Users: every client and driver account at once.
  const [activeTab,        setActiveTab]        = useState<TabValue>('all')
  const [allRows,          setAllRows]          = useState<AnyUser[]>([])
  const [loading,          setLoading]          = useState(true)
  const [fetching,         setFetching]         = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [searchInput,      setSearchInput]      = useState('')
  const [search,           setSearch]           = useState('')
  const [page,             setPage]             = useState(1)
  const pageSize = useTablePageSize()
  // The Filters panel's applied values. They belong to the tab (and view) they
  // were set on, so switching either clears them.
  const [filters,          setFilters]          = useState<FilterValues>([])
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const [stats,            setStats]            = useState({ total: 0, active: 0, archived: 0 })
  const [showForm,         setShowForm]         = useState(false)
  const [editUser,         setEditUser]         = useState<AnyUser | null>(null)
  const [formViewOnly,     setFormViewOnly]     = useState(false)
  const userLocks = useRecordLocks('user')
  const [formTab,          setFormTab]          = useState<UserMgmtTab>('clients')
  const [formDriverSource, setFormDriverSource] = useState<DriverSource>('company')
  const [showTypePicker,   setShowTypePicker]   = useState(false)
  // The confirm pop-up in front of Activate / Deactivate / Archive / Restore / Revoke.
  const [confirmAction,    setConfirmAction]    = useState<AccountConfirm | null>(null)
  // Archived accounts are picked in the Status filter; their rows get a Restore action.
  // "Status: All" means every status, archived included.
  const archivedMode: ArchivedMode = !filters.some((r) => r.field === 'status') ? 'both' : archivedModeOf(filters)
  const archivedRef = useRef(archivedMode)
  archivedRef.current = archivedMode
  // Only archived accounts on screen: the old "Archived view" wording and rules.
  const showArchived = archivedMode === 'only'

  // This module's tier for a managed role: Read Only disables every write control.
  const access = useModuleAccess()

  // Both driver tabs sit under the one "Drivers" entry in the role dropdown.
  const isDriverTab    = activeTab === 'drivers' || activeTab === 'vendor-drivers'
  const dropdownTab: TabValue = isDriverTab ? 'drivers' : activeTab

  const isInitialAllFetch = useRef(true)

  // Drop the old tab's rows in the same render that switches the tab. Leaving it
  // to the fetch effect is one render too late: that render draws the previous
  // tab's rows with the new tab's cells — company drivers through the vendor
  // columns, which read an `access` field they don't have.
  const switchTab = useCallback((tab: TabValue) => {
    if (tab === activeTab) return
    setAllRows([])
    setLoading(true)
    setFilters([])
    setActiveTab(tab)
  }, [activeTab])


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
    const archived = archivedRef.current
    // This list is paged on the server, so its filters go there too.
    const role   = allowedValues(filtersRef.current, 'role', ['client', 'driver'])
    const status = allowedValues(filtersRef.current, 'status', CURRENT_STATUSES)
      ?? [...CURRENT_STATUSES, 'archived']
    try {
      const [result, statsResult] = await Promise.all([
        userService.getAll({
          search: searchQuery || undefined,
          role:   role?.length ? role.join(',') : 'client,driver',
          // The API takes Archived in the same comma list.
          status: status?.length ? status.join(',') : undefined,
        }),
        userService.getStats('client,driver'),
      ])
      // Left the All tab (or switched archived view) while this was in flight: its rows don't belong here.
      if (currentTabRef.current !== 'all' || archivedRef.current !== archived) return
      setAllRows(result.data)
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
    const archived = archivedRef.current
    try {
      const [rows, statsResult] = await Promise.all([
        loadTabRows(tab, archived),
        userService.getStats('client,driver')
      ])
      if (currentTabRef.current !== tab || archivedRef.current !== archived) return
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
    if (activeTab === 'all') void fetchAllUsers(search, false, true)
    else void fetchTabUsers(activeTab, true)
  })

  // Picking or dropping Archived changes which lists a tab reads. The All tab
  // re-reads on any filter change already (allTabFilterKey).
  const tabArchivedKey = activeTab === 'all' ? '' : archivedMode

  useEffect(() => {
    isInitialAllFetch.current = true
    setPage(1)
    setSearch('')
    setSearchInput('')
    if (activeTab === 'all') fetchAllUsers('', true)
    else fetchTabUsers(activeTab)
  }, [activeTab, tabArchivedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // The All tab re-reads from the server when its filters change.
  const allTabFilterKey = activeTab === 'all' ? JSON.stringify(filters) : ''

  useEffect(() => {
    if (activeTab !== 'all') return
    if (isInitialAllFetch.current) { isInitialAllFetch.current = false; return }
    fetchAllUsers(search, false)
  }, [search, allTabFilterKey, activeTab, fetchAllUsers])

  /** Reload whichever user list is showing. */
  const refetchCurrentTab = useCallback(async () => {
    if (activeTab === 'all') await fetchAllUsers(search, false)
    else await fetchTabUsers(activeTab)
  }, [activeTab, search, fetchAllUsers, fetchTabUsers])

  // Counted over the whole roster, not the current page or search, so the notice
  // never undercounts.
  const licenseFlagCount = isDriverTab
    ? allRows.filter((u) => needsLicenseUpdate((u as DriverUser).drivers?.license_expiry)).length
    : 0

  // Both pages filter by account status only, in Untitled UI's dropdowns filter
  // bar (the user's call, 2026-10-25). One status at a time, read "Status:
  // Active"; "All" means every status, archived included.
  const filterDefs = filterFields(activeTab, allRows, showArchived)
    .filter((f) => f.key === 'status')
    .map((f) => ({ ...f, label: 'Status', single: true }))
  const licenseOnly = matchesFilter(filters, 'license', 'attention') && !matchesFilter(filters, 'license', 'ok')

  const applyFilters = (next: FilterValues) => {
    setFilters(next)
    setPage(1)
  }

  const filtered = activeTab === 'all'
    ? allRows
    : allRows.filter((u) => {
        if (!matchesFilters(u, activeTab, filters)) return false
        if (!search) return true
        const q = search.toLowerCase()
        return (
          u.email?.toLowerCase().includes(q) ||
          u.first_name?.toLowerCase().includes(q) ||
          u.last_name?.toLowerCase().includes(q)
        )
      })

  // The API returns the whole list on every tab (All included), so every view
  // is cut into pages here. All used to show the full list on every page.
  const total      = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage   = Math.min(page, totalPages)
  const users      = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  function handleStatusChange(user: AnyUser, status: UserStatus) {
    const serviceTab = activeTab === 'clients' || activeTab === 'drivers'
      ? activeTab
      : tabFromRole(user.role)
    // Every status change is confirmed in a pop-up first.
    setConfirmAction({
      ...statusConfirmCopy(displayName(user), status, accountKind(user)),
      run: async () => {
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
      },
    })
  }

  function handleRestore(user: AnyUser) {
    const vendor = !!(user as DriverUser).drivers?.is_external
    setConfirmAction({
      title:        `Restore ${displayName(user)}?`,
      description:  restoreConfirmDescription(accountKind(user)),
      confirmLabel: 'Restore',
      run: async () => {
        try {
          await appToast.promise(
            Promise.resolve<unknown>(serviceForTab(tabFromRole(user.role)).restore(user.user_id)),
            {
              loading: 'Restoring account…',
              success: vendor
                ? `${displayName(user)} restored. Send a new setup link from Vendor Drivers so they can sign in.`
                : `${displayName(user)} restored and can sign in again.`,
              error:   (e) => getApiErrorMessage(e, 'Failed to restore the account.'),
            },
            { action: 'restore-user', entityId: user.user_id },
          )
          await refetchCurrentTab()
        } catch { /* handled by toast */ }
      },
    })
  }

  async function openEdit(user: AnyUser, viewOnly = false) {
    const tab = activeTab === 'clients' || activeTab === 'drivers'
      ? activeTab
      : tabFromRole(user.role)
    // The All Users rows are bare accounts, without the client's company or the
    // driver's license and vendor details the form is filled from. Editing one
    // as is would save those fields blank, so read the full record first.
    let record = user
    if (activeTab === 'all' && !viewOnly) {
      try {
        record = tab === 'drivers' ? await driverService.getOne(user.user_id) : await clientService.getOne(user.user_id)
      } catch (e) {
        appToast.error(getApiErrorMessage(e, 'Could not open this account for editing.'))
        return
      }
    }
    setFormTab(tab)
    setEditUser(record)
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

  const newAccountTypes = itMode ? [] : NEW_ACCOUNT_TYPES

  function handleRefresh() {
    void refetchCurrentTab()
  }

  const colCount = HEADERS[activeTab].length + 1

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
        <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 sm:px-4 lg:px-5 3xl:px-6 lg:pt-3 lg:pb-4 3xl:pb-5 gap-3 3xl:gap-4 lg:overflow-hidden">

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
          <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">

            {/* The IT Administrator's page passes its section tabs. The Company
                Administrator's has no other section since password resets moved
                to the IT Administrator (2026-10-24), so no tab row at all. */}
            {sectionTabs}

            {/* Untitled UI's TableCard.Header from the "No vendors found" table
                (components/ui/untitled): title and count badge, the add
                button on the right. On the IT Admin tab there is nothing to add:
                the IT Administrator hands the role over from their own portal. */}
            <TableCard.Header
              className="shrink-0"
              title={`${ACCOUNT_NOUN[activeTab]}s`}
              contentTrailing={!itMode && (
                <Button size="sm" iconLeading={Plus} onClick={openCreate} {...writeAccess(access.canCreate)} className="max-md:w-full">
                  Add User
                </Button>
              )}
            />

            {/* Untitled UI's filter row from the same table: tabs on the left
                (which list), search with Ctrl/⌘ K, Filters (Archived is a status
                there) and Refresh on the right. */}
            <FilterBar
              layout="split"
              search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search' }}
              fields={filterDefs}
              values={filters}
              onChange={applyFilters}
              actions={<RefreshButton iconOnly onClick={handleRefresh} loading={(loading || fetching)} disabled={loading || fetching} />}
              leading={
                <TabsMinimal
                  label="Accounts"
                  items={tabs.map((t) => ({ id: t.key, label: t.label }))}
                  selectedKey={dropdownTab}
                  onSelectionChange={switchTab}
                />
              }
            />

            {isDriverTab && (
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

            {isDriverTab && !showArchived && licenseFlagCount > 0 && (
              <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-400 shrink-0">
                <AlertTriangle size={14} className="shrink-0" />
                <span>
                  {licenseFlagCount === 1 ? '1 driver has' : `${licenseFlagCount} drivers have`} a license that expires
                  within a month or has expired. Update their license details once it is renewed.
                </span>
                {/* Sets the same License filter the Filters panel does. */}
                <button
                  onClick={() => {
                    const rest = filters.filter((r) => r.field !== 'license')
                    applyFilters(licenseOnly ? rest : [...rest, { field: 'license', op: 'is', value: 'attention' }])
                  }}
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
            <div className="overflow-x-auto flex-[1_0_auto] lg:flex-1 lg:overflow-auto lg:min-h-0">
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
                    <TableSkeleton cols={colCount} rows={pageSize} />
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={colCount}>
                        <EmptyState
                          tab={activeTab} onAdd={openCreate} showAdd={!itMode} canAdd={access.canCreate} archived={showArchived}
                          // The tab picks which list (and its columns), so it stays.
                          filtered={!!search || filters.length > 0}
                          onClear={() => { setSearchInput(''); setSearch(''); applyFilters([]) }}
                        />
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
                            {user.status === 'archived' ? (
                              <ArchivedRowMenu
                                user={user}
                                mode={mode}
                                onView={() => openEdit(user, true)}
                                onRestore={() => handleRestore(user)}
                                lockedBy={userLocks.get(user.user_id)}
                              />
                            ) : activeTab === 'vendor-drivers' ? (
                              <VendorRowMenu
                                user={user as VendorDriverUser}
                                mode={mode}
                                confirm={setConfirmAction}
                                onDone={refetchCurrentTab}
                                onView={() => openEdit(user, true)}
                                onEdit={() => openEdit(user)}
                                lockedBy={userLocks.get(user.user_id)}
                              />
                            ) : (
                              <RowMenu
                                user={user}
                                mode={mode}
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
              <Pagination page={safePage} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} disabled={fetching} />
            )}
          </TableCard.Root>
        </div>
      </div>

      {showForm && (
        <UserFormModal
          tab={formTab}
          user={editUser}
          driverSource={formDriverSource}
          startInView={formViewOnly}
          // Same rule as the row menu: the IT Administrator views only, and Read
          // Only sees it disabled. From All Users, only a record opened with Edit
          // (read in full by openEdit) can switch to editing; View has the bare row.
          canEdit={!itMode && (activeTab !== 'all' || !formViewOnly) && editUser?.status !== 'archived'}
          editDisabled={!access.canEdit}
          lockedBy={editUser ? userLocks.get(editUser.user_id) : undefined}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false)
            await refetchCurrentTab()
          }}
        />
      )}

      <AccountActionConfirm pending={confirmAction} onClose={() => setConfirmAction(null)} />

      <AccountTypePicker
        open={showTypePicker}
        options={newAccountTypes}
        onPick={createAccount}
        onClose={() => setShowTypePicker(false)}
      />
    </ThemeProvider>
  )
}