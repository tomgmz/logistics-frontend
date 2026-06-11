'use client'

import { createContext, useContext, ReactNode } from 'react'
import { ShieldOff } from 'lucide-react'
import { ALL_FLAGS, ModuleFlags } from '@/constants/modules'

interface ModuleAccessValue {
  canView:   boolean
  canCreate: boolean
  canEdit:   boolean
  canDelete: boolean
  canExport: boolean
}

// Defaults to full access so views rendered outside a managed-role shell
// (e.g. the admin portal) are never accidentally restricted.
const ModuleAccessContext = createContext<ModuleAccessValue>({
  canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true,
})

export function ModuleAccessProvider({ flags, children }: { flags: ModuleFlags; children: ReactNode }) {
  const value: ModuleAccessValue = {
    canView:   flags.can_view,
    canCreate: flags.can_create,
    canEdit:   flags.can_edit,
    canDelete: flags.can_delete,
    canExport: flags.can_export,
  }
  return <ModuleAccessContext.Provider value={value}>{children}</ModuleAccessContext.Provider>
}

// Read the current module's access inside any page/view.
// Use `canCreate` / `canEdit` / `canDelete` to hide write controls.
export function useModuleAccess(): ModuleAccessValue {
  return useContext(ModuleAccessContext)
}

export const FULL_ACCESS_FLAGS: ModuleFlags = ALL_FLAGS

export function ModuleNoAccess() {
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center bg-[var(--color-bg)] text-center px-6">
      <div className="mb-4 rounded-full border border-white/10 bg-white/[0.03] p-4">
        <ShieldOff size={28} className="text-[#818181]" />
      </div>
      <p className="text-base font-semibold text-white">Access restricted</p>
      <p className="mt-1 max-w-sm text-sm text-[#818181]">
        You don&apos;t have permission to view this module. Contact your IT administrator if you
        believe this is a mistake.
      </p>
    </div>
  )
}
