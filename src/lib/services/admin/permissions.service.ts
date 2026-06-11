import proxyApi from '@/lib/api/auth.api'
import type { ModuleFlags, ModuleKey } from '@/constants/modules'

interface ApiResponse<T> {
  status:   string
  data:     T
  message?: string
}

export interface ModulePermissionSummary extends ModuleFlags {
  module_key: string
}

export interface UserPermissionsResponse {
  role:        string
  modules:     ModuleKey[]
  protected:   boolean
  permissions: ModulePermissionSummary[]
}

export interface PermissionInput extends ModuleFlags {
  module_name: ModuleKey
}

const B = '/admin'

export const permissionsService = {
  get: (userId: string) =>
    proxyApi
      .get<ApiResponse<UserPermissionsResponse>>(`${B}/users/${userId}/permissions`)
      .then((r) => r.data.data),

  save: (userId: string, permissions: PermissionInput[]) =>
    proxyApi
      .put<ApiResponse<ModulePermissionSummary[]>>(`${B}/users/${userId}/permissions`, { permissions })
      .then((r) => r.data.data),
}
