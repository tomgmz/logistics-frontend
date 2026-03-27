import axios, { AxiosInstance, AxiosError } from 'axios'

const authApi: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

//get csrf tokjen from cookie
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null

  const match = document.cookie.match(/csrf_token=([^;]+)/)
  return match ? match[1] : null
}

// Add CSRF token to all state-changing requests
authApi.interceptors.request.use(
  (config) => {
    if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
      const csrfToken = getCsrfToken()
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken
      }
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error)
)

let isRefreshing = false

interface QueueEntry {
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}

let failedQueue: QueueEntry[] = []

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })

  failedQueue = []
}

//refresh access tokens on 401 errors
authApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest?._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then(() => authApi(originalRequest!))
          .catch(err => Promise.reject(err))
      }

      originalRequest!._retry = true
      isRefreshing = true

      try {
        await authApi.post('/auth/refresh')

        isRefreshing = false
        processQueue(null, 'success')

        return authApi(originalRequest!)
      } catch (refreshError) {
        isRefreshing = false
        processQueue(refreshError as AxiosError, null)

        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }

        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

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

//request otp
export async function requestOtp(email: string): Promise<void> {
  await authApi.post('/auth/request-otp', { email })
}

//verify otp and login
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

//refresh token
export async function refreshAccessToken(): Promise<void> {
  await authApi.post('/auth/refresh')
}

//logout and clear cookies server side
export async function logout(): Promise<void> {
  await authApi.post('/auth/logout')
}

//logout from all devices
export async function logoutAll(): Promise<void> {
  await authApi.post('/auth/logout-all')
}
//get current user info
export async function getMe(): Promise<AuthUser> {
  const { data } = await authApi.get('/auth/me')
  return data.data as AuthUser
}
//helpers

function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Unknown'
  return `${navigator.platform} — ${navigator.userAgent.split(' ').slice(-1)[0]}`
}
