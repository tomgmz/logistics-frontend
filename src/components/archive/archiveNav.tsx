import { Archive } from 'lucide-react'
import type { ModuleKey } from '@/constants/modules'

// The Archive module's tabs per portal, kept apart from ArchiveModule.tsx so a
// portal's sidebar can name the Archive entry without loading every table.

export type ArchivePortal = 'admin' | 'it_admin' | 'general_manager' | 'fleet_admin' | 'operations_admin'

export type ArchiveKey = 'users' | 'administrators' | 'vehicles' | 'models' | 'documents'

export interface ArchiveTab {
  key:    ArchiveKey
  label:  string
  /** The module whose access gates this tab; null = always (IT Administrator's own pages). */
  module: ModuleKey | null
}

export const ARCHIVE_TABS: Record<ArchivePortal, ArchiveTab[]> = {
  admin: [
    { key: 'users',     label: 'Users',     module: 'user-management' },
    { key: 'vehicles',  label: 'Vehicles',  module: 'vehicle-management' },
    { key: 'models',    label: 'Models',    module: 'vehicle-management' },
    { key: 'documents', label: 'Documents', module: 'document-management' },
  ],
  it_admin: [
    { key: 'administrators', label: 'Administrators',    module: null },
    { key: 'users',          label: 'Clients & Drivers', module: null },
  ],
  general_manager: [
    { key: 'vehicles',  label: 'Vehicles',  module: 'vehicle-management' },
    { key: 'models',    label: 'Models',    module: 'vehicle-management' },
    { key: 'documents', label: 'Documents', module: 'document-management' },
  ],
  fleet_admin: [
    { key: 'vehicles',  label: 'Vehicles',  module: 'vehicle-management' },
    { key: 'models',    label: 'Models',    module: 'vehicle-management' },
    { key: 'documents', label: 'Documents', module: 'document-management' },
  ],
  operations_admin: [
    { key: 'documents', label: 'Documents', module: 'document-management' },
  ],
}

/** The modules behind a portal's Archive tabs (the sidebar shows Archive when any is visible). */
export function archiveModules(portal: ArchivePortal): ModuleKey[] {
  return [...new Set(ARCHIVE_TABS[portal].map((t) => t.module).filter((m): m is ModuleKey => m !== null))]
}

/** The sidebar entry for a portal's Archive module. */
export function archiveNavItem(portal: ArchivePortal) {
  return { href: `/${portal}/archive`, label: 'Archive', icon: <Archive size={20} />, anyOf: archiveModules(portal) }
}
