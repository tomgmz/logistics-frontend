import proxyApi from '@/lib/api/auth.api'
import type {
  AdminUser,
  ClientUser,
  DriverUser,
  VendorUser,
  AnyUser,
  CreateClientPayload,
  UpdateClientPayload,
  CreateDriverPayload,
  UpdateDriverPayload,
  CreateVendorPayload,
  UpdateVendorPayload,
  CreateAccountantPayload,
  UpdateAccountantPayload,
  CreateGeneralManagerPayload,
  UpdateGeneralManagerPayload,
  CreateHumanResourcesPayload,
  UpdateHumanResourcesPayload,
  CreateFleetAdminPayload,
  UpdateFleetAdminPayload,
  CreateOperationsAdminPayload,
  UpdateOperationsAdminPayload,
  CreateITAdminPayload,
  UpdateITAdminPayload,
} from '@/app/types/admin/user-management.types'

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}

export interface GetUsersParams {
  role?:   string
  status?: string
  search?: string
  page?:   number
  limit?:  number
}

export interface GetUsersResponse {
  data:       AnyUser[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

export interface UserStatsResponse {
  total:    number
  active:   number
  inactive: number
  archived: number
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url, { params })
  return data.data
}

async function post<T>(url: string, payload: unknown): Promise<T> {
  const { data } = await proxyApi.post<ApiResponse<T>>(url, payload)
  return data.data
}

async function patch<T>(url: string, payload?: unknown): Promise<T> {
  const { data } = await proxyApi.patch<ApiResponse<T>>(url, payload ?? {})
  return data.data
}

async function del(url: string): Promise<void> {
  await proxyApi.delete(url)
}

const B = '/admin'

export const userService = {
  getAll: (params: GetUsersParams) =>
    proxyApi
      .get<Omit<GetUsersResponse, 'data'> & { status: string; data: AnyUser[] }>(`${B}/users`, { params })
      .then((r) => ({
        data:       r.data.data,
        total:      r.data.total,
        page:       r.data.page,
        limit:      r.data.limit,
        totalPages: r.data.totalPages,
      })),

  getStats: () =>
    proxyApi
      .get<ApiResponse<UserStatsResponse>>(`${B}/users/stats`)
      .then((r) => r.data.data),
}

export const clientService = {
  getAll: () => get<ClientUser[]>(`${B}/clients`),
  getOne: (id: string) => get<ClientUser>(`${B}/clients/${id}`),
  create: (p: CreateClientPayload) => post<ClientUser>(`${B}/clients`, p),
  update: (id: string, p: UpdateClientPayload) => patch<ClientUser>(`${B}/clients/${id}`, p),
  remove: (id: string) => del(`${B}/clients/${id}`),
  activate:   (id: string) => patch<ClientUser>(`${B}/clients/${id}/activate`),
  deactivate: (id: string) => patch<ClientUser>(`${B}/clients/${id}/deactivate`),
}

export const driverService = {
  getAll: () => get<DriverUser[]>(`${B}/drivers`),
  getOne: (id: string) => get<DriverUser>(`${B}/drivers/${id}`),
  create: (p: CreateDriverPayload) => post<DriverUser>(`${B}/drivers`, p),
  update: (id: string, p: UpdateDriverPayload) => patch<DriverUser>(`${B}/drivers/${id}`, p),
  remove: (id: string) => del(`${B}/drivers/${id}`),
  activate:   (id: string) => patch<DriverUser>(`${B}/drivers/${id}/activate`),
  deactivate: (id: string) => patch<DriverUser>(`${B}/drivers/${id}/deactivate`),
}

export const vendorService = {
  getAll: () => get<VendorUser[]>(`${B}/vendors`),
  getOne: (id: string) => get<VendorUser>(`${B}/vendors/${id}`),
  create: (p: CreateVendorPayload) => post<VendorUser>(`${B}/vendors`, p),
  update: (id: string, p: UpdateVendorPayload) => patch<VendorUser>(`${B}/vendors/${id}`, p),
  remove: (id: string) => del(`${B}/vendors/${id}`),
  activate:   (id: string) => patch<VendorUser>(`${B}/vendors/${id}/activate`),
  deactivate: (id: string) => patch<VendorUser>(`${B}/vendors/${id}/deactivate`),
}

export const accountantService = {
  getAll:      () => get<AdminUser[]>(`${B}/accountants`),
  getOne:      (id: string) => get<AdminUser>(`${B}/accountants/${id}`),
  create:      (p: CreateAccountantPayload) => post<AdminUser>(`${B}/accountants`, p),
  update:      (id: string, p: UpdateAccountantPayload) => patch<AdminUser>(`${B}/accountants/${id}`, p),
  remove:      (id: string) => del(`${B}/accountants/${id}`),
  activate:    (id: string) => patch<AdminUser>(`${B}/accountants/${id}/activate`),
  deactivate:  (id: string) => patch<AdminUser>(`${B}/accountants/${id}/deactivate`),
}

export const generalManagerService = {
  getAll: () => get<AdminUser[]>(`${B}/general-managers`),
  getOne: (id: string) => get<AdminUser>(`${B}/general-managers/${id}`),
  create: (p: CreateGeneralManagerPayload) => post<AdminUser>(`${B}/general-managers`, p),
  update: (id: string, p: UpdateGeneralManagerPayload) => patch<AdminUser>(`${B}/general-managers/${id}`, p),
  remove: (id: string) => del(`${B}/general-managers/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/general-managers/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/general-managers/${id}/deactivate`),
}

export const humanResourcesService = {
  getAll: () => get<AdminUser[]>(`${B}/human-resources`),
  getOne: (id: string) => get<AdminUser>(`${B}/human-resources/${id}`),
  create: (p: CreateHumanResourcesPayload) => post<AdminUser>(`${B}/human-resources`, p),
  update: (id: string, p: UpdateHumanResourcesPayload) => patch<AdminUser>(`${B}/human-resources/${id}`, p),
  remove: (id: string) => del(`${B}/human-resources/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/human-resources/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/human-resources/${id}/deactivate`),
}

export const fleetAdminService = {
  getAll: () => get<AdminUser[]>(`${B}/fleet-admins`),
  getOne: (id: string) => get<AdminUser>(`${B}/fleet-admins/${id}`),
  create: (p: CreateFleetAdminPayload) => post<AdminUser>(`${B}/fleet-admins`, p),
  update: (id: string, p: UpdateFleetAdminPayload) => patch<AdminUser>(`${B}/fleet-admins/${id}`, p),
  remove: (id: string) => del(`${B}/fleet-admins/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/fleet-admins/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/fleet-admins/${id}/deactivate`),
}

export const operationsAdminService = {
  getAll: () => get<AdminUser[]>(`${B}/operations-admins`),
  getOne: (id: string) => get<AdminUser>(`${B}/operations-admins/${id}`),
  create: (p: CreateOperationsAdminPayload) => post<AdminUser>(`${B}/operations-admins`, p),
  update: (id: string, p: UpdateOperationsAdminPayload) => patch<AdminUser>(`${B}/operations-admins/${id}`, p),
  remove: (id: string) => del(`${B}/operations-admins/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/operations-admins/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/operations-admins/${id}/deactivate`),
}

export const itAdminService = {
  getAll: () => get<AdminUser[]>(`${B}/it-admins`),
  getOne: (id: string) => get<AdminUser>(`${B}/it-admins/${id}`),
  create: (p: CreateITAdminPayload) => post<AdminUser>(`${B}/it-admins`, p),
  update: (id: string, p: UpdateITAdminPayload) => patch<AdminUser>(`${B}/it-admins/${id}`, p),
  remove: (id: string) => del(`${B}/it-admins/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/it-admins/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/it-admins/${id}/deactivate`),
}

export interface VehicleEligibility {
  can_drive_light_commercial: boolean
  can_drive_heavy_truck:      boolean
  can_drive_articulated:      boolean
  can_drive_bus:              boolean
}

export interface LicenseOCRResult {
  license_number:      string | null
  license_expiry:      string | null
  first_name:          string | null
  last_name:           string | null
  middle_name:         string | null
  suffix:              string | null
  dl_codes:            string[]
  restriction_codes:   string[]
  vehicle_eligibility: VehicleEligibility | null
}

export const ocrService = {
  scanLicense: async (file: File): Promise<LicenseOCRResult> => {
    const form = new FormData()
    form.append('image', file)
    const { data } = await proxyApi.post<ApiResponse<LicenseOCRResult>>(
      `${B}/drivers/scan-license`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return data.data
  },
}