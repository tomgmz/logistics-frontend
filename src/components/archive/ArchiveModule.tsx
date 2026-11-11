'use client'

import { Suspense, useCallback, useMemo, type ReactNode } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Archive } from 'lucide-react'
import { ARCHIVE_TABS, type ArchiveKey, type ArchivePortal } from './archiveNav'
import { TabsMinimal } from '@/components/ui/untitled/tabs'
import { ModuleAccessProvider, useModuleAccess } from '@/components/layout/ModuleAccess'
import { useAuthStore } from '@/lib/store/auth.store'
import { canViewModule, moduleFlags } from '@/lib/permissions'
import UserManagementClient from '@/app/admin/user-management/UserManagementClient'
import AdministratorManagementView from '@/app/it_admin/administrator-management/AdministratorManagementView'
import VehicleManagementView from '@/app/admin/vehicle-management/VehicleManagementView'
import TruckModelsTab from '@/app/admin/vehicle-management/TruckModelsTab'
import DocumentManagementView from '@/app/admin/document-management/DocumentManagementView'

/**
 * The Archive module (2026-11-11): every archived record of a portal, one tab
 * per source module, each drawn with that module's own table. Archived rows
 * are listed here and nowhere else; the modules themselves show current
 * records only.
 *
 * Access follows the source module: a tab shows only when the person can see
 * that module, and its Restore / view actions run under that module's Read
 * Only or Manage All (the server checks the same module on every call).
 */
export default function ArchiveModule({ portal }: { portal: ArchivePortal }) {
  // useSearchParams needs its own Suspense boundary under the app router.
  return (
    <Suspense fallback={null}>
      <ArchiveTabs portal={portal} />
    </Suspense>
  )
}

function ArchiveTabs({ portal }: { portal: ArchivePortal }) {
  const user         = useAuthStore((s) => s.user)
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const tabs = useMemo(
    () => ARCHIVE_TABS[portal].filter((t) => t.module === null || canViewModule(user, t.module)),
    [portal, user],
  )
  const asked  = searchParams.get('tab')
  const active = tabs.find((t) => t.key === asked) ?? tabs[0]

  // The tab is kept in the address, so a refresh or a shared link lands on it.
  const pick = useCallback((key: ArchiveKey) => {
    router.replace(key === tabs[0]?.key ? pathname : `${pathname}?tab=${key}`)
  }, [router, pathname, tabs])

  if (!active) return <NothingArchived />

  const switcher = (
    <TabsMinimal
      label="Archive"
      items={tabs.map((t) => ({ id: t.key, label: t.label }))}
      selectedKey={active.key}
      onSelectionChange={pick}
    />
  )

  const body = renderTab(active.key, portal, switcher)
  // Keyed by tab: each list starts fresh (page 1, no search) when picked.
  return active.module
    ? <ModuleAccessProvider key={active.key} flags={moduleFlags(user, active.module)}>{body}</ModuleAccessProvider>
    : <div key={active.key} className="contents">{body}</div>
}

function renderTab(key: ArchiveKey, portal: ArchivePortal, switcher: ReactNode): ReactNode {
  switch (key) {
    case 'users':
      return <UserManagementClient mode={portal === 'it_admin' ? 'it-admin' : 'company-admin'} archive={switcher} />
    case 'administrators':
      return <AdministratorManagementView archive={switcher} />
    case 'vehicles':
      return <VehicleManagementView archive={switcher} />
    case 'models':
      return <ArchivedModels switcher={switcher} />
    case 'documents':
      return <DocumentManagementView fleetOnly={portal === 'fleet_admin'} archive={switcher} />
  }
}

/** Manage Models normally sits in a pop-up; here it gets the page frame the other tabs have. */
function ArchivedModels({ switcher }: { switcher: ReactNode }) {
  const { canCreate, canEdit, canDelete } = useModuleAccess()
  return (
    <div className="flex flex-1 min-h-0 flex-col h-[calc(100dvh-70px)] lg:h-[calc(100dvh-60px)] overflow-y-auto overflow-x-hidden lg:overflow-hidden ff-sc bg-[#0a0a0a] text-white">
      <div className="flex flex-col flex-[1_0_auto] lg:flex-1 lg:min-h-0 px-3 py-3 sm:px-4 lg:px-5 3xl:px-6 lg:pt-3 lg:pb-4 3xl:pb-5 gap-3 3xl:gap-4 lg:overflow-hidden">
        <TruckModelsTab canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} archive={switcher} />
      </div>
    </div>
  )
}

function NothingArchived() {
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center bg-[var(--color-bg)] text-center px-6">
      <div className="mb-4 rounded-full border border-white/10 bg-white/[0.03] p-4">
        <Archive size={28} className="text-[#818181]" />
      </div>
      <p className="text-base font-semibold text-white">Nothing to show</p>
      <p className="mt-1 max-w-sm text-sm text-[#818181]">
        You don&apos;t have access to any module with archived records.
      </p>
    </div>
  )
}
