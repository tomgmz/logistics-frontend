import proxyApi from '@/lib/api/auth.api'
import type { PagedResponse, PageRequest } from '@/lib/hooks/useServerTable'
import type {
  AdminUser,
  CreateAdminPayload,
  UpdateAdminPayload,
  ClientUser,
  DriverUser,
  AnyUser,
  CreateClientPayload,
  UpdateClientPayload,
  CreateDriverPayload,
  UpdateDriverPayload,
  CreateGeneralManagerPayload,
  UpdateGeneralManagerPayload,
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

  /**
   * One page of a User Management tab, built, filtered and searched on the
   * server (GET /admin/user-directory). `filters` is the Filters panel's rules
   * as JSON; `meta.licenseFlagCount` counts the whole tab's roster.
   */
  getDirectory: (params: PageRequest & { tab: string; filters?: string; search?: string }) =>
    proxyApi
      .get<PagedResponse<AnyUser, { licenseFlagCount: number }>>(`${B}/user-directory`, { params })
      .then((r) => ({ data: r.data.data, meta: r.data.meta })),

    getStats: (roles?: string) =>
        proxyApi
          .get<ApiResponse<UserStatsResponse>>(`${B}/users/stats`, { params: roles ? { roles } : undefined })
          .then((r) => r.data.data),
}

export const adminService = {
  getAll:     () => get<AdminUser[]>(`${B}/admins`),
  getOne:     (id: string) => get<AdminUser>(`${B}/admins/${id}`),
  create:     (p: CreateAdminPayload) => post<AdminUser>(`${B}/admins`, p),
  update:     (id: string, p: UpdateAdminPayload) => patch<AdminUser>(`${B}/admins/${id}`, p),
  remove:     (id: string) => del(`${B}/admins/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/admins/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/admins/${id}/deactivate`),
  // Archived ("deleted") account back as active; see restoreArchivedUser on the API.
  restore:    (id: string) => post<AdminUser>(`${B}/admins/${id}/restore`, {}),
}

export const clientService = {
  getAll: () => get<ClientUser[]>(`${B}/clients`),
  getOne: (id: string) => get<ClientUser>(`${B}/clients/${id}`),
  create: (p: CreateClientPayload) => post<ClientUser>(`${B}/clients`, p),
  update: (id: string, p: UpdateClientPayload) => patch<ClientUser>(`${B}/clients/${id}`, p),
  remove: (id: string) => del(`${B}/clients/${id}`),
  activate:   (id: string) => patch<ClientUser>(`${B}/clients/${id}/activate`),
  deactivate: (id: string) => patch<ClientUser>(`${B}/clients/${id}/deactivate`),
  restore:    (id: string) => post<ClientUser>(`${B}/clients/${id}/restore`, {}),
}

export const driverService = {
  getAll: () => get<DriverUser[]>(`${B}/drivers`),
  // Who can be crewed onto a booking scheduled for `date`. The driver calendar
  // decides that, so it is a per-booking question and cannot be answered from
  // the full roster — hence a fetch rather than a filter over getAll(). Pass the
  // driver already on the booking so editing an assignment never drops them.
  // Pass the main and second driver already on the booking, so editing it never
  // drops either of them.
  getAssignable: (date: string, currentDriverIds: (string | null | undefined)[] = []) => {
    const current = currentDriverIds.filter(Boolean).join(',')
    return get<DriverUser[]>(
      `${B}/drivers/assignable?date=${encodeURIComponent(date)}` +
      (current ? `&current_driver_id=${encodeURIComponent(current)}` : ''),
    )
  },
  getOne: (id: string) => get<DriverUser>(`${B}/drivers/${id}`),
  create: (p: CreateDriverPayload) => post<DriverUser>(`${B}/drivers`, p),
  update: (id: string, p: UpdateDriverPayload) => patch<DriverUser>(`${B}/drivers/${id}`, p),
  remove: (id: string) => del(`${B}/drivers/${id}`),
  activate:   (id: string) => patch<DriverUser>(`${B}/drivers/${id}/activate`),
  deactivate: (id: string) => patch<DriverUser>(`${B}/drivers/${id}/deactivate`),
  restore:    (id: string) => post<DriverUser>(`${B}/drivers/${id}/restore`, {}),
}

export const generalManagerService = {
  getAll: () => get<AdminUser[]>(`${B}/general-managers`),
  getOne: (id: string) => get<AdminUser>(`${B}/general-managers/${id}`),
  create: (p: CreateGeneralManagerPayload) => post<AdminUser>(`${B}/general-managers`, p),
  update: (id: string, p: UpdateGeneralManagerPayload) => patch<AdminUser>(`${B}/general-managers/${id}`, p),
  remove: (id: string) => del(`${B}/general-managers/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/general-managers/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/general-managers/${id}/deactivate`),
  restore:    (id: string) => post<AdminUser>(`${B}/general-managers/${id}/restore`, {}),
}

export const fleetAdminService = {
  getAll: () => get<AdminUser[]>(`${B}/fleet-admins`),
  getOne: (id: string) => get<AdminUser>(`${B}/fleet-admins/${id}`),
  create: (p: CreateFleetAdminPayload) => post<AdminUser>(`${B}/fleet-admins`, p),
  update: (id: string, p: UpdateFleetAdminPayload) => patch<AdminUser>(`${B}/fleet-admins/${id}`, p),
  remove: (id: string) => del(`${B}/fleet-admins/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/fleet-admins/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/fleet-admins/${id}/deactivate`),
  restore:    (id: string) => post<AdminUser>(`${B}/fleet-admins/${id}/restore`, {}),
}

export const operationsAdminService = {
  getAll: () => get<AdminUser[]>(`${B}/operations-admins`),
  getOne: (id: string) => get<AdminUser>(`${B}/operations-admins/${id}`),
  create: (p: CreateOperationsAdminPayload) => post<AdminUser>(`${B}/operations-admins`, p),
  update: (id: string, p: UpdateOperationsAdminPayload) => patch<AdminUser>(`${B}/operations-admins/${id}`, p),
  remove: (id: string) => del(`${B}/operations-admins/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/operations-admins/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/operations-admins/${id}/deactivate`),
  restore:    (id: string) => post<AdminUser>(`${B}/operations-admins/${id}/restore`, {}),
}

// IT Administrators are the IT Administrator's own business. A new one is never
// created directly: only through the handover below (2026-10-25).
export const itAdminService = {
  getAll: () => get<AdminUser[]>(`${B}/it-admins`),
  getOne: (id: string) => get<AdminUser>(`${B}/it-admins/${id}`),
  update: (id: string, p: UpdateITAdminPayload) => patch<AdminUser>(`${B}/it-admins/${id}`, p),
  remove: (id: string) => del(`${B}/it-admins/${id}`),
  activate:   (id: string) => patch<AdminUser>(`${B}/it-admins/${id}/activate`),
  deactivate: (id: string) => patch<AdminUser>(`${B}/it-admins/${id}/deactivate`),
  restore:    (id: string) => post<AdminUser>(`${B}/it-admins/${id}/restore`, {}),

  /** The signed-in IT Admin's place in a handover. */
  handoverStatus: () => get<ITAdminHandoverStatus>(`${B}/it-admins/handover`),
  /** Start the 30-day render; with `successor`, also add them now. */
  startHandover: (p: { reason: string; successor?: ITAdminSuccessorPayload | null }) =>
    post<unknown>(`${B}/it-admins/handover/start`, p),
  /** Add the replacement later (an account with an emailed temporary password). */
  addSuccessor: (p: ITAdminSuccessorPayload) => post<AdminUser>(`${B}/it-admins/handover/successor`, p),
  /** A new temporary password for the replacement, emailed again. */
  resendSuccessor: () => post<unknown>(`${B}/it-admins/handover/successor/resend`, {}),
  /** Archive the unconfirmed replacement so a different one can be added. */
  replaceSuccessor: () => del(`${B}/it-admins/handover/successor`),
  /** Stop the handover before anyone confirmed; the caller keeps the role. */
  cancelHandover: () => post<unknown>(`${B}/it-admins/handover/cancel`, {}),
}

/** The replacement IT Administrator's details. */
export type ITAdminSuccessorPayload = Omit<CreateITAdminPayload, 'created_by'>

export interface ITAdminHandoverStatus {
  render_days: number
  /** The caller's handover in progress, or null while they simply hold the role. */
  handover: {
    handover_id:   string
    reason:        string
    started_at:    string
    /** The 30-day target. Past it the render is overdue; nothing closes on its own. */
    render_due_at: string
    overdue:       boolean
    /** Added and waiting to set their password; null until one is added. */
    successor: {
      user_id: string; email: string; first_name: string | null; last_name: string | null
      temp_password_expires_at: string | null
    } | null
  } | null
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
  // Name words whose "N" the scan was unsure of — it may be an Ñ with a worn tilde.
  name_n_checks?:      { field: 'first_name' | 'last_name' | 'middle_name'; word: string; suggested: string }[]
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