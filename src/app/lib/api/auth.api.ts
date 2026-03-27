import axios, { AxiosInstance, AxiosError } from 'axios'

const authApi: AxiosInstance = axios.create({
  baseURL: process.env.NODE_ENV === 'production'
    ? '/proxy'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// ── CSRF ────────────────────────────────────────────────────────────────────

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

// Fetch (or refresh) the CSRF cookie from the server
let csrfInitialized = false
export async function initCsrf(): Promise<void> {
  if (csrfInitialized) return
  try {
    await authApi.get('/auth/csrf')
    csrfInitialized = true
  } catch {
    // Non-fatal — requests will proceed without the CSRF header
  }
}

// Attach CSRF header to every mutating request
authApi.interceptors.request.use(
  (config) => {
    const method = config.method?.toLowerCase() ?? ''
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      const token = getCsrfToken()
      if (token) {
        config.headers['X-CSRF-Token'] = token
      }
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error)
)

// ── Token refresh + queue ───────────────────────────────────────────────────

let isRefreshing = false

interface QueueEntry {
  resolve: () => void
  reject: (reason: unknown) => void
}

let failedQueue: QueueEntry[] = []

function processQueue(error: unknown): void {
  failedQueue.forEach((entry) => {
    if (error) {
      entry.reject(error)
    } else {
      entry.resolve()
    }
  })
  failedQueue = []
}

authApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean }

    // Only attempt refresh on 401, and never on the refresh/login endpoints themselves
    const url = originalRequest?.url ?? ''
    const isAuthEndpoint =
      url.includes('/auth/refresh') ||
      url.includes('/auth/verify-otp') ||
      url.includes('/auth/request-otp') ||
      url.includes('/auth/csrf')

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      // Queue concurrent requests while refresh is in flight
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
        await authApi.post('/auth/refresh')

        processQueue(null)
        isRefreshing = false

        return authApi(originalRequest!)
      } catch (refreshError) {
        processQueue(refreshError)
        isRefreshing = false
        failedQueue = []

        // Redirect to login — let the page unmount cleanly
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }

        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

// ── Exports ─────────────────────────────────────────────────────────────────

export interface AuthUser {
  user_id: string
  email: string
  username: string
  first_name: string | null
  last_name: string | null
  role: string
  status: string
}

export interface AuthResponse {
  user: AuthUser
  expiresAt: string
}

export async function requestOtp(email: string): Promise<void> {
  await authApi.post('/auth/request-otp', { email })
}

export async function verifyOtp(
  email: string,
  code: string,
  device_info?: string
): Promise<AuthResponse> {
  const { data } = await authApi.post('/auth/verify-otp', {
    email,
    code,
    device_info: device_info ?? getDeviceInfo(),
  })
  return data.data as AuthResponse
}

export async function refreshAccessToken(): Promise<void> {
  await authApi.post('/auth/refresh')
}

export async function logout(): Promise<void> {
  await authApi.post('/auth/logout')
}

export async function logoutAll(): Promise<void> {
  await authApi.post('/auth/logout-all')
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await authApi.get('/auth/me')
  return data.data as AuthUser
}

function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Unknown'
  return `${navigator.platform} — ${navigator.userAgent.split(' ').slice(-1)[0]}`
}

export default authApi