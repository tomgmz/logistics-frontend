import type { AuthUser } from '@/lib/api/auth.api'
import {
  ALL_FLAGS,
  EMPTY_FLAGS,
  ModuleFlags,
  ModuleKey,
  isManagedRole,
} from '@/constants/modules'

// A user is "customized" once the IT Admin has saved any matrix for them.
// Until then they keep their full role-default access.
export function hasCustomPerms(user: AuthUser | null | undefined): boolean {
  if (!user || !isManagedRole(user.role)) return false
  return Array.isArray(user.module_permissions) && user.module_permissions.length > 0
}

// Resolve the effective flags for a module. Non-managed roles and users without
// a saved matrix get full access; otherwise it's the stored row (or all-false).
export function moduleFlags(
  user: AuthUser | null | undefined,
  moduleKey: ModuleKey,
): ModuleFlags {
  if (!user) return { ...EMPTY_FLAGS }
  if (!isManagedRole(user.role)) return { ...ALL_FLAGS }
  if (!hasCustomPerms(user)) return { ...ALL_FLAGS }

  const row = user.module_permissions!.find((p) => p.module_key === moduleKey)
  if (!row) return { ...EMPTY_FLAGS }
  return {
    can_view:   !!row.can_view,
    can_create: !!row.can_create,
    can_edit:   !!row.can_edit,
    can_delete: !!row.can_delete,
    can_export: !!row.can_export,
  }
}

// Can the user see this module at all (drives nav + page gating)?
export function canViewModule(
  user: AuthUser | null | undefined,
  moduleKey: ModuleKey,
): boolean {
  return moduleFlags(user, moduleKey).can_view
}
