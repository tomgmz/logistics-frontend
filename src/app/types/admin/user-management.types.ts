export type AdminRole =
  | 'admin'
  | 'it_admin'
  | 'general_manager'
  | 'fleet_admin'
  | 'operations_admin'
  | 'human_resources'
  | 'accountant'

export type UserRole = AdminRole | 'driver' | 'client' | 'vendor'
export type UserStatus = 'active' | 'inactive' | 'deactivated' | 'archived' | 'permanently_locked'
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
  | 'it-admins'

export interface BaseUser {
  user_id: string
  email: string
  phone: string | null
  role: UserRole
  status: UserStatus
  first_name: string | null
  last_name: string | null
  middle_name: string | null
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
    landline: string | null
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
    vendor_type: 'individual' | 'company'
    company_name: string | null
    business_permit: string | null
    landline: string | null
  } | null
}

export type AnyUser = AdminUser | ClientUser | DriverUser | VendorUser

export interface CreateAdminPayload {
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  suffix?: string
  role: AdminRole
}

export interface CreateClientPayload {
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
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  vendor_type: 'individual' | 'company'
  company_name?: string
  business_permit?: string
}

export interface CreateAccountantPayload {
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
}

export interface CreateGeneralManagerPayload {
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
}

export interface CreateHumanResourcesPayload {
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  suffix?: string
}

export interface CreateFleetAdminPayload {
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  suffix?: string
}

export interface CreateOperationsAdminPayload {
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  middle_name?: string
  suffix?: string
}

export interface CreateITAdminPayload {
  email:           string
  phone?:          string
  first_name?:     string
  last_name?:      string
  middle_name?: string
  suffix?:         string
  created_by?:     string | null
}

export type UpdateAdminPayload           = Partial<Omit<CreateAdminPayload, 'password'>>
export type UpdateClientPayload          = Partial<Omit<CreateClientPayload, 'password'>>
export type UpdateDriverPayload          = Partial<Omit<CreateDriverPayload, 'password'>>
export type UpdateVendorPayload          = Partial<Omit<CreateVendorPayload, 'password'>>
export type UpdateAccountantPayload      = Partial<Omit<CreateAccountantPayload, 'password'>>
export type UpdateGeneralManagerPayload  = Partial<Omit<CreateGeneralManagerPayload, 'password'>>
export type UpdateHumanResourcesPayload  = Partial<Omit<CreateHumanResourcesPayload, 'password'>>
export type UpdateFleetAdminPayload      = Partial<Omit<CreateFleetAdminPayload, 'password'>>
export type UpdateOperationsAdminPayload = Partial<Omit<CreateOperationsAdminPayload, 'password'>>
export type UpdateITAdminPayload         = Partial<CreateITAdminPayload> & {
  status?: UserStatus
}