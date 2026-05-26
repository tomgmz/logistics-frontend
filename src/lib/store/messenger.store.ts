'use client'

import { create } from 'zustand'

export const MAX_BUBBLES_LG = 3
export const MAX_BUBBLES_MD = 2

function getMaxBubbles(): number {
  if (typeof window === 'undefined') return MAX_BUBBLES_LG
  return window.innerWidth >= 1280 ? MAX_BUBBLES_LG : MAX_BUBBLES_MD
}

export type ChatEntry =
  | { kind: 'dm'; id: string }
  | { kind: 'group'; id: string }

interface MessengerStore {
  isPanelOpen: boolean
  openChats: ChatEntry[]
  minimizedChats: ChatEntry[]
  totalUnread: number
  togglePanel: () => void
  closePanel: () => void
  openChat: (id: string, unreadCount?: number) => void
  openGroupChat: (id: string, unreadCount?: number) => void
  closeChat: (id: string) => void
  minimizeChat: (id: string) => void
  toggleMinimizeChat: (id: string) => void
  setTotalUnread: (count: number) => void
  incrementUnread: () => void
  decrementUnread: (by: number) => void
  // legacy compat
  openChatIds: string[]
  minimizedChatIds: string[]
}

export const useMessengerStore = create<MessengerStore>((set, get) => ({
  isPanelOpen: false,
  openChats: [],
  minimizedChats: [],
  totalUnread: 0,

  get openChatIds() {
    return get().openChats.map(c => c.id)
  },
  get minimizedChatIds() {
    return get().minimizedChats.map(c => c.id)
  },

  togglePanel: () => set(s => ({ isPanelOpen: !s.isPanelOpen })),
  closePanel: () => set({ isPanelOpen: false }),

  openChat: (id, unreadCount = 0) =>
    set(s => {
      const max = getMaxBubbles()
      const already = s.openChats.some(c => c.id === id)
      const entry: ChatEntry = { kind: 'dm', id }
      const newChats = already
        ? s.openChats
        : [...s.openChats.slice(-(max - 1)), entry]
      return {
        isPanelOpen: false,
        openChats: newChats,
        minimizedChats: s.minimizedChats.filter(c => c.id !== id),
        totalUnread: Math.max(0, s.totalUnread - unreadCount),
      }
    }),

  openGroupChat: (id, unreadCount = 0) =>
    set(s => {
      const max = getMaxBubbles()
      const already = s.openChats.some(c => c.id === id)
      const entry: ChatEntry = { kind: 'group', id }
      const newChats = already
        ? s.openChats
        : [...s.openChats.slice(-(max - 1)), entry]
      return {
        isPanelOpen: false,
        openChats: newChats,
        minimizedChats: s.minimizedChats.filter(c => c.id !== id),
        totalUnread: Math.max(0, s.totalUnread - unreadCount),
      }
    }),

  closeChat: (id) =>
    set(s => ({
      openChats: s.openChats.filter(c => c.id !== id),
      minimizedChats: s.minimizedChats.filter(c => c.id !== id),
    })),

  minimizeChat: (id) =>
    set(s => {
      const entry = s.openChats.find(c => c.id === id)
      if (!entry) return {}
      return {
        openChats: s.openChats.filter(c => c.id !== id),
        minimizedChats: s.minimizedChats.some(c => c.id === id)
          ? s.minimizedChats
          : [...s.minimizedChats.slice(-2), entry],
      }
    }),

  toggleMinimizeChat: (id) =>
    set(s => {
      const isMinimized = s.minimizedChats.some(c => c.id === id)
      if (isMinimized) {
        const max = getMaxBubbles()
        const entry = s.minimizedChats.find(c => c.id === id)!
        const newOpen = s.openChats.some(c => c.id === id)
          ? s.openChats
          : [...s.openChats.slice(-(max - 1)), entry]
        return {
          openChats: newOpen,
          minimizedChats: s.minimizedChats.filter(c => c.id !== id),
        }
      }
      const entry = s.openChats.find(c => c.id === id)
      if (!entry) return {}
      return {
        openChats: s.openChats.filter(c => c.id !== id),
        minimizedChats: [...s.minimizedChats.slice(-2), entry],
      }
    }),

  setTotalUnread: (count) => set({ totalUnread: count }),
  incrementUnread: () => set(s => ({ totalUnread: s.totalUnread + 1 })),
  decrementUnread: (by) => set(s => ({ totalUnread: Math.max(0, s.totalUnread - by) })),
}))