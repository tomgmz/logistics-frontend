import proxyApi from '@/app/lib/api/auth.api'
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
  UserStatus,
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

async function patch<T>(url: string, payload: unknown): Promise<T> {
  const { data } = await proxyApi.patch<ApiResponse<T>>(url, payload)
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
}

export const driverService = {
  getAll: () => get<DriverUser[]>(`${B}/drivers`),
  getOne: (id: string) => get<DriverUser>(`${B}/drivers/${id}`),
  create: (p: CreateDriverPayload) => post<DriverUser>(`${B}/drivers`, p),
  update: (id: string, p: UpdateDriverPayload) => patch<DriverUser>(`${B}/drivers/${id}`, p),
  remove: (id: string) => del(`${B}/drivers/${id}`),
}

export const vendorService = {
  getAll: () => get<VendorUser[]>(`${B}/vendors`),
  getOne: (id: string) => get<VendorUser>(`${B}/vendors/${id}`),
  create: (p: CreateVendorPayload) => post<VendorUser>(`${B}/vendors`, p),
  update: (id: string, p: UpdateVendorPayload) => patch<VendorUser>(`${B}/vendors/${id}`, p),
  remove: (id: string) => del(`${B}/vendors/${id}`),
}

export const accountantService = {
  getAll: () => get<AdminUser[]>(`${B}/accountants`),
  getOne: (id: string) => get<AdminUser>(`${B}/accountants/${id}`),
  create: (p: CreateAccountantPayload) => post<AdminUser>(`${B}/accountants`, p),
  update: (id: string, p: UpdateAccountantPayload) => patch<AdminUser>(`${B}/accountants/${id}`, p),
  remove: (id: string) => del(`${B}/accountants/${id}`),
}

export const generalManagerService = {
  getAll: () => get<AdminUser[]>(`${B}/general-managers`),
  getOne: (id: string) => get<AdminUser>(`${B}/general-managers/${id}`),
  create: (p: CreateGeneralManagerPayload) => post<AdminUser>(`${B}/general-managers`, p),
  update: (id: string, p: UpdateGeneralManagerPayload) => patch<AdminUser>(`${B}/general-managers/${id}`, p),
  remove: (id: string) => del(`${B}/general-managers/${id}`),
}

export const humanResourcesService = {
  getAll: () => get<AdminUser[]>(`${B}/human-resources`),
  getOne: (id: string) => get<AdminUser>(`${B}/human-resources/${id}`),
  create: (p: CreateHumanResourcesPayload) => post<AdminUser>(`${B}/human-resources`, p),
  update: (id: string, p: UpdateHumanResourcesPayload) => patch<AdminUser>(`${B}/human-resources/${id}`, p),
  remove: (id: string) => del(`${B}/human-resources/${id}`),
}

export const fleetAdminService = {
  getAll: () => get<AdminUser[]>(`${B}/fleet-admins`),
  getOne: (id: string) => get<AdminUser>(`${B}/fleet-admins/${id}`),
  create: (p: CreateFleetAdminPayload) => post<AdminUser>(`${B}/fleet-admins`, p),
  update: (id: string, p: UpdateFleetAdminPayload) => patch<AdminUser>(`${B}/fleet-admins/${id}`, p),
  remove: (id: string) => del(`${B}/fleet-admins/${id}`),
}

export const operationsAdminService = {
  getAll: () => get<AdminUser[]>(`${B}/operations-admins`),
  getOne: (id: string) => get<AdminUser>(`${B}/operations-admins/${id}`),
  create: (p: CreateOperationsAdminPayload) => post<AdminUser>(`${B}/operations-admins`, p),
  update: (id: string, p: UpdateOperationsAdminPayload) => patch<AdminUser>(`${B}/operations-admins/${id}`, p),
  remove: (id: string) => del(`${B}/operations-admins/${id}`),
}

export const itAdminService = {
  getAll: () => get<AdminUser[]>(`${B}/it-admins`),
  getOne: (id: string) => get<AdminUser>(`${B}/it-admins/${id}`),
  create: (p: CreateITAdminPayload) => post<AdminUser>(`${B}/it-admins`, p),
  update: (id: string, p: UpdateITAdminPayload) => patch<AdminUser>(`${B}/it-admins/${id}`, p),
  remove: (id: string) => del(`${B}/it-admins/${id}`),
}