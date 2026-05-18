import axios, { AxiosInstance, AxiosError } from 'axios'
import { getApiUrl } from './api-url'
import { AuthStatusResponse } from '@/app/types/auth/auth.types'

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

proxyApi.interceptors.request.use(
  (config) => {
    const method = config.method?.toLowerCase() ?? ''
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
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

function broadcastLogout(): void {
  if (typeof window === 'undefined') return
  const ch = new BroadcastChannel('auth_sync')
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
        if (typeof window !== 'undefined') window.location.href = '/'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export interface AuthUser {
  user_id:    string
  email:      string
  first_name: string | null
  last_name:  string | null
  role:       string
  status:     string
  must_change_password: boolean
  clients?: {
    client_id:       string
    company_name:    string | null
    billing_address: string | null
    payment_terms:   number | null
  } | null
  drivers?: {
    driver_id:        string
    license_number:   string
    license_expiry:   string
    status:           string
    is_vendor_driver: boolean
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