export type AdminRole =
  | 'super_admin'
  | 'it_admin'
  | 'general_manager'
  | 'fleet_admin'
  | 'operations_admin'
  | 'human_resources'
  | 'accountant'

export type UserRole = AdminRole | 'driver' | 'client' | 'vendor'
export type UserStatus = 'active' | 'inactive' | 'archived' | 'permanently_locked'
export type DriverAvailability = 'available' | 'assigned' | 'on_leave' | 'inactive'

export type UserTab =
  | 'clients'
  | 'drivers'
  | 'vendors'
  | 'accountants'
  | 'general-managers'
  | 'human-resources'
  | 'fleet-admins'
  | 'operations-admins'

export interface BaseUser {
  user_id: string
  username: string
  email: string
  phone: string | null
  role: UserRole
  status: UserStatus
  first_name: string | null
  last_name: string | null
  middle_initial: string | null
  suffix: string | null
  created_at: string
  updated_at: string
  last_login_at: string | null
  last_login_ip: string | null
  failed_login_attempts: number
  lockup_count: number
}

export interface AdminUser extends BaseUser {
  role: AdminRole
}

export interface ClientUser extends BaseUser {
  role: 'client'
  clients: {
    client_id: string
    company_name: string | null
    billing_address: string | null
    payment_terms: number | null
  } | null
}

export interface DriverUser extends BaseUser {
  role: 'driver'
  drivers: {
    driver_id: string
    license_number: string
    license_expiry: string
    status: DriverAvailability
    is_vendor_driver: boolean
    vendor_id: string | null
  } | null
}

export interface VendorUser extends BaseUser {
  role: 'vendor'
  vendors: {
    vendor_id: string
    subcontractor_type: 'individual' | 'company'
    company_name: string | null
    business_permit: string | null
  } | null
}

export type AnyUser = AdminUser | ClientUser | DriverUser | VendorUser

// ── Payloads ──────────────────────────────────────────────────────────────────

export interface CreateAdminPayload {
  username: string
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  middle_initial?: string
  suffix?: string
  role: AdminRole
}

export interface CreateClientPayload {
  username: string
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  company_name?: string
  billing_address?: string
  payment_terms?: number
}

export interface CreateDriverPayload {
  username: string
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  license_number: string
  license_expiry: string
  is_vendor_driver?: boolean
  vendor_id?: string
}

export interface CreateVendorPayload {
  username: string
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  subcontractor_type: 'individual' | 'company'
  company_name?: string
  business_permit?: string
}

export interface CreateAccountantPayload {
  username: string
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
}

export interface CreateGeneralManagerPayload {
  username: string
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
}

export interface CreateHumanResourcesPayload {
  username: string
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  middle_initial?: string
  suffix?: string
}

export interface CreateFleetAdminPayload {
  username: string
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  middle_initial?: string
  suffix?: string
}

export interface CreateOperationsAdminPayload {
  username: string
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  middle_initial?: string
  suffix?: string
}

export type UpdateAdminPayload            = Partial<Omit<CreateAdminPayload, 'password'>>
export type UpdateClientPayload           = Partial<Omit<CreateClientPayload, 'password'>>
export type UpdateDriverPayload           = Partial<Omit<CreateDriverPayload, 'password'>>
export type UpdateVendorPayload           = Partial<Omit<CreateVendorPayload, 'password'>>
export type UpdateAccountantPayload       = Partial<Omit<CreateAccountantPayload, 'password'>>
export type UpdateGeneralManagerPayload   = Partial<Omit<CreateGeneralManagerPayload, 'password'>>
export type UpdateHumanResourcesPayload   = Partial<Omit<CreateHumanResourcesPayload, 'password'>>
export type UpdateFleetAdminPayload       = Partial<Omit<CreateFleetAdminPayload, 'password'>>
export type UpdateOperationsAdminPayload  = Partial<Omit<CreateOperationsAdminPayload, 'password'>>