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
