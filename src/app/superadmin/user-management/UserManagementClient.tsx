'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus, Search, RefreshCw, MoreVertical,
  Pencil, ShieldCheck, ShieldOff, Archive, Lock,
  ChevronLeft, ChevronRight, AlertTriangle,
} from 'lucide-react'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import type {
  UserTab, AnyUser, UserStatus,
  AdminUser, ClientUser, DriverUser, VendorUser,
} from '@/app/types/admin/user-management.types'
import {
  userService,
  clientService, driverService, vendorService,
  accountantService, generalManagerService, humanResourcesService,
  fleetAdminService, operationsAdminService, itAdminService,
} from '@/lib/services/admin/user-management.service'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import UserFormModal from './UserFormModal'

const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4df9ed' },
    background: { paper: '#1b1b1b' },
  },
})

type TabValue = UserTab | 'all'

const TABS: { key: TabValue; label: string }[] = [
  { key: 'all',                label: 'All Users'     },
  { key: 'clients',            label: 'Clients'       },
  { key: 'drivers',            label: 'Drivers'       },
  { key: 'vendors',            label: 'Vendors'       },
  { key: 'accountants',        label: 'Accountants'   },
  { key: 'general-managers',   label: 'Gen. Managers' },
  { key: 'fleet-admins',       label: 'Fleet Manager' },
  { key: 'operations-admins',  label: 'Operations Manager'  },
  { key: 'it-admins',          label: 'IT Administrator'     },
]

const PAGE_SIZE = 10

async function fetchByTab(tab: UserTab): Promise<AnyUser[]> {
  switch (tab) {
    case 'clients':           return clientService.getAll()          as Promise<AnyUser[]>
    case 'drivers':           return driverService.getAll()          as Promise<AnyUser[]>
    case 'vendors':           return vendorService.getAll()          as Promise<AnyUser[]>
    case 'accountants':       return accountantService.getAll()      as Promise<AnyUser[]>
    case 'general-managers':  return generalManagerService.getAll()  as Promise<AnyUser[]>
    case 'human-resources':   return humanResourcesService.getAll()  as Promise<AnyUser[]>
    case 'fleet-admins':      return fleetAdminService.getAll()      as Promise<AnyUser[]>
    case 'operations-admins': return operationsAdminService.getAll() as Promise<AnyUser[]>
    case 'it-admins':         return itAdminService.getAll()         as Promise<AnyUser[]>
  }
}

async function updateStatus(tab: UserTab, id: string, status: UserStatus): Promise<void> {
  if (status === 'active') {
    switch (tab) {
      case 'accountants':       return accountantService.activate(id).then()
      case 'clients':           return clientService.activate(id).then()
      case 'drivers':           return driverService.activate(id).then()
      case 'vendors':           return vendorService.activate(id).then()
      case 'general-managers':  return generalManagerService.activate(id).then()
      case 'human-resources':   return humanResourcesService.activate(id).then()
      case 'fleet-admins':      return fleetAdminService.activate(id).then()
      case 'operations-admins': return operationsAdminService.activate(id).then()
      case 'it-admins':         return itAdminService.activate(id).then()
      default:                  break
    }
  }
  if (status === 'deactivated') {
    switch (tab) {
      case 'accountants':       return accountantService.deactivate(id).then()
      case 'clients':           return clientService.deactivate(id).then()
      case 'drivers':           return driverService.deactivate(id).then()
      case 'vendors':           return vendorService.deactivate(id).then()
      case 'general-managers':  return generalManagerService.deactivate(id).then()
      case 'human-resources':   return humanResourcesService.deactivate(id).then()
      case 'fleet-admins':      return fleetAdminService.deactivate(id).then()
      case 'operations-admins': return operationsAdminService.deactivate(id).then()
      case 'it-admins':         return itAdminService.deactivate(id).then()
      default:                  break
    }
  }
  if (status === 'archived') {
    switch (tab) {
      case 'accountants':       return accountantService.remove(id)
      case 'clients':           return clientService.remove(id)
      case 'drivers':           return driverService.remove(id)
      case 'vendors':           return vendorService.remove(id)
      case 'general-managers':  return generalManagerService.remove(id)
      case 'human-resources':   return humanResourcesService.remove(id)
      case 'fleet-admins':      return fleetAdminService.remove(id)
      case 'operations-admins': return operationsAdminService.remove(id)
      case 'it-admins':         return itAdminService.remove(id)
      default:                  break
    }
  }

  const payload = { status } as never
  switch (tab) {
    case 'accountants':       return accountantService.update(id, payload).then()
    case 'clients':           return clientService.update(id, payload).then()
    case 'drivers':           return driverService.update(id, payload).then()
    case 'vendors':           return vendorService.update(id, payload).then()
    case 'general-managers':  return generalManagerService.update(id, payload).then()
    case 'human-resources':   return humanResourcesService.update(id, payload).then()
    case 'fleet-admins':      return fleetAdminService.update(id, payload).then()
    case 'operations-admins': return operationsAdminService.update(id, payload).then()
    case 'it-admins':         return itAdminService.update(id, payload).then()
  }
}

function tabFromRole(role: string): UserTab {
  switch (role) {
    case 'client':           return 'clients'
    case 'driver':           return 'drivers'
    case 'vendor':           return 'vendors'
    case 'accountant':       return 'accountants'
    case 'general_manager':  return 'general-managers'
    case 'human_resources':  return 'human-resources'
    case 'fleet_admin':      return 'fleet-admins'
    case 'operations_admin': return 'operations-admins'
    case 'it_admin':         return 'it-admins'
    default:                 return 'clients'
  }
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

const STATUS_CFG: Record<UserStatus, { label: string; cls: string }> = {
  active:             { label: 'Active',      cls: 'bg-[#4df9ed]/10 text-[#4df9ed] border-[#4df9ed]/30'    },
  inactive:           { label: 'Inactive',    cls: 'bg-[#818181]/10 text-[#818181] border-[#818181]/30'    },
  deactivated:        { label: 'Deactivated', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  archived:           { label: 'Archived',    cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  permanently_locked: { label: 'Locked',      cls: 'bg-red-500/15 text-red-400 border-red-500/30'          },
}

const ROLE_COLORS: Record<string, string> = {
  super_admin:      'bg-[#4df9ed]/10 text-[#4df9ed] border-[#4df9ed]/30',
  it_admin:         'bg-blue-500/15 text-blue-400 border-blue-500/30',
  general_manager:  'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  fleet_admin:      'bg-orange-500/15 text-orange-400 border-orange-500/30',
  operations_admin: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  human_resources:  'bg-pink-500/15 text-pink-400 border-pink-500/30',
  accountant:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  driver:           'bg-sky-500/15 text-sky-400 border-sky-500/30',
  client:           'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  vendor:           'bg-lime-500/15 text-lime-400 border-lime-500/30',
}

const ROLE_LABELS: Record<string, string> = {
  super_admin:      'Super Admin',
  it_admin:         'IT Admin',
  general_manager:  'General Manager',
  fleet_admin:      'Fleet Manager',
  operations_admin: 'Operations Manager',
  human_resources:  'HR Officer',
  accountant:       'Accountant',
  driver:           'Driver',
  client:           'Client',
  vendor:           'Vendor',
}

function StatusBadge({ status }: { status: UserStatus }) {
  const { label, cls } = STATUS_CFG[status] ?? STATUS_CFG.inactive
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLORS[role] ?? 'bg-[#818181]/10 text-[#818181] border-[#818181]/30'
  const label = ROLE_LABELS[role] ?? role.replace(/_/g, ' ')
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

interface RowMenuProps {
  user: AnyUser
  tab: TabValue
  onEdit: () => void
  onStatusChange: (s: UserStatus) => void
}

const STAFF_TABS_HIDE_INACTIVE_ACTION: TabValue[] = [
  'accountants',
  'general-managers',
  'human-resources',
  'fleet-admins',
  'operations-admins',
  'it-admins',
]

function RowMenu({ user, tab, onEdit, onStatusChange }: RowMenuProps) {
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
    { label: 'Set Active',    status: 'active'             as UserStatus, icon: <ShieldCheck size={13} /> },
    { label: 'Set Inactive',  status: 'inactive'           as UserStatus, icon: <ShieldOff size={13} />   },
    { label: 'Deactivate',    status: 'deactivated'        as UserStatus, icon: <ShieldOff size={13} />   },
    { label: 'Archive',       status: 'archived'           as UserStatus, icon: <Archive size={13} />     },
    { label: 'Perm. Lock',    status: 'permanently_locked' as UserStatus, icon: <Lock size={13} />        },
  ]).filter((a) => {
    if (a.status !== user.status) {
      if (STAFF_TABS_HIDE_INACTIVE_ACTION.includes(tab) && a.status === 'inactive') return false
      return true
    }
    return false
  })

  const canEdit = tab !== 'all'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="rounded-md p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white"
      >
        <MoreVertical size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-8 z-50 w-48 rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] py-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
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
                {canEdit && <div className="my-1 border-t border-[#2a2a2a]" />}
                {statusActions.map((a) => (
                  <button
                    key={a.status}
                    onClick={() => { setOpen(false); onStatusChange(a.status) }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-sm transition ${
                      a.status === 'archived'
                        ? 'text-yellow-400 hover:bg-yellow-500/10'
                        : a.status === 'permanently_locked'
                        ? 'text-red-400 hover:bg-red-500/10'
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
        <tr key={i} className="border-b border-[#2a2a2a]/60">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3.5">
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

function EmptyState({ tab, onAdd }: { tab: TabValue; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 rounded-full border border-[#2a2a2a] bg-[#1b1b1b] p-4">
        <Users size={28} className="text-[#818181]" />
      </div>
      <p className="text-base font-semibold text-white">No records found</p>
      <p className="mt-1 text-sm text-[#818181]">
        No {tab === 'all' ? 'users' : tab.replace(/-/g, ' ')} match your current filters.
      </p>
      {tab !== 'all' && (
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

function AdminLikeCells({ user }: { user: AdminUser }) {
  const name = [user.first_name, user.middle_name, user.last_name, user.suffix].filter(Boolean).join(' ') || '—'
  return (
    <>
      <td className="px-4 py-3.5">
        <p className="font-medium text-white">{name}</p>
      </td>
      <td className="px-4 py-3.5 text-sm text-[#818181]">{user.email}</td>
      <td className="px-4 py-3.5 text-sm text-[#818181]">{user.phone ?? '—'}</td>
      <td className="px-4 py-3.5"><RoleBadge role={user.role} /></td>
      <td className="px-4 py-3.5"><StatusBadge status={user.status} /></td>
    </>
  )
}

function renderCells(user: AnyUser, tab: TabValue) {
  if (tab === 'all') {
    const name = [user.first_name, user.middle_name, user.last_name, user.suffix].filter(Boolean).join(' ') || '—'
    return (
      <>
        <td className="px-4 py-3.5">
          <p className="font-medium text-white">{name}</p>
        </td>
        <td className="px-4 py-3.5 text-sm text-[#818181]">{user.email}</td>
        <td className="px-4 py-3.5 text-sm text-[#818181]">{user.phone ?? '—'}</td>
        <td className="px-4 py-3.5"><RoleBadge role={user.role} /></td>
        <td className="px-4 py-3.5"><StatusBadge status={user.status} /></td>
      </>
    )
  }

  switch (tab) {
    case 'clients': {
      const u = user as ClientUser
      const name = [u.first_name, u.middle_name, u.last_name, u.suffix].filter(Boolean).join(' ') || '—'
      return (
        <>
          <td className="px-4 py-3.5">
            <p className="font-medium text-white">{name}</p>
          </td>
          <td className="px-4 py-3.5 text-sm text-[#818181]">{u.email}</td>
          <td className="px-4 py-3.5 text-sm text-[#818181]">{u.clients?.company_name ?? '—'}</td>
          <td className="px-4 py-3.5"><StatusBadge status={u.status} /></td>
          <td className="px-4 py-3.5 text-xs text-[#818181]">{formatDateTime(u.last_login_at ?? null)}</td>
        </>
      )
    }
    case 'drivers': {
      const u = user as DriverUser
      const name = [u.first_name, u.middle_name, u.last_name, u.suffix].filter(Boolean).join(' ') || '—'
      const drvStatus = u.drivers?.status
      return (
        <>
          <td className="px-4 py-3.5">
            <p className="font-medium text-white">{name}</p>
          </td>
          <td className="px-4 py-3.5 text-sm font-mono text-[#818181]">{u.drivers?.license_number ?? '—'}</td>
          <td className="px-4 py-3.5 text-sm text-[#818181]">{formatDate(u.drivers?.license_expiry ?? null)}</td>
          <td className="px-4 py-3.5">
            {drvStatus && (
              <span className="inline-flex items-center rounded-full border border-[#4df9ed]/30 bg-[#4df9ed]/10 px-2 py-0.5 text-[11px] font-semibold text-[#4df9ed]">
                {drvStatus.replace(/_/g, ' ')}
              </span>
            )}
          </td>
          <td className="px-4 py-3.5"><StatusBadge status={u.status} /></td>
        </>
      )
    }
    case 'vendors': {
      const u = user as VendorUser
      const name = [u.first_name, u.middle_name, u.last_name, u.suffix].filter(Boolean).join(' ') || '—'
      return (
        <>
          <td className="px-4 py-3.5">
            <p className="font-medium text-white">{name}</p>
          </td>
          <td className="px-4 py-3.5 text-sm text-[#818181]">{u.email}</td>
          <td className="px-4 py-3.5">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              u.vendors?.vendor_type === 'company'
                ? 'border-[#4df9ed]/30 bg-[#4df9ed]/10 text-[#4df9ed]'
                : 'border-[#818181]/30 bg-[#818181]/10 text-[#818181]'
            }`}>
              {u.vendors?.vendor_type ?? '—'}
            </span>
          </td>
          <td className="px-4 py-3.5 text-sm text-[#818181]">{u.vendors?.company_name ?? '—'}</td>
          <td className="px-4 py-3.5"><StatusBadge status={u.status} /></td>
        </>
      )
    }
    case 'accountants':
    case 'general-managers':
    case 'human-resources':
    case 'fleet-admins':
    case 'operations-admins':
    case 'it-admins':
      return <AdminLikeCells user={user as AdminUser} />
  }
}

const HEADERS: Record<TabValue, string[]> = {
  all:                 ['Name', 'Email', 'Phone', 'Role', 'Status'],
  clients:             ['Name', 'Email', 'Company', 'Status', 'Last Login'],
  drivers:             ['Name', 'License #', 'Expiry', 'Driver Status', 'Acct. Status'],
  vendors:             ['Name', 'Email', 'Type', 'Company', 'Status'],
  accountants:         ['Name', 'Email', 'Phone', 'Role', 'Status'],
  'general-managers':  ['Name', 'Email', 'Phone', 'Role', 'Status'],
  'human-resources':   ['Name', 'Email', 'Phone', 'Role', 'Status'],
  'fleet-admins':      ['Name', 'Email', 'Phone', 'Role', 'Status'],
  'operations-admins': ['Name', 'Email', 'Phone', 'Role', 'Status'],
  'it-admins':         ['Name', 'Email', 'Phone', 'Role', 'Status'],
}

export default function UserManagementClient() {
  const [activeTab,        setActiveTab]        = useState<TabValue>('clients')
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
  const [formTab,          setFormTab]          = useState<UserTab>('clients')

  const isInitialAllFetch = useRef(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchAllUsers = useCallback(async (searchQuery: string, hard = false) => {
    if (hard) {
      setLoading(true)
    } else {
      setFetching(true)
    }
    setError(null)
    try {
      const [result, statsResult] = await Promise.all([
        userService.getAll({ search: searchQuery || undefined }),
        userService.getStats(),
      ])
      setAllRows(result.data)
      setServerTotal(result.total)
      setServerTotalPages(Math.ceil(result.total / PAGE_SIZE))
      setStats({ total: statsResult.total, active: statsResult.active, archived: statsResult.archived })
    } catch {
      setError('Failed to load users. Check your connection or permissions.')
    } finally {
      setLoading(false)
      setFetching(false)
    }
  }, [])

  const fetchTabUsers = useCallback(async (tab: UserTab) => {
    setLoading(true)
    setError(null)
    setAllRows([])
    try {
      const [rows, statsResult] = await Promise.all([
        fetchByTab(tab),
        userService.getStats(),
      ])
      setAllRows(rows)
      setStats({ total: statsResult.total, active: statsResult.active, archived: statsResult.archived })
    } catch {
      setError('Failed to load users. Check your connection or permissions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    isInitialAllFetch.current = true
    setPage(1)
    setSearch('')
    setSearchInput('')
    if (activeTab === 'all') {
      fetchAllUsers('', true)
    } else {
      fetchTabUsers(activeTab as UserTab)
    }
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== 'all') return
    if (isInitialAllFetch.current) {
      isInitialAllFetch.current = false
      return
    }
    fetchAllUsers(search, false)
  }, [search, activeTab, fetchAllUsers])

  const filtered = activeTab === 'all'
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
    const serviceTab = activeTab === 'all' ? tabFromRole(user.role) : activeTab as UserTab
    try {
      await appToast.promise(
        updateStatus(serviceTab, user.user_id, status),
        {
          loading: `Updating account…`,
          success: `Status updated → ${STATUS_CFG[status].label}`,
          error:   (e) => getApiErrorMessage(e, 'Failed to update account.'),
        },
        { action: 'update-status', entityId: user.user_id },
      )
      if (activeTab === 'all') {
        await fetchAllUsers(search, false)
      } else {
        await fetchTabUsers(activeTab as UserTab)
      }
    } catch {
    }
  }

  function openEdit(user: AnyUser) {
    const tab = activeTab === 'all' ? tabFromRole(user.role) : activeTab as UserTab
    setFormTab(tab)
    setEditUser(user)
    setShowForm(true)
  }

  function openCreate() {
    setFormTab(activeTab === 'all' ? 'clients' : activeTab as UserTab)
    setEditUser(null)
    setShowForm(true)
  }

  function handleRefresh() {
    if (activeTab === 'all') {
      fetchAllUsers(search, false)
    } else {
      fetchTabUsers(activeTab as UserTab)
    }
  }

  const colCount = HEADERS[activeTab].length + 1

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-80px)] overflow-hidden bg-[#0a0a0a] text-white">
        <div className="flex flex-col flex-1 min-h-0 px-3 py-3 lg:px-4 gap-6 overflow-hidden">

          <div className="flex items-start justify-between shrink-0">
            <div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">User Management</h1>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-xl bg-[#4df9ed] px-5 py-2.5 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[#7bfbf5] active:scale-95"
            >
              <UserPlus size={15} /> Add User
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 shrink-0">
            {[
              { label: 'Total Users', value: stats.total,    color: 'text-white' },
              { label: 'Active',      value: stats.active,   color: 'text-[#4df9ed]' },
              { label: 'Archived',    value: stats.archived, color: 'text-yellow-400' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#818181]">{s.label}</p>
                <p className={`mt-1 text-3xl font-bold font-mono ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-[#2a2a2a] bg-[#1b1b1b] overflow-hidden">

            <div className="px-4 pt-3 pb-3 border-b border-[#2a2a2a] shrink-0">
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <Select
                  value={activeTab}
                  onChange={(e: SelectChangeEvent) => {
                    setActiveTab(e.target.value as TabValue)
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        bgcolor: '#1b1b1b',
                        border: '1px solid #2a2a2a',
                        borderRadius: '12px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                        mt: '6px',
                        '& .MuiList-root': { p: '4px' },
                      },
                    },
                  }}
                  sx={{
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#4df9ed',
                    bgcolor: '#2a2a2a',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#424242' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4df9ed50' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4df9ed', borderWidth: '1px' },
                    '& .MuiSelect-icon': { color: '#818181' },
                    '& .MuiSelect-select': { display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', paddingBottom: '8px' },
                  }}
                  renderValue={(value) => {
                    const tab = TABS.find((t) => t.key === value)!
                    return (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4df9ed', fontSize: '13px', fontWeight: 500 }}>
                        <Users size={14} /> {tab.label}
                      </span>
                    )
                  }}
                >
                  {TABS.map((t) => (
                    <MenuItem
                      key={t.key}
                      value={t.key}
                      sx={{
                        borderRadius: '8px',
                        mb: '2px',
                        fontSize: '13px',
                        fontWeight: t.key === 'all' ? 600 : 500,
                        color: activeTab === t.key ? '#4df9ed' : '#818181',
                        bgcolor: activeTab === t.key ? '#4df9ed0d' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        borderTop: t.key === 'clients' ? '1px solid #2a2a2a' : 'none',
                        marginTop: t.key === 'clients' ? '4px' : '0',
                        paddingTop: t.key === 'clients' ? '8px' : undefined,
                        '&:hover': {
                          bgcolor: activeTab === t.key ? '#4df9ed1a' : '#2a2a2a',
                          color: activeTab === t.key ? '#4df9ed' : '#ffffff',
                        },
                        '&.Mui-selected': {
                          bgcolor: '#4df9ed0d',
                          '&:hover': { bgcolor: '#4df9ed1a' },
                        },
                      }}
                    >
                      <span style={{ color: activeTab === t.key ? '#4df9ed' : '#818181', display: 'flex' }}>
                        <Users size={14} />
                      </span>
                      {t.label}
                      {activeTab === t.key && (
                        <span style={{ marginLeft: 'auto', height: '6px', width: '6px', borderRadius: '50%', backgroundColor: '#4df9ed', flexShrink: 0 }} />
                      )}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </div>

            <div className="flex items-center gap-3 border-b border-[#2a2a2a] px-4 py-3 shrink-0">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#818181]" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name or email…"
                  className="w-full rounded-lg border border-[#424242] bg-[#2a2a2a]/60 py-2 pl-9 pr-4 text-sm text-white placeholder-[#818181] outline-none transition focus:border-[#4df9ed] focus:ring-1 focus:ring-[#4df9ed]/20"
                />
              </div>
              <button
                onClick={handleRefresh}
                disabled={loading || fetching}
                className="flex items-center gap-1.5 rounded-lg border border-[#424242] px-3 py-2 text-sm text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-40"
              >
                <RefreshCw size={13} className={(loading || fetching) ? 'animate-spin' : ''} /> Refresh
              </button>
              <span className="ml-auto text-xs text-[#818181]">
                {total} record{total !== 1 ? 's' : ''}
              </span>
            </div>

            {error && (
              <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-400 shrink-0">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <div className={'flex-1 overflow-auto min-h-0'}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#1b1b1b]">
                  <tr className="border-b border-[#2a2a2a]">
                    {HEADERS[activeTab].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#818181]">
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-[#818181]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(loading || fetching) ? (
                    <TableSkeleton cols={colCount} />
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={colCount}><EmptyState tab={activeTab} onAdd={openCreate} /></td>
                    </tr>
                  ) : (
                    <AnimatePresence mode="wait">
                      {users.map((user, i) => (
                        <motion.tr
                          key={user.user_id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="border-b border-[#2a2a2a]/60 transition-colors hover:bg-[#2a2a2a]/40"
                        >
                          {renderCells(user, activeTab)}
                          <td className="px-4 py-3.5 text-right">
                            <RowMenu
                              user={user}
                              tab={activeTab}
                              onEdit={() => openEdit(user)}
                              onStatusChange={(s) => handleStatusChange(user, s)}
                            />
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
            </div>

            {!loading && totalPages > 1 && (
              <div className="shrink-0 border-t border-[#2a2a2a] bg-[#1b1b1b] px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#818181]">
                    Page {safePage} of {totalPages} &mdash; {total} record{total !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1 || fetching}
                      className="rounded-lg p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-30"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const n = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i
                      return (
                        <button
                          key={n}
                          onClick={() => setPage(n)}
                          disabled={fetching}
                          className={`h-7 w-7 rounded-lg text-xs font-medium transition ${
                            n === safePage
                              ? 'bg-[#4df9ed] text-[#0a0a0a]'
                              : 'text-[#818181] hover:bg-[#2a2a2a] hover:text-white'
                          } disabled:opacity-50`}
                        >
                          {n}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages || fetching}
                      className="rounded-lg p-1.5 text-[#818181] transition hover:bg-[#2a2a2a] hover:text-white disabled:opacity-30"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {showForm && (
        <UserFormModal
          tab={formTab}
          user={editUser}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false)
            if (activeTab === 'all') {
              await fetchAllUsers(search, false)
            } else {
              await fetchTabUsers(activeTab as UserTab)
            }
          }}
        />
      )}
    </ThemeProvider>
  )
}