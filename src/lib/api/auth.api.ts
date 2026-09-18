import axios, { AxiosInstance, AxiosError } from 'axios'
import { getApiUrl } from './api-url'
import { AuthStatusResponse } from '@/app/types/auth/auth.types'
import { useAuthStore } from '@/lib/store/auth.store'
import { goHomeSignedOut } from '@/lib/auth-redirect'

const directApi: AxiosInstance = axios.create({
  baseURL: getApiUrl(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

const proxyApi: AxiosInstance = axios.create({
  baseURL: '/api/proxy',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

const nextApi: AxiosInstance = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

let csrfPromise: Promise<void> | null = null

export async function initCsrf(): Promise<void> {
  if (getCsrfToken()) return
  if (csrfPromise) return csrfPromise

  csrfPromise = proxyApi
    .get('/auth/csrf')
    .then(() => {})
    .catch((err) => {
      csrfPromise = null
      throw err
    })

  return csrfPromise
}

/**
 * Attach the CSRF header to every write, fetching a token first if we have none.
 *
 * This used to attach the header only when the cookie already happened to exist,
 * leaving each call site responsible for calling `initCsrf()` beforehand — and
 * `createBooking`, among others, did not. That was survivable only because the
 * API was not checking the header at all. Now that it is, the guarantee has to
 * live here, where no new call site can forget it.
 */
proxyApi.interceptors.request.use(
  async (config) => {
    const method = config.method?.toLowerCase() ?? ''
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      if (!getCsrfToken()) {
        // Best effort: a failure here should surface as the real request's
        // error, not as an opaque one from the token fetch.
        await initCsrf().catch(() => {})
      }
      const token = getCsrfToken()
      if (token) config.headers['X-CSRF-Token'] = token
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error)
)

let isRefreshing = false

interface QueueEntry {
  resolve: () => void
  reject:  (reason: unknown) => void
}

let failedQueue: QueueEntry[] = []

function processQueue(error: unknown): void {
  failedQueue.forEach((entry) => {
    if (error) entry.reject(error)
    else entry.resolve()
  })
  failedQueue = []
}

/**
 * The channel is per user — `auth_sync_<user_id>` — because that is what
 * AuthRehydrator subscribes to. Posting to a bare 'auth_sync' reached nobody, so
 * a session that died here never cleared the store in this tab or any other.
 */
function broadcastLogout(): void {
  if (typeof window === 'undefined') return
  const userId = useAuthStore.getState().user?.user_id
  if (!userId) return
  const ch = new BroadcastChannel(`auth_sync_${userId}`)
  ch.postMessage({ type: 'LOGOUT' })
  ch.close()
}

proxyApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean }

    const url = originalRequest?.url ?? ''
    const isExcluded =
      url.includes('/auth/refresh')     ||
      url.includes('/auth/verify-otp')  ||
      url.includes('/auth/request-otp') ||
      url.includes('/auth/login')       ||
      url.includes('/auth/status')      ||
      url.includes('/auth/csrf')        ||
      url.includes('/auth/logout')      ||
      url.includes('/api/auth/me')

    if (error.response?.status === 401 && !originalRequest?._retry && !isExcluded) {
      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then(() => proxyApi(originalRequest!))
          .catch((err) => Promise.reject(err))
      }

      originalRequest!._retry = true
      isRefreshing = true

      try {
        await nextApi.post('/api/auth/refresh')
        processQueue(null)
        isRefreshing = false
        return proxyApi(originalRequest!)
      } catch (refreshError) {
        processQueue(refreshError)
        isRefreshing = false
        failedQueue = []
        broadcastLogout()
        goHomeSignedOut()
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export interface ModulePermission {
  module_key: string
  can_view:   boolean
  can_create: boolean
  can_edit:   boolean
  can_delete: boolean
  can_export: boolean
}

export interface AuthUser {
  user_id:    string
  email:      string
  first_name: string | null
  last_name:  string | null
  role:       string
  status:     string
  must_change_password: boolean
  // True for an accountant the IT admin appointed to stand in for the general
  // manager on booking approvals — they get the GM's approve/reject controls.
  is_gm_proxy?: boolean
  // True for the primary administrator account (the earliest-created admin),
  // which is never permission-restricted and is the only one allowed to hand the
  // IT Admin role to a successor. The API enforces that independently; this only
  // keeps a button that would 403 out of everyone else's way.
  is_root_admin?: boolean
  module_permissions?: ModulePermission[]
  clients?: {
    client_id:       string
    company_name:    string | null
    billing_address: string | null
    billing_mode:    'weekly' | 'monthly' | null
  } | null
  drivers?: {
    driver_id:        string
    license_number:   string
    license_expiry:   string
    status:           string
  } | null
}

export interface AuthResponse {
  user:         AuthUser
  expiresAt:    string
  accessToken:  string
  refreshToken: string
  portalUrl:    string
}

export async function getAuthStatus(email: string): Promise<AuthStatusResponse> {
  const { data } = await directApi.post<{ status: string; data: AuthStatusResponse }>(
    '/auth/status',
    { email }
  )
  return data.data
}

export async function requestOtp(email: string): Promise<void> {
  await directApi.post('/auth/request-otp', { email })
}

export async function verifyOtp(
  email:        string,
  code:         string,
  device_info?: string
): Promise<AuthResponse> {
  const { data } = await nextApi.post('/api/auth/verify-otp', {
    email,
    code,
    device_info: device_info ?? getDeviceInfo(),
    platform:    'web',
  })
  return data.data as AuthResponse
}

export async function loginWithPassword(
  email:        string,
  password:     string,
  device_info?: string
): Promise<AuthResponse> {
  const { data } = await nextApi.post('/api/auth/login', {
    email,
    password,
    device_info: device_info ?? getDeviceInfo(),
    platform:    'web',
  })
  return data.data as AuthResponse
}

export async function changePassword(password: string): Promise<void> {
  await proxyApi.post('/auth/change-password', { password })
}

/**
 * Ask an administrator to send a reset link.
 *
 * Resolves the same way whether or not the address has an account — the API
 * answers neutrally on purpose, so the UI must not try to infer anything from it.
 * Goes direct (like getAuthStatus/requestOtp) rather than through the Next route
 * handlers: there is no session and no cookie to set.
 */
export async function requestPasswordReset(email: string): Promise<string> {
  const { data } = await directApi.post<{ status: string; message: string }>(
    '/auth/forgot-password',
    { email }
  )
  return data.message
}

/**
 * The IT Admin's self-service reset: ask for a 6-digit code by email.
 *
 * Everyone else's reset goes through an admin queue. The IT Admin's cannot -
 * the queue they would be waiting on is the one they staff - so they prove
 * control of the registered mailbox with a code instead.
 *
 * Resolves the same way for an address that is not an IT Admin's as for one that
 * is, by design. The UI must not read anything into it.
 */
export async function requestItAdminResetOtp(email: string): Promise<string> {
  const { data } = await directApi.post<{ status: string; message: string }>(
    '/auth/it-admin/forgot-password',
    { email }
  )
  return data.message
}

export interface ResetOtpVerification {
  token:      string
  expires_at: string
}

/**
 * Trade a correct code for a one-time reset token.
 *
 * The token is the same one an emailed link would have carried, so the caller
 * carries on to /reset-password exactly as a link recipient does - the code never
 * travels alongside the new password.
 */
export async function verifyItAdminResetOtp(
  email: string,
  code:  string,
): Promise<ResetOtpVerification> {
  const { data } = await directApi.post<{ status: string; data: ResetOtpVerification }>(
    '/auth/it-admin/verify-otp',
    { email, code }
  )
  return data.data
}

export interface ResetTokenStatus {
  valid:       boolean
  email?:      string
  expires_at?: string
}

export async function verifyResetToken(token: string): Promise<ResetTokenStatus> {
  const { data } = await directApi.post<{ status: string; data: ResetTokenStatus }>(
    '/auth/reset-password/verify',
    { token }
  )
  return data.data
}

export async function completePasswordReset(token: string, password: string): Promise<void> {
  await directApi.post('/auth/reset-password', { token, password })
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await nextApi.get('/api/auth/me')
  return data.data as AuthUser
}

export async function logout(): Promise<void> {
  await nextApi.post('/api/auth/logout')
}

export async function logoutAll(): Promise<void> {
  await nextApi.post('/api/auth/logout-all')
}

function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Unknown'
  return `${navigator.platform} — ${navigator.userAgent.split(' ').slice(-1)[0]}`
}

export default proxyApi