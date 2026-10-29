'use client'

import ClearFiltersLink from '@/components/ui/ClearFiltersLink'
import Pagination from '@/components/ui/Pagination'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck as ShieldCheckIcon, UserPlus,
  Pencil, Eye, ShieldCheck, ShieldOff, Archive, ArchiveRestore, SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import type {
  UserTab, AnyUser, UserStatus, AdminUser,
} from '@/app/types/admin/user-management.types'
import {
  userService, adminService,
  generalManagerService,
  fleetAdminService, operationsAdminService,
} from '@/lib/services/admin/user-management.service'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { isManagedRole } from '@/constants/modules'
import UserFormModal from '@/app/admin/user-management/UserFormModal'
import UserManagementClient from '@/app/admin/user-management/UserManagementClient'
import { useRecordLocks } from '@/lib/hooks/useRecordLock'
import { RecordLockBadge } from '@/components/ui/RecordLockBanner'
import PermissionsModal from './PermissionsModal'
import AccountTypePicker, { type AccountTypeOption } from '@/components/admin/AccountTypePicker'
import PasswordResetQueue from '@/components/admin/PasswordResetQueue'
import ModuleSectionTabs, { type ModuleSection } from '@/components/admin/ModuleSectionTabs'
import { passwordResetService } from '@/lib/services/admin/password-reset.service'

import FilterBar, { type FilterValues } from '@/components/ui/FilterBar'
import { TableCard } from '@/components/ui/untitled/table-card'
import { Button } from '@/components/ui/untitled/button'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import { UserPlus01 as UserPlusIcon } from '@untitledui/icons'
import StatTiles from '@/components/ui/StatTiles'
import RowActionMenu, { type RowAction } from '@/components/ui/RowActionMenu'
import AccountActionConfirm, { statusConfirmCopy, type AccountConfirm } from '@/components/admin/AccountActionConfirm'
import { useServerTable } from '@/lib/hooks/useServerTable'
type AdminMgmtTab = Extract<
  UserTab,
  'admins' | 'general-managers' | 'fleet-admins' | 'operations-admins'
>
// 'password-resets' is a queue, not a user list, so it renders its own panel and
// skips the fetch/search/paginate machinery below.
// The dropdown below filters the directory by role. Password resets are a queue
// you act on, not a slice of the directory, so they are a top-level section
// instead - see ModuleSectionTabs.
type TabValue = AdminMgmtTab | 'all'

// Kept for the ?tab=password-resets deep-link a reset notification sends.
const RESETS_DEEPLINK = 'password-resets'

const TABS: { key: TabValue; label: string }[] = [
  { key: 'all',                label: 'All Administrators'  },
  { key: 'admins',             label: 'Company Administrators'      },
  { key: 'general-managers',   label: 'General Managers'    },
  { key: 'fleet-admins',       label: 'Fleet Managers'      },
  { key: 'operations-admins',  label: 'Operations Managers' },
]

const NEW_ACCOUNT_TYPES: AccountTypeOption<AdminMgmtTab>[] = [
  { key: 'admins',            label: 'Company Administrator', hint: 'Manages users, bookings and company settings.' },
  { key: 'general-managers',  label: 'General Manager',       hint: 'Approves client bookings.' },
  { key: 'operations-admins', label: 'Operations Manager',    hint: 'Plans trips and assigns the vehicle and driver.' },
  { key: 'fleet-admins',      label: 'Fleet Manager',         hint: 'Looks after vehicles, maintenance and odometer checks.' },
]

// Roles aggregated by the "All Administrators" view and the stats cards.
const ADMIN_ROLE_FILTER = 'admin,general_manager,fleet_manager,operations_manager'

const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4df9ed' },
    background: { paper: '#1b1b1b' },
  },
})

// Rows per page: 10 on a phone, 20 on anything wider (the user's call, 2026-10-25).

async function updateStatus(tab: AdminMgmtTab, id: string, status: UserStatus): Promise<void> {
  const svcMap = {
    admins:              adminService,
    'general-managers':  generalManagerService,
    'fleet-admins':      fleetAdminService,
    'operations-admins': operationsAdminService,
  } as const

  const svc = svcMap[tab]

  if (status === 'active')      return svc.activate(id).then()
  if (status === 'deactivated') return svc.deactivate(id).then()
  if (status === 'archived')    return svc.remove(id)

  return svc.update(id, { status } as never).then()
}

