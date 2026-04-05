import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@/app/lib/api/auth.api'

interface AuthStore {
  user:           AuthUser | null
  hasHydrated:    boolean
  setUser:        (user: AuthUser) => void
  clearUser:      () => void
  setHasHydrated: (val: boolean) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user:           null,
      hasHydrated:    false,
      setUser:        (user) => set({ user }),
      clearUser:      () => set({ user: null }),
      setHasHydrated: (val) => set({ hasHydrated: val }),
    }),
    {
      name: 'auth-user',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      partialize: (state) =>
        state.user
          ? {
              user: {
                user_id:    state.user.user_id,
                email:      state.user.email,
                username:   state.user.username,
                first_name: state.user.first_name,
                last_name:  state.user.last_name,
                role:       state.user.role,
                status:     state.user.status,
                clients:    state.user.clients ?? null,  // ← persist clients
              },
            }
          : { user: null },
    }
  )
)