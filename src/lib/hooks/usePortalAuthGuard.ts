'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/store/auth.store'
import { signOutSession } from '@/lib/api/auth.api'

const ROLE_ROUTES: Record<string, string> = {
  super_admin:      '/superadmin',
  general_manager:  '/general_manager',
  accountant:       '/accountant',
  fleet_admin:      '/fleet_admin',
  operations_admin: '/operations_admin',
  it_admin:         '/it_admin',
  client:           '/client',
  vendor:           '/vendor',
}

export type PortalRole = keyof typeof ROLE_ROUTES

function isRoleAllowed(userRole: string, allowed: PortalRole | PortalRole[]): boolean {
  const roles = Array.isArray(allowed) ? allowed : [allowed]
  return roles.includes(userRole as PortalRole)
}

/**
 * Guards role-specific portals (client, superadmin, vendor, etc.).
 * Clears stale cookies before redirecting so all roles avoid / ↔ portal loops.
 */
export function usePortalAuthGuard(allowed: PortalRole | PortalRole[]) {
  const user        = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const didRedirect = useRef(false)

  const isAuthorized =
    !!user && isRoleAllowed(user.role, allowed)

  const allowedKey = Array.isArray(allowed) ? allowed.join(',') : allowed

  useEffect(() => {
    if (!hasHydrated || didRedirect.current) return

    if (!user) {
      didRedirect.current = true
      void signOutSession().finally(() => {
        window.location.replace('/')
      })
      return
    }

    if (!isRoleAllowed(user.role, allowed)) {
      didRedirect.current = true
      const portal = ROLE_ROUTES[user.role]
      window.location.replace(portal ?? '/')
    }
  }, [hasHydrated, user, allowedKey, allowed])

  return {
    user,
    hasHydrated,
    isAuthorized,
    isLoading: !hasHydrated || !isAuthorized,
  }
}
