import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@/app/lib/api/auth.api'

interface AuthStore {
  user: AuthUser | null
  setUser: (user: AuthUser) => void
  clearUser: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user:      null,
      setUser:   (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    {
      name: 'auth-user',

      partialize: (state) =>
        state.user
          ? {
              user: {
                user_id:    state.user.user_id,
                email:      state.user.email,
                username:   state.user.username,
                first_name: state.user.first_name,
                last_name:  state.user.last_name,
                role:    state.user.role,
                status:  state.user.status,
                clients: null,
              },
            }
          : { user: null },
    }
  )
)