export type AdminRole =
  | 'admin'
  | 'it_admin'
  | 'general_manager'
  | 'fleet_manager'
  | 'operations_manager'

export type UserRole = AdminRole | 'driver' | 'client'

/**
 * Which reverse billing cycle a client's billing periods are cut on, taken from
 * their contract and fixed at account creation. It is not a payment term: the
 * 30/45/60 day term is chosen per booking on the booking form.
 */
export type UserStatus = 'active' | 'inactive' | 'deactivated' | 'archived' | 'permanently_locked'
/**
 * A driver's own availability for delivery work. A new driver starts
 * 'unavailable' and opts in from the mobile app; 'assigned' is system-owned and
 * set while they are out on a delivery. Only 'available' drivers can be picked
 * by operations.
 */
export type DriverAvailability = 'available' | 'unavailable' | 'assigned' | 'on_leave' | 'inactive'

export type UserTab =
  | 'admins'
  | 'clients'
  | 'drivers'
  | 'general-managers'
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
    license_image_url: string | null
    profile_image_url: string | null
  } | null
}

export type AnyUser = AdminUser | ClientUser | DriverUser

export interface CreateAdminPayload {
  email:        string
  phone?:       string
  first_name?:  string
  last_name?:   string
  middle_name?: string
  suffix?:      string
  created_by?:  string | null
}

export interface CreateClientPayload {
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  company_name?: string
  billing_address?: string
}

export interface CreateDriverPayload {
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
  license_number: string
  license_expiry: string
}

export interface CreateGeneralManagerPayload {
  email: string
  password: string
  phone?: string
  first_name?: string
  last_name?: string
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
  email:        string
  phone?:       string
  first_name?:  string
  last_name?:   string
  middle_name?: string
  suffix?:      string
  created_by?:  string | null
}

export type UpdateAdminPayload           = Partial<Omit<CreateAdminPayload, 'password'>>
export type UpdateClientPayload          = Partial<Omit<CreateClientPayload, 'password'>>
export type UpdateDriverPayload          = Partial<Omit<CreateDriverPayload, 'password'>>
export type UpdateGeneralManagerPayload  = Partial<Omit<CreateGeneralManagerPayload, 'password'>>
export type UpdateFleetAdminPayload      = Partial<Omit<CreateFleetAdminPayload, 'password'>>
export type UpdateOperationsAdminPayload = Partial<Omit<CreateOperationsAdminPayload, 'password'>>
export type UpdateITAdminPayload         = Partial<CreateITAdminPayload> & {
  status?: UserStatus
}