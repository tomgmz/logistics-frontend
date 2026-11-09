'use client'

import { create } from 'zustand'
import { getMe } from '@/lib/api/auth.api'

/**
 * The signed-in client's contract (from /auth/me), mirroring
 * logistics-backend/src/lib/contract-status.ts (2026-11-07):
 *
 *   ok    — full use
 *   grace — 1–7 days after contract_valid_until: read only, no booking, banner
 *   ended — 8+ days after: the server refuses sign-in (never seen here in practice)
 *
 * The server is the gate (booking routes answer 403 CONTRACT_EXPIRED); this only
 * hides the Book buttons and shows the banner.
 */
export type ContractState = 'ok' | 'grace' | 'ended'

export interface ContractStatus {
  state:        ContractState
  valid_until:  string | null
  access_until: string | null
}

interface ContractStore {
  contract: ContractStatus | null
  load:     () => Promise<void>
}

export const useContractStore = create<ContractStore>((set) => ({
  contract: null,
  load: async () => {
    try {
      const me = await getMe() as { contract?: ContractStatus }
      set({ contract: me.contract ?? null })
    } catch {
      // Keep what we had; the server still refuses a booking if it must.
    }
  },
}))

/** True while new bookings are closed for this client. */
export function useBookingClosed(): boolean {
  const state = useContractStore((s) => s.contract?.state)
  return state === 'grace' || state === 'ended'
}

/** Days from today (Philippine time) to `YYYY-MM-DD`; 0 on the day, negative after. */
export function contractDaysLeft(day: string): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

/** "December 1, 2026" from `YYYY-MM-DD`, without a timezone shift. */
export function formatContractDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}
