// Module-level RBAC registry — frontend mirror of
// logistics-backend/src/constants/modules.ts (keep keys/labels in sync).

export interface ModuleFlags {
  can_view:   boolean
  can_create: boolean
  can_edit:   boolean
  can_delete: boolean
  can_export: boolean
}

// The granular actions shown as checkboxes, in display order.
export const PERMISSION_ACTIONS: { key: keyof ModuleFlags; label: string }[] = [
  { key: 'can_view',   label: 'View'   },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit',   label: 'Edit'   },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_export', label: 'Export' },
]

export const EMPTY_FLAGS: ModuleFlags = {
  can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false,
}
export const ALL_FLAGS: ModuleFlags = {
  can_view: true, can_create: true, can_edit: true, can_delete: true, can_export: true,
}

// Tiered access model shown in the Administrator Management matrix. The 5 granular
// flags above remain the source of truth in the DB + backend guard; these three
// mutually-exclusive levels are just how an IT Admin assigns them:
//   Read-only -> view only
//   Manage    -> view + create + edit + export (day-to-day operations)
//   All       -> Manage + delete (the destructive, top-tier privilege)
export type AccessLevel = 'none' | 'read' | 'manage' | 'all'

export const ACCESS_LEVELS: { key: Exclude<AccessLevel, 'none'>; label: string }[] = [
  { key: 'read',   label: 'Read-only' },
  { key: 'manage', label: 'Manage'    },
  { key: 'all',    label: 'All'       },
]

// Expand a level into the concrete flag set persisted to module_permissions.
export function levelToFlags(level: AccessLevel): ModuleFlags {
  switch (level) {
    case 'read':   return { can_view: true, can_create: false, can_edit: false, can_delete: false, can_export: false }
    case 'manage': return { can_view: true, can_create: true,  can_edit: true,  can_delete: false, can_export: true  }
    case 'all':    return { ...ALL_FLAGS }
    default:       return { ...EMPTY_FLAGS }
  }
}

// Collapse an arbitrary flag set back into a level. Tolerant of legacy/partial
// rows: any destructive flag => All, any write/export flag => Manage, view => Read.
export function flagsToLevel(f: ModuleFlags): AccessLevel {
  if (!f.can_view) return 'none'
  if (f.can_delete) return 'all'
  if (f.can_create || f.can_edit || f.can_export) return 'manage'
  return 'read'
}

// Roles an IT Admin can tailor — every account type in Administrator Management.
export const MANAGED_ROLES = [
  'admin',
  'accountant',
  'general_manager',
  'fleet_admin',
  'operations_admin',
] as const
export type ManagedRole = (typeof MANAGED_ROLES)[number]

export function isManagedRole(role: string | undefined | null): role is ManagedRole {
  return !!role && (MANAGED_ROLES as readonly string[]).includes(role)
}

export const MODULE_KEYS = [
  'user-management',
  'booking-management',
  'vehicle-management',
  'billing-management',
  'document-management',
  'transit-tracking',
  'transaction-history',
  'system-maintenance',
  'audit-logs',
] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]

export const MODULE_LABELS: Record<ModuleKey, string> = {
  'user-management':      'User Management',
  'booking-management':   'Booking Management',
  'vehicle-management':   'Vehicle Management',
  'billing-management':   'Billing Management',
  'document-management':  'Document Management',
  'transit-tracking':     'Transit Tracking',
  'transaction-history':  'Transaction History',
  'system-maintenance':   'System Maintenance',
  'audit-logs':           'Audit Logs',
}

// Assignable modules per managed role (matches the role's dashboard nav).
export const MODULES_BY_ROLE: Record<ManagedRole, ModuleKey[]> = {
  admin: [
    'user-management',
    'booking-management',
    'transit-tracking',
    'vehicle-management',
    'billing-management',
    'transaction-history',
    'document-management',
    'system-maintenance',
    'audit-logs',
  ],
  accountant: [
    'transaction-history',
    'document-management',
    'booking-management',
    'billing-management',
  ],
  general_manager: [
    'vehicle-management',
    'booking-management',
    'billing-management',
    'document-management',
  ],
  fleet_admin: ['vehicle-management', 'transit-tracking'],
  operations_admin: ['booking-management', 'document-management', 'transit-tracking'],
}

// Default access tier per role per module — mirror of the backend
// ROLE_MODULE_DEFAULTS (keep in sync). Used to pre-fill the matrix for a user who
// has no saved permissions yet, so the IT Admin sees the role's defaults.
type DefaultTier = Exclude<AccessLevel, 'none'>
export const ROLE_MODULE_DEFAULTS: Record<ManagedRole, Partial<Record<ModuleKey, DefaultTier>>> = {
  admin: {
    'user-management':     'all',
    'booking-management':  'all',
    'vehicle-management':  'all',
    'billing-management':  'all',
    'document-management': 'all',
    'system-maintenance':  'all',
    'transit-tracking':    'manage',
    'transaction-history': 'read',
    'audit-logs':          'read',
  },
  accountant: {
    'billing-management':  'all',
    'document-management': 'manage',
    'booking-management':  'read',
    'transaction-history': 'read',
  },
  general_manager: {
    'booking-management':  'manage',
    'billing-management':  'manage',
    'vehicle-management':  'read',
    'document-management': 'read',
  },
  fleet_admin: {
    'vehicle-management': 'all',
    'transit-tracking':   'manage',
  },
  operations_admin: {
    'booking-management':  'all',
    'document-management': 'manage',
    'transit-tracking':    'manage',
  },
}

// Build the default flag map for a role, keyed by module — used to seed the
// matrix UI when a user has no saved rows.
export function defaultFlagsForRole(role: string | undefined | null): Record<string, ModuleFlags> {
  if (!isManagedRole(role)) return {}
  const out: Record<string, ModuleFlags> = {}
  for (const [moduleKey, tier] of Object.entries(ROLE_MODULE_DEFAULTS[role])) {
    out[moduleKey] = levelToFlags(tier as DefaultTier)
  }
  return out
}

// Some routes live under a module without sharing its slug (e.g. the standalone
// Expenses page is governed by Billing Management, which contains expenses +
// reverse billing — just like the admin Billing module).
const HREF_ALIASES: Record<string, ModuleKey> = {
  expenses: 'billing-management',
}

// Map a dashboard route href to its module key (used to gate nav items).
// Matches the trailing segment, e.g. "/accountant/booking-management" -> "booking-management".
export function moduleFromHref(href: string): ModuleKey | null {
  const seg = href.split('/').filter(Boolean).pop() ?? ''
  if (seg in HREF_ALIASES) return HREF_ALIASES[seg]
  return (MODULE_KEYS as readonly string[]).includes(seg) ? (seg as ModuleKey) : null
}