const SERVICE_FOR_TAB = {
  admins:              adminService,
  'general-managers':  generalManagerService,
  'fleet-admins':      fleetAdminService,
  'operations-admins': operationsAdminService,
} as const

// Archived accounts come from /admin/users?status=archived (the per-role lists
// hide them).

// "Status: All" means every status, archived included.
function displayName(u: AnyUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email
}

function tabFromRole(role: string): AdminMgmtTab {
  switch (role) {
    case 'admin':            return 'admins'
    case 'general_manager':  return 'general-managers'
    case 'fleet_manager':      return 'fleet-admins'
    case 'operations_manager': return 'operations-admins'
    default:                 return 'admins'
  }
}

// The table format (Figma 3234:1321): the name bold cyan, the rest bold white,
// headers grey small caps. Spacing and sizes come from .data-table (globals.css).
const TD_NAME   = 't-name'
const TD_MUTED  = ''
const TD_BADGE  = ''




/** Long addresses are cut short with an ellipsis at the edge of their column. */
function EmailText({ value }: { value: string | null | undefined }) {
  return <span title={value ?? undefined} className="block min-w-0 max-lg:max-w-[170px] truncate">{value ?? '—'}</span>
}

const STATUS_CFG: Record<UserStatus, { label: string; cls: string }> = {
  active:             { label: 'Active',      cls: 'bg-[#4df9ed]/[0.24] text-[#4df9ed] border-[#4df9ed]' },
  inactive:           { label: 'Revoked',     cls: 'bg-[#8a38f5]/[0.12] text-[#8a38f5] border-[#8a38f5]' },
  deactivated:        { label: 'Deactivated', cls: 'bg-[#ff7a30]/20 text-[#ff7a30] border-[#ff7a30]'     },
  archived:           { label: 'Archived',    cls: 'bg-[#ffea00]/20 text-[#ffea00] border-[#ffea00]'     },
  permanently_locked: { label: 'Locked',      cls: 'bg-[#f62626]/20 text-[#f62626] border-[#f62626]'     },
}

// The Status dropdown's choices, in the badge order. No Revoked (status 'inactive'): only a vendor
// driver whose app access was revoked is ever Inactive, never a staff account.
const STATUS_OPTIONS = (Object.keys(STATUS_CFG) as UserStatus[])
  .filter((s) => s !== 'inactive')
  .map((s) => ({ value: s, label: STATUS_CFG[s].label }))

// Figma 3234:1321: the role pill is an outline in the role's colour with white
// text (no fill), in the fixed palette.
const ROLE_COLORS: Record<string, string> = {
  admin:              'border-[#3af626]',
  it_admin:           'border-[#4df9ed]',
  general_manager:    'border-[#f62626]',
  fleet_manager:      'border-[#8a38f5]',
  operations_manager: 'border-[#ffea00]',
}

const ROLE_LABELS: Record<string, string> = {
  admin:            'Company Administrator',
  it_admin:         'IT Administrator',
  general_manager:  'General Manager',
  fleet_manager:      'Fleet Manager',
  operations_manager: 'Operations Manager',
}

function StatusBadge({ status }: { status: UserStatus }) {
  const { label, cls } = STATUS_CFG[status] ?? STATUS_CFG.inactive
  return (
    <span className={`t-badge min-w-[62px] 3xl:min-w-[70px] ${cls}`}>
      {label}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const cls   = ROLE_COLORS[role]  ?? 'border-[#818181]'
  const label = ROLE_LABELS[role]  ?? role.replace(/_/g, ' ')
  return (
    <span className={`t-badge text-white ${cls}`}>
      {label}
    </span>
  )
}

interface RowMenuProps {
  user: AnyUser
  tab: TabValue
  onView: () => void
  onEdit: () => void
  onManageAccess: () => void
  onStatusChange: (s: UserStatus) => void
  /** Someone else has this account open for editing: no actions until they finish. */
  lockedBy?: string
}

/** Someone else is editing the account: their name, and View (read-only) still works. */
function LockedRow({ holder, onView }: { holder: string; onView: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <RecordLockBadge holder={holder} />
      <button onClick={onView} title="View Details" aria-label="View Details"
        className="rounded-md p-1.5 text-[#818181] transition [@media(hover:hover)]:hover:bg-[#2a2a2a] [@media(hover:hover)]:hover:text-white">
        <Eye size={15} />
      </button>
    </div>
  )
}

function staffName(u: AnyUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email
}

function RowMenu({ user, tab, onView, onEdit, onManageAccess, onStatusChange, lockedBy }: RowMenuProps) {
  if (lockedBy) return <LockedRow holder={lockedBy} onView={onView} />

  const status: RowAction[] = ([
    { status: 'active'      as UserStatus, label: 'Activate',   icon: <ShieldCheck size={15} />, tone: 'default' as const, description: 'Let them sign in again' },
    { status: 'deactivated' as UserStatus, label: 'Deactivate', icon: <ShieldOff size={15} />,   tone: 'caution' as const, description: 'Sign them out and block sign-in' },
    { status: 'archived'    as UserStatus, label: 'Archive',    icon: <Archive size={15} />,     tone: 'warning' as const, description: 'Remove from the list; can be restored' },
  ]).filter((a) => a.status !== user.status).map((a) => ({
    label: a.label, icon: a.icon, tone: a.tone, section: 'Account', description: a.description,
    onSelect: () => onStatusChange(a.status),
  }))

  const actions: RowAction[] = [
    { label: 'View Details', icon: <Eye size={15} />, onSelect: onView, section: 'Details', description: 'Open the account read-only' },
    ...(tab !== 'all' ? [{ label: 'Edit', icon: <Pencil size={15} />, onSelect: onEdit, section: 'Details', description: 'Change their details' }] : []),
    ...(isManagedRole(user.role)
      ? [{ label: 'Manage Access', icon: <SlidersHorizontal size={15} />, tone: 'accent' as const, onSelect: onManageAccess,
           section: 'Details', description: 'Read Only or Manage All per module' }]
      : []),
    ...status,
  ]
  return <RowActionMenu actions={actions} heading={staffName(user)} subheading={user.email} iconSize={18} />
}

function TableSkeleton({ cols, rows }: { cols: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j}>
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

/** The archived view's row menu: look at the account, or bring it back. */
function ArchivedRowMenu({ user, onView, onRestore, lockedBy }: {
  user:      AnyUser
  onView:    () => void
  onRestore: () => void
  lockedBy?: string
}) {
  if (lockedBy) return <LockedRow holder={lockedBy} onView={onView} />
  const actions: RowAction[] = [
    { label: 'View Details', icon: <Eye size={15} />, onSelect: onView, section: 'Details', description: 'Open the account read-only' },
    { label: 'Restore', icon: <ArchiveRestore size={15} />, tone: 'accent', onSelect: onRestore, section: 'Account', description: 'Bring the account back as Active' },
  ]
  return <RowActionMenu actions={actions} heading={staffName(user)} subheading={user.email} iconSize={18} />
}

function EmptyState({ tab, onAdd, archived = false, filtered, onClear }: { tab: TabValue; onAdd: () => void; archived?: boolean; filtered: boolean; onClear: () => void }) {
  const label = tab === 'all' ? 'administrator accounts' : TABS.find(t => t.key === tab)?.label.toLowerCase() ?? tab
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 rounded-full border border-[#424242] bg-[#1b1b1b] p-4">
        <ShieldCheckIcon size={28} className="text-[#818181]" />
      </div>
      <p className="text-base font-semibold text-white">No records found</p>
      <p className="mt-1 text-sm text-[#818181]">
        {archived ? `No archived ${label}.` : `No ${label} match your current filters.`}
      </p>
      <ClearFiltersLink show={filtered} onClear={onClear} className="mt-4" />
      {tab !== 'all' && !archived && (
        <button
          onClick={onAdd}
          className="mt-6 flex items-center gap-2 rounded-lg bg-[#4df9ed] px-4 py-2 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5]"
        >
          <UserPlus size={14} /> Add First Account
        </button>
      )}
    </div>
  )
}

const SHARED_HEADERS = ['Name', 'Email', 'Phone', 'Role', 'Status']

// Only the user-list tabs have table headers; the resets tab brings its own table.
const HEADERS: Record<TabValue, string[]> = {
  all:                 SHARED_HEADERS,
  admins:              SHARED_HEADERS,
  'general-managers':  SHARED_HEADERS,
  'fleet-admins':      SHARED_HEADERS,
  'operations-admins': SHARED_HEADERS,
}

function renderCells(user: AnyUser) {
  const u = user as AdminUser
  const name = [u.first_name, u.middle_name, u.last_name, u.suffix].filter(Boolean).join(' ') || '—'
  return (
    <>
      <td className={TD_NAME}>{name}</td>
      <td className={TD_MUTED}><EmailText value={u.email} /></td>
      <td className={TD_MUTED}>{u.phone ?? '—'}</td>
      <td className={TD_BADGE}><RoleBadge role={u.role} /></td>
      <td className={TD_BADGE}><StatusBadge status={u.status} /></td>
    </>
  )
}

export default function AdminManagementClient() {
  const searchParams = useSearchParams()
  // A password-reset notification deep-links here as ?tab=password-resets&request=…
  const deepLinkTab    = searchParams.get('tab')
  const focusRequestId = searchParams.get('request')

  const [section,          setSection]          = useState<ModuleSection>(
    deepLinkTab === RESETS_DEEPLINK ? 'password-resets' : 'directory',
  )
  // Opens on All Administrators: every staff account at once.
  const [activeTab,        setActiveTab]        = useState<TabValue>('all')
  const [resetCount,       setResetCount]       = useState(0)
  const [searchInput,      setSearchInput]      = useState('')
  const [search,           setSearch]           = useState('')
  const [stats,            setStats]            = useState({ total: 0, active: 0, archived: 0 })
  const [showForm,         setShowForm]         = useState(false)
  const [editUser,         setEditUser]         = useState<AnyUser | null>(null)
  const [formViewOnly,     setFormViewOnly]     = useState(false)
  const [formTab,          setFormTab]          = useState<AdminMgmtTab>('admins')
  const [showTypePicker,   setShowTypePicker]   = useState(false)
  // The confirm pop-up in front of Activate / Deactivate / Archive / Restore.
  const [confirmAction,    setConfirmAction]    = useState<AccountConfirm | null>(null)
  const [permUser,         setPermUser]         = useState<AnyUser | null>(null)
  const userLocks = useRecordLocks('user')
  // The Status dropdown: one status at a time; none picked is "Status: All", every
  // status including archived. Archived rows get a Restore action.
  const [statusFilter,     setStatusFilter]     = useState<FilterValues>([])
  const statusPick   = statusFilter.find((r) => r.field === 'status')?.value ?? null
  const showArchived = statusPick === 'archived'
  const isResetsTab = section === 'password-resets'
  // Clients & Drivers: the Company Admin's directory in IT Administrator mode
  // (status, restore and vendor passkey access; no add or edit).
  const isPeopleTab = section === 'people'

  // Seeded once on mount so the tab can show a badge before anyone opens it -
  // the panel itself only fetches when mounted, which is too late to tell someone
  // there is work waiting. Best effort: a failure just means no badge.
  const loadResetCount = useCallback(() => {
    passwordResetService.list()
      .then((rows) => setResetCount(rows.filter((r) => r.status === 'pending' || r.status === 'expired').length))
      .catch(() => {})
  }, [])

  useEffect(() => { loadResetCount() }, [loadResetCount])

  useLiveTable(['live:password_resets'], loadResetCount)

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // Server-side pages (10 on phones, 20 from tablet up): the server builds the
  // tab's list, applies the Status pick and the search, and sends one page; the
  // stat tiles are re-read with it. `meta.tab` keeps a response for a tab
  // already left off the screen. The resets panel and Clients & Drivers load
  // their own data.
  const directoryTab = activeTab === 'all' ? 'all-admins' : activeTab
  const table = useServerTable(
    async (q) => {
      const tab = directoryTab
      const [res, statsResult] = await Promise.all([
        userService.getDirectory({
          ...q,
          tab,
          ...(statusPick && { filters: JSON.stringify([{ field: 'status', op: 'is', value: statusPick }]) }),
          ...(search && { search }),
        }),
        userService.getStats(ADMIN_ROLE_FILTER),
      ])
      setStats({ total: statsResult.total, active: statsResult.active, archived: statsResult.archived })
      return { data: res.data, meta: { ...res.meta, tab } }
    },
    `${directoryTab}|${statusPick ?? ''}|${search}`,
    {
      enabled:      !isResetsTab && !isPeopleTab,
      errorMessage: 'Failed to load accounts. Check your connection or permissions.',
    },
  )
  const tableReady = table.meta?.tab === directoryTab
  const loading    = table.loading || !tableReady
  const fetching   = table.fetching
  const error      = table.error
  const { page, setPage, pageSize, total, totalPages } = table
  const users      = tableReady ? table.rows : []

  // Someone else (or the driver app) changed an account: re-read the open tab.
  useLiveTable(['live:users'], () => {
    if (isResetsTab || isPeopleTab) return
    void table.reload(true)
  })

  // A new tab or status starts with an empty search box (page 1 comes with it),
  // reset during render so the old search is never sent with the new tab.
  const viewKey = `${activeTab}|${section}|${statusPick ?? ''}`
  const [lastViewKey, setLastViewKey] = useState(viewKey)
  if (viewKey !== lastViewKey) {
    setLastViewKey(viewKey)
    setSearch('')
    setSearchInput('')
  }

  /** Reload whichever user list is showing. A no-op on the resets panel, which owns its own data. */
  const reloadTable = table.reload
  const refetchCurrentTab = useCallback(async () => {
    if (isResetsTab) return
    await reloadTable()
  }, [isResetsTab, reloadTable])

  function handleStatusChange(user: AnyUser, status: UserStatus) {
    const serviceTab = activeTab === 'all'
      ? tabFromRole(user.role)
      : activeTab
    // Every status change is confirmed in a pop-up first.
    setConfirmAction({
      ...statusConfirmCopy(displayName(user), status),
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
    setConfirmAction({
      title:        `Restore ${displayName(user)}?`,
      description:  'The account comes back as Active and they can sign in again.',
      confirmLabel: 'Restore',
      run: async () => {
        try {
          await appToast.promise(
            SERVICE_FOR_TAB[tabFromRole(user.role)].restore(user.user_id),
            {
              loading: 'Restoring account…',
              success: `${displayName(user)} restored and can sign in again.`,
              error:   (e) => getApiErrorMessage(e, 'Failed to restore the account.'),
            },
            { action: 'restore-user', entityId: user.user_id },
          )
          await refetchCurrentTab()
        } catch { /* handled by toast */ }
      },
    })
  }

  function openEdit(user: AnyUser, viewOnly = false) {
    const tab = activeTab === 'all'
      ? tabFromRole(user.role)
      : activeTab
    setFormTab(tab)
    setEditUser(user)
    setFormViewOnly(viewOnly)
    setShowForm(true)
  }

  // "Create Administrator" asks for the account type first; the form opens once one is picked.
  // Only one General Manager that isn't archived (backend users_one_general_manager):
  // the picker greys the option out while one exists. Read fresh on every opening,
  // and greyed out until that read is back (null), so it can't be picked in the
  // moment before the answer arrives. A failed read leaves it to the server.
  const [hasGeneralManager, setHasGeneralManager] = useState<boolean | null>(null)
  function openCreate() {
    setHasGeneralManager(null)
    setShowTypePicker(true)
    generalManagerService.getAll()
      .then((list) => setHasGeneralManager(list.some((u) => u.status !== 'archived')))
      .catch(() => setHasGeneralManager(false))
  }

  function createAccount(type: AdminMgmtTab) {
    setShowTypePicker(false)
    setFormTab(type)
    setEditUser(null)
    setFormViewOnly(false)
    setShowForm(true)
  }


  const colCount = isResetsTab ? 1 : HEADERS[activeTab].length + 1

  // Staff, then clients and drivers, then the one reset queue for everybody.
  const sectionTabs = (
    <ModuleSectionTabs
      value={section}
      onChange={setSection}
      directoryLabel="Administrators"
      peopleLabel="Clients & Drivers"
      resetsLabel="Password Reset"
      pendingCount={resetCount}
      variant="large"
    />
  )

  if (isPeopleTab) return <UserManagementClient mode="it-admin" sectionTabs={sectionTabs} />

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
        <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 sm:px-4 lg:px-5 3xl:px-6 lg:pt-3 lg:pb-4 3xl:pb-5 gap-3 3xl:gap-4 lg:overflow-hidden">

          {/* Stats (Figma 3234:1321): white small-caps label, the count under it in its colour. */}
          <StatTiles tiles={[
            { label: 'Total Administrators', value: stats.total,    color: 'text-[#3af626]' },
            { label: 'Active',               value: stats.active,   color: 'text-[#4df9ed]' },
            { label: 'Archived',             value: stats.archived, color: 'text-[#ffea00]' },
          ]} />

          {/* Table card */}
          <TableCard.Root className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0">

            {/* Staff, clients and drivers, and the reset queue: three top-level tabs. */}
            {sectionTabs}

            {/* The table format's filter row (Figma 3234:1321): search, the role
                dropdown, Filters (Status), Refresh, and Create Administrator at
                the far right. The reset queue brings its own row. */}
            {!isResetsTab && (
            <FilterBar
              layout="split"
              leading={
                <TabsMinimal
                  label="Administrator role"
                  items={TABS.map((t) => ({ id: t.key, label: t.label }))}
                  selectedKey={activeTab}
                  onSelectionChange={setActiveTab}
                />
              }
              // Names exactly what the server searches (user-directory.service.ts).
              search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search name, email or phone' }}
              // One status at a time, as before; now inside the Filters panel.
              fields={[{ key: 'status', label: 'Status', single: true, options: STATUS_OPTIONS }]}
              values={statusFilter}
              onChange={setStatusFilter}
              trailing={
                <Button size="toolbar" color="accent" iconLeading={UserPlusIcon} onClick={openCreate}>
                  Create Administrator
                </Button>
              }
            />
            )}

            {isResetsTab ? (
              <PasswordResetQueue
                focusRequestId={focusRequestId}
                onPendingCountChange={setResetCount}
                regularData
                cardHeader
              />
            ) : (
            <>
            {error && (
              <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400 shrink-0">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto flex-[1_0_auto] lg:flex-1 lg:overflow-auto lg:min-h-0">
              {/* Fixed layout: every column, Actions included, gets the same width. */}
              <table className="data-table max-lg:min-w-[900px] lg:table-fixed">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {HEADERS[activeTab].map((h) => <th key={h}>{h}</th>)}
                    <th className="text-right">actions</th>
                  </tr>
                </thead>
                <tbody className="max-lg:whitespace-nowrap">
                  {(loading || fetching) ? (
                    <TableSkeleton cols={colCount} rows={pageSize} />
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={colCount}>
                        <EmptyState
                          tab={activeTab} onAdd={openCreate} archived={showArchived}
                          filtered={!!search || statusFilter.length > 0}
                          onClear={() => { setSearchInput(''); setSearch(''); setStatusFilter([]) }}
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
                          className="transition-colors [@media(hover:hover)]:hover:bg-[#2a2a2a]/40"
                        >
                          {renderCells(user)}
                          {/* The row menu sits at the far right of the table. */}
                          <td className="text-right">
                            {user.status === 'archived' ? (
                              <ArchivedRowMenu
                                user={user}
                                onView={() => openEdit(user, true)}
                                onRestore={() => handleRestore(user)}
                                lockedBy={userLocks.get(user.user_id)}
                              />
                            ) : (
                              <RowMenu
                                user={user}
                                tab={activeTab}
                                onView={() => openEdit(user, true)}
                                onEdit={() => openEdit(user)}
                                onManageAccess={() => setPermUser(user)}
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
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} disabled={fetching} />
            )}
            </>
            )}
          </TableCard.Root>
        </div>
      </div>

      {showForm && (
        <UserFormModal
          tab={formTab}
          user={editUser}
          startInView={formViewOnly}
          // Same rule as the row menu: the combined list can't open the edit form.
          canEdit={activeTab !== 'all' && editUser?.status !== 'archived'}
          lockedBy={editUser ? userLocks.get(editUser.user_id) : undefined}
          enablePermissions
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
        options={NEW_ACCOUNT_TYPES.map((t) => t.key !== 'general-managers' || hasGeneralManager === false ? t
          : hasGeneralManager === null
            ? { ...t, disabledReason: 'Checking for an existing General Manager…' }
            : { ...t, disabledReason: 'There is already a General Manager. Archive the current one first.' })}
        onPick={createAccount}
        onClose={() => setShowTypePicker(false)}
      />

      {permUser && (
        <PermissionsModal
          userId={permUser.user_id}
          userName={
            [permUser.first_name, permUser.last_name].filter(Boolean).join(' ') || permUser.email
          }
          onClose={() => setPermUser(null)}
        />
      )}
    </ThemeProvider>
  )
}