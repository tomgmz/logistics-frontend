import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthUser {
  user_id: string
  email: string
  username: string
  first_name: string | null
  last_name: string | null
  role: string
  status: string
}

interface AuthStore {
  user: AuthUser | null
  setUser: (user: AuthUser) => void
  clearUser: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    {
      name: 'auth-user',
    }
  )
)