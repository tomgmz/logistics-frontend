'use client'

import Pagination from '@/components/ui/Pagination'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck as ShieldCheckIcon, UserPlus, UserRoundPlus, Search, MoreVertical, ChevronDown,
  Pencil, Eye, ShieldCheck, ShieldOff, Archive, ArchiveRestore, SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
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

import RefreshButton from '@/components/ui/RefreshButton'
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

const PAGE_SIZE = 10

async function fetchByTab(tab: AdminMgmtTab): Promise<AnyUser[]> {
  switch (tab) {
    case 'admins':            return adminService.getAll()           as Promise<AnyUser[]>
    case 'general-managers':  return generalManagerService.getAll()  as Promise<AnyUser[]>
    case 'fleet-admins':      return fleetAdminService.getAll()      as Promise<AnyUser[]>
    case 'operations-admins': return operationsAdminService.getAll() as Promise<AnyUser[]>
  }
}

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

// The archived view reads /admin/users?status=archived (the per-role lists hide
// archived accounts).
const ARCHIVED_ROLE: Record<AdminMgmtTab, string> = {
  admins:              'admin',
  'general-managers':  'general_manager',
  'fleet-admins':      'fleet_manager',
  'operations-admins': 'operations_manager',
}

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

// Same look as User Management (Figma 3156:400): names in regular Alegreya Sans
// bold cyan, the rest bold white, headers grey small caps.
// MUI sx has no 3xl; this is the same 1920px step.
const FIGMA_MQ = '@media (min-width: 1920px)'
const REGULAR_FONT = "var(--font-alegreya), 'Alegreya Sans', sans-serif"
const NAME_TEXT = 'ff-regular text-[13px] 3xl:text-[15px] font-bold text-[#4df9ed]'
const TD_NAME   = `px-4 3xl:px-5 py-2 3xl:py-2.5 ${NAME_TEXT}`
const TD_MUTED  = 'ff-regular px-4 3xl:px-5 py-2 3xl:py-2.5 text-[12px] 3xl:text-[14px] font-bold text-white'
const TD_BADGE  = 'px-4 3xl:px-5 py-2 3xl:py-2.5'

// The page-header action: cyan outline. The Figma's exact sizes apply from 3xl
// (1920px) up; below that everything is compact.
const HEADER_BTN =
  'flex h-8 3xl:h-9 shrink-0 items-center gap-2 whitespace-nowrap max-sm:w-full max-sm:justify-center rounded-[10px] border border-[#4df9ed] bg-[#4df9ed]/[0.19] ' +
  'px-3 3xl:px-4 text-[13px] 3xl:text-[15px] text-[#4df9ed] transition hover:bg-[#4df9ed]/30 active:scale-95'
const HEADER_ICON = 'size-4 3xl:size-[18px]'



/** Long addresses are cut short with an ellipsis at the edge of their column. */
function EmailText({ value }: { value: string | null | undefined }) {
  return <span title={value ?? undefined} className="block min-w-0 max-lg:max-w-[170px] truncate">{value ?? '—'}</span>
}

const STATUS_CFG: Record<UserStatus, { label: string; cls: string }> = {
  active:             { label: 'Active',      cls: 'bg-[#4df9ed]/[0.24] text-[#4df9ed] border-[#4df9ed]' },
  inactive:           { label: 'Inactive',    cls: 'bg-[#818181]/20 text-[#818181] border-[#818181]'     },
  deactivated:        { label: 'Deactivated', cls: 'bg-[#ff7a30]/20 text-[#ff7a30] border-[#ff7a30]'     },
  archived:           { label: 'Archived',    cls: 'bg-[#ffea00]/20 text-[#ffea00] border-[#ffea00]'     },
  permanently_locked: { label: 'Locked',      cls: 'bg-[#f62626]/20 text-[#f62626] border-[#f62626]'     },
}

// Same Figma badge as the status column, in the fixed palette.
const ROLE_COLORS: Record<string, string> = {
  admin:              'bg-[#f62626]/20 text-[#f62626] border-[#f62626]',
  it_admin:           'bg-[#3af626]/20 text-[#3af626] border-[#3af626]',
  general_manager:    'bg-[#4df9ed]/[0.24] text-[#4df9ed] border-[#4df9ed]',
  fleet_manager:      'bg-[#ff7a30]/20 text-[#ff7a30] border-[#ff7a30]',
  operations_manager: 'bg-[#8a38f5]/20 text-[#8a38f5] border-[#8a38f5]',
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
    <span className={`font-[family-name:var(--font-alegreya-sc)] inline-flex h-5 min-w-[58px] 3xl:h-[22px] 3xl:min-w-[64px] items-center justify-center whitespace-nowrap rounded-[15px] border-[0.5px] px-1.5 pb-0.5 text-[11px] 3xl:text-[13px] font-bold ${cls}`}>
      {label}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const cls   = ROLE_COLORS[role]  ?? 'bg-[#818181]/20 text-[#818181] border-[#818181]'
  const label = ROLE_LABELS[role]  ?? role.replace(/_/g, ' ')
  return (
    <span className={`font-[family-name:var(--font-alegreya-sc)] inline-flex h-5 3xl:h-[22px] items-center justify-center whitespace-nowrap rounded-[15px] border-[0.5px] px-2 pb-0.5 text-[11px] 3xl:text-[13px] font-bold ${cls}`}>
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

function RowMenu({ user, tab, onView, onEdit, onManageAccess, onStatusChange, lockedBy }: RowMenuProps) {
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

  const canEdit = tab !== 'all'
  const canManageAccess = isManagedRole(user.role)

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
            {canManageAccess && (
              <button
                onClick={() => { setOpen(false); onManageAccess() }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-[#4df9ed] transition hover:bg-[#4df9ed]/10"
              >
                <SlidersHorizontal size={13} /> Manage Access
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

/** The archived view's row menu: look at the account, or bring it back. */
function ArchivedRowMenu({ onView, onRestore, lockedBy }: {
  onView:    () => void
  onRestore: () => void
  lockedBy?: string
}) {
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
      <div className="flex items-center justify-end gap-1.5">
        <RecordLockBadge holder={lockedBy} />
        <button onClick={onView} title="View Details" className="rounded-md p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white">
          <Eye size={15} />
        </button>
      </div>
    )
  }

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
            className="absolute right-0 top-8 z-50 w-48 rounded-xl border border-[#424242] bg-[#1b1b1b] py-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => { setOpen(false); onView() }} className={`${item} text-[#818181] hover:bg-[#2a2a2a] hover:text-white`}>
              <Eye size={13} /> View Details
            </button>
            <div className="my-1 border-t border-[#424242]" />
            <button onClick={() => { setOpen(false); onRestore() }} className={`${item} text-[#4df9ed] hover:bg-[#4df9ed]/10`}>
              <ArchiveRestore size={13} /> Restore
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Shows the archived accounts instead of the current ones. */
function ArchivedToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={on ? 'Back to the current accounts' : 'Show archived accounts'}
      className={`flex h-[34px] 3xl:h-[38px] items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-[13px] 3xl:text-[15px] transition ${
        on ? 'border-[#ffea00] bg-[#ffea00]/[0.15] text-[#ffea00]' : 'border-[#818181] bg-[#424242] text-[#818181] hover:text-white'
      }`}
    >
      <Archive className="size-4" /> Archived
    </button>
  )
}

function EmptyState({ tab, onAdd, archived = false }: { tab: TabValue; onAdd: () => void; archived?: boolean }) {
  const label = tab === 'all' ? 'staff accounts' : TABS.find(t => t.key === tab)?.label.toLowerCase() ?? tab
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 rounded-full border border-[#424242] bg-[#1b1b1b] p-4">
        <ShieldCheckIcon size={28} className="text-[#818181]" />
      </div>
      <p className="text-base font-semibold text-white">No records found</p>
      <p className="mt-1 text-sm text-[#818181]">
        {archived ? `No archived ${label}.` : `No ${label} match your current filters.`}
      </p>
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

// What the count beside the search bar calls a row: "2 Fleet Manager Accounts".
const ACCOUNT_NOUN: Record<TabValue, string> = {
  all:                 'Administrator',
  admins:              'Company Administrator',
  'general-managers':  'General Manager',
  'fleet-admins':      'Fleet Manager',
  'operations-admins': 'Operations Manager',
}

export default function AdminManagementClient() {
  const searchParams = useSearchParams()
  // A password-reset notification deep-links here as ?tab=password-resets&request=…
  const deepLinkTab    = searchParams.get('tab')
  const focusRequestId = searchParams.get('request')

  const [section,          setSection]          = useState<ModuleSection>(
    deepLinkTab === RESETS_DEEPLINK ? 'password-resets' : 'directory',
  )
  const [activeTab,        setActiveTab]        = useState<TabValue>('admins')
  const [resetCount,       setResetCount]       = useState(0)
  const [allRows,          setAllRows]          = useState<AnyUser[]>([])
  const [loading,          setLoading]          = useState(true)
  const [fetching,         setFetching]         = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [searchInput,      setSearchInput]      = useState('')
  const [search,           setSearch]           = useState('')
  const [page,             setPage]             = useState(1)
  const [stats,            setStats]            = useState({ total: 0, active: 0, archived: 0 })
  const [serverTotal,      setServerTotal]      = useState(0)
  const [serverTotalPages, setServerTotalPages] = useState(1)
  const [showForm,         setShowForm]         = useState(false)
  const [editUser,         setEditUser]         = useState<AnyUser | null>(null)
  const [formViewOnly,     setFormViewOnly]     = useState(false)
  const [formTab,          setFormTab]          = useState<AdminMgmtTab>('admins')
  const [showTypePicker,   setShowTypePicker]   = useState(false)
  const [permUser,         setPermUser]         = useState<AnyUser | null>(null)
  const userLocks = useRecordLocks('user')
  // Archived view: the same tabs, listing archived accounts with a Restore action.
  const [showArchived,     setShowArchived]     = useState(false)
  const archivedRef = useRef(showArchived)
  archivedRef.current = showArchived
  // The tab whose rows may land: a response for a tab (or view) already left is dropped.
  const currentTabRef = useRef<TabValue>(activeTab)
  currentTabRef.current = activeTab

  const isInitialAllFetch = useRef(true)

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
    try {
      const [result, statsResult] = await Promise.all([
        userService.getAll({ search: searchQuery || undefined, role: ADMIN_ROLE_FILTER, status: archived ? 'archived' : undefined }),
        userService.getStats(ADMIN_ROLE_FILTER)
      ])
      if (currentTabRef.current !== 'all' || archivedRef.current !== archived) return
      setAllRows(result.data)
      setServerTotal(result.total)
      setServerTotalPages(Math.ceil(result.total / PAGE_SIZE))
      setStats({ total: statsResult.total, active: statsResult.active, archived: statsResult.archived })
    } catch {
      if (!quiet) setError('Failed to load accounts. Check your connection or permissions.')
    } finally {
      if (!quiet) {
        setLoading(false)
        setFetching(false)
      }
    }
  }, [])

  const fetchTabUsers = useCallback(async (tab: AdminMgmtTab, quiet = false) => {
    if (!quiet) {
      setLoading(true)
      setError(null)
      setAllRows([])
    }
    const archived = archivedRef.current
    try {
      const [rows, statsResult] = await Promise.all([
        archived
          ? userService.getAll({ role: ARCHIVED_ROLE[tab], status: 'archived' }).then((r) => r.data)
          : fetchByTab(tab),
        userService.getStats(ADMIN_ROLE_FILTER)
      ])
      if (currentTabRef.current !== tab || archivedRef.current !== archived) return
      setAllRows(rows)
      setStats({ total: statsResult.total, active: statsResult.active, archived: statsResult.archived })
    } catch {
      if (!quiet) setError('Failed to load accounts. Check your connection or permissions.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  // Someone else (or the driver app) changed an account: re-read the open tab.
  useLiveTable(['live:users'], () => {
    if (isResetsTab || isPeopleTab) return
    if (activeTab === 'all') void fetchAllUsers(search, false, true)
    else void fetchTabUsers(activeTab, true)
  })

  useEffect(() => {
    isInitialAllFetch.current = true
    setPage(1)
    setSearch('')
    setSearchInput('')
    // The resets panel and Clients & Drivers load their own data.
    if (isResetsTab || isPeopleTab) { setLoading(false); return }
    if (activeTab === 'all') fetchAllUsers('', true)
    else fetchTabUsers(activeTab)
  }, [activeTab, isResetsTab, isPeopleTab, showArchived]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const filtered = activeTab === 'all' || isResetsTab
    ? allRows
    : allRows.filter((u) => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          u.email?.toLowerCase().includes(q) ||
          u.first_name?.toLowerCase().includes(q) ||
          u.last_name?.toLowerCase().includes(q)
        )
      })

  const total      = activeTab === 'all' ? serverTotal      : filtered.length
  const totalPages = activeTab === 'all' ? serverTotalPages : Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const users      = activeTab === 'all'
    ? allRows
    : filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  async function handleStatusChange(user: AnyUser, status: UserStatus) {
    const serviceTab = activeTab === 'all'
      ? tabFromRole(user.role)
      : activeTab
    if (status === 'archived' && !window.confirm(
      `Archive ${displayName(user)}?\n\n` +
      'They are signed out everywhere and can no longer sign in. ' +
      'Their records are kept, and you can restore the account from the Archived view.'
    )) return
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

  async function handleRestore(user: AnyUser) {
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
  function openCreate() {
    setShowTypePicker(true)
  }

  function createAccount(type: AdminMgmtTab) {
    setShowTypePicker(false)
    setFormTab(type)
    setEditUser(null)
    setFormViewOnly(false)
    setShowForm(true)
  }

  function handleRefresh() {
    void refetchCurrentTab()
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
      <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#0a0a0a] text-white">
        <div className="flex flex-col lg:flex-1 lg:min-h-0 px-3 py-3 sm:px-4 lg:px-5 3xl:px-6 lg:pt-3 lg:pb-4 3xl:pb-5 gap-3 3xl:gap-4 lg:overflow-hidden">

          {/* Header */}
          {/* As tall as the button even when it is hidden (Password Reset tab),
              so switching tabs doesn't shift the page. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 lg:min-h-8 3xl:min-h-9 shrink-0">
            <h1 className="font-[family-name:var(--font-alegreya-sc)] text-[17px] 3xl:text-[20px] font-bold text-white">User Management</h1>
            {!isResetsTab && (
              <button onClick={openCreate} className={HEADER_BTN}>
                Create Administrator <UserRoundPlus className={HEADER_ICON} />
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 3xl:gap-4 shrink-0">
            {[
              { label: 'Total Staff',  value: stats.total,    color: 'text-white'     },
              { label: 'Active',       value: stats.active,   color: 'text-[#4df9ed]' },
              { label: 'Archived',     value: stats.archived, color: 'text-[#ffea00]' },
            ].map((s) => (
              <div key={s.label} className="min-w-0 rounded-[10px] border border-[#424242] bg-[#2a2828] px-2.5 py-2 sm:px-4 sm:py-2.5 3xl:px-5 3xl:py-3 shadow-[0_4px_4px_rgba(0,0,0,0.25)]">
                <p className="text-[10px] leading-tight sm:text-[11px] 3xl:text-[13px] font-bold uppercase text-[#818181]">{s.label}</p>
                <p className={`mt-1 3xl:mt-2 text-[18px] sm:text-[20px] 3xl:text-[24px] font-bold leading-none ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Table card */}
          <div className="flex flex-col lg:flex-1 lg:min-h-0 rounded-[10px] border-[0.5px] border-[#424242] bg-[#1b1b1b] shadow-[0_4px_4px_rgba(0,0,0,0.25)] lg:overflow-hidden">

            {/* Staff, clients and drivers, and the reset queue: three top-level tabs. */}
            {sectionTabs}

            {/* Role filter, search, refresh and the count on one row, as on User
                Management. The role filter belongs to the directory only: there
                is nothing to filter by role in a queue. */}
            {!isResetsTab && (
            <div className="flex flex-wrap items-center gap-3 3xl:gap-4 border-b border-[#424242] px-3 sm:px-4 3xl:px-5 py-2 3xl:py-2.5 shrink-0">
              <FormControl size="small" sx={{ width: { xs: '100%', sm: 240 }, [FIGMA_MQ]: { width: 260 } }}>
                <Select
                  value={activeTab}
                  onChange={(e: SelectChangeEvent) => setActiveTab(e.target.value as TabValue)}
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
                        <ShieldCheckIcon className="size-4 3xl:size-[18px]" /> {tab.label}
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
                        color: activeTab === t.key ? '#4df9ed' : '#818181',
                        bgcolor: activeTab === t.key ? '#4df9ed0d' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        borderTop: t.key === 'admins' ? '1px solid #424242' : 'none',
                        marginTop: t.key === 'admins' ? '4px' : '0',
                        paddingTop: t.key === 'admins' ? '8px' : undefined,
                        '&:hover': {
                          bgcolor: activeTab === t.key ? '#4df9ed1a' : '#2a2a2a',
                          color: activeTab === t.key ? '#4df9ed' : '#ffffff',
                        },
                        '&.Mui-selected': { bgcolor: '#4df9ed0d', '&:hover': { bgcolor: '#4df9ed1a' } },
                      }}
                    >
                      <span style={{ color: activeTab === t.key ? '#4df9ed' : '#818181', display: 'flex' }}>
                        <ShieldCheckIcon size={16} />
                      </span>
                      {t.label}
                      {activeTab === t.key && (
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
              <ArchivedToggle on={showArchived} onChange={setShowArchived} />
              <span className={`basis-full text-right sm:basis-auto sm:ml-auto text-[10px] 3xl:text-[11px] font-bold whitespace-nowrap ${showArchived ? 'text-[#ffea00]' : 'text-[#4df9ed]'}`}>
                {total} {showArchived ? 'Archived ' : ''}{ACCOUNT_NOUN[activeTab]} Account{total !== 1 ? 's' : ''}
              </span>
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
            {error && (
              <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400 shrink-0">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto lg:flex-1 lg:overflow-auto lg:min-h-0">
              {/* Fixed layout: every column, Actions included, gets the same width. */}
              <table className="w-full max-lg:min-w-[900px] lg:table-fixed">
                {/* Headers in the small-caps face, every cell below in regular Alegreya Sans. */}
                <thead className="sticky top-0 z-10 bg-[#1b1b1b] font-[family-name:var(--font-alegreya-sc)]">
                  <tr className="border-b border-[#424242]">
                    {HEADERS[activeTab].map((h) => (
                      <th key={h} className="px-4 3xl:px-5 py-2 3xl:py-2.5 text-[11px] 3xl:text-[13px] font-bold lowercase whitespace-nowrap text-left text-[#818181]">
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
                        <EmptyState tab={activeTab} onAdd={openCreate} archived={showArchived} />
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
                          {renderCells(user)}
                          {/* The row menu sits at the far right of the table. */}
                          <td className="px-4 3xl:px-5 py-2 3xl:py-2.5 text-right">
                            {showArchived ? (
                              <ArchivedRowMenu
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
          startInView={formViewOnly}
          // Same rule as the row menu: the combined list can't open the edit form.
          canEdit={activeTab !== 'all' && !showArchived}
          lockedBy={editUser ? userLocks.get(editUser.user_id) : undefined}
          enablePermissions
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false)
            await refetchCurrentTab()
          }}
        />
      )}

      <AccountTypePicker
        open={showTypePicker}
        options={NEW_ACCOUNT_TYPES}
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