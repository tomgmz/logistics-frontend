import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import type { DriverUser } from '@/app/types/admin/user-management.types'

/**
 * App access for a vendor-supplied driver.
 *
 * Only a few actions, because only these apply to a passkey-only account: look
 * at it, send a fresh setup link, take the access away, or give it back. There is no password
 * to reset and no profile worth editing — the delivery's vendor snapshot is the
 * record of who drove, and it outlives the access.
 */

interface ApiResponse<T> {
  status: string
  data: T
}

export interface ExternalDriverAccess {
  passkey_count:     number
  last_used_at:      string | null
  invite_pending:    boolean
  invite_expires_at: string | null
  enrolled:          boolean
  /** False once access has been revoked; only "Restore access" applies then. */
  account_active:    boolean
}

/** A vendor driver as User Management lists them: the account plus its access state. */
export type VendorDriverUser = DriverUser & { access: ExternalDriverAccess }

export const externalDriverService = {
  async list(): Promise<VendorDriverUser[]> {
    const { data } = await proxyApi.get<ApiResponse<VendorDriverUser[]>>('/admin/external-drivers')
    return data.data
  },

  async getAccess(userId: string): Promise<ExternalDriverAccess> {
    const { data } = await proxyApi.get<ApiResponse<ExternalDriverAccess>>(
      `/admin/external-drivers/${userId}/access`,
    )
    return data.data
  },

  /** Sends a new setup link. Leaves any working passkey alone — this is for a replaced phone. */
  async reinvite(userId: string): Promise<void> {
    await initCsrf()
    await proxyApi.post(`/admin/external-drivers/${userId}/reinvite`)
  },

  /** Revokes every passkey, kills the live session, and deactivates the account. */
  async revoke(userId: string, reason?: string): Promise<{ credentialsRevoked: number }> {
    await initCsrf()
    const { data } = await proxyApi.post<ApiResponse<{ credentialsRevoked: number }>>(
      `/admin/external-drivers/${userId}/revoke`,
      { reason },
    )
    return data.data
  },

  /** Reactivates a revoked account and emails a new setup link. Old passkeys stay dead. */
  async restore(userId: string): Promise<void> {
    await initCsrf()
    await proxyApi.post(`/admin/external-drivers/${userId}/restore`)
  },
}
