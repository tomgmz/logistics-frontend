import axios, { AxiosInstance, AxiosError } from 'axios'

const api: AxiosInstance = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

import { getApiUrl } from './api-url'

const authApi: AxiosInstance = axios.create({
  baseURL: getApiUrl(),
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

  csrfPromise = authApi
    .get('/auth/csrf')
    .then(() => {})
    .catch((err) => {
      csrfPromise = null
      throw err
    })

  return csrfPromise
}

authApi.interceptors.request.use(
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

authApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean }

    const url = originalRequest?.url ?? ''
    const isAuthEndpoint =
      url.includes('/auth/refresh')     ||
      url.includes('/auth/verify-otp')  ||
      url.includes('/auth/request-otp') ||
      url.includes('/auth/csrf')

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise<void>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then(() => authApi(originalRequest!))
          .catch((err) => Promise.reject(err))
      }

      originalRequest!._retry = true
      isRefreshing = true

      try {
        await api.post('/api/auth/refresh')
        processQueue(null)
        isRefreshing = false
        return authApi(originalRequest!)
      } catch (refreshError) {
        processQueue(refreshError)
        isRefreshing = false
        failedQueue = []
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
  username:   string
  first_name: string | null
  last_name:  string | null
  role:       string
  status:     string
  clients?: {
    client_id:       string
    company_name:    string | null
    billing_address: string | null
    payment_terms:   number | null
  } | null
}

export interface AuthResponse {
  user:      AuthUser
  expiresAt: string
}

export async function requestOtp(email: string): Promise<void> {
  await authApi.post('/auth/request-otp', { email })
}

export async function verifyOtp(
  email:        string,
  code:         string,
  device_info?: string
): Promise<AuthResponse> {
  const { data } = await api.post('/api/auth/verify-otp', {
    email,
    code,
    device_info: device_info ?? getDeviceInfo(),
  })
  return data.data as AuthResponse
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get('/api/auth/me')
  return data.data as AuthUser
}

export async function logout(): Promise<void> {
  await authApi.post('/auth/logout')
}

export async function logoutAll(): Promise<void> {
  await authApi.post('/auth/logout-all')
}

function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Unknown'
  return `${navigator.platform} — ${navigator.userAgent.split(' ').slice(-1)[0]}`
}

export default authApi