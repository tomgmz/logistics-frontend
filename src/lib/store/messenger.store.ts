import { create } from 'zustand'

interface MessengerStore {
  isPanelOpen: boolean
  openChatIds: string[]
  minimizedChatIds: string[]
  togglePanel: () => void
  closePanel: () => void
  openChat: (id: string) => void
  closeChat: (id: string) => void
  toggleMinimizeChat: (id: string) => void
}

export const useMessengerStore = create<MessengerStore>((set) => ({
  isPanelOpen: false,
  openChatIds: [],
  minimizedChatIds: [],

  togglePanel: () => set(s => ({ isPanelOpen: !s.isPanelOpen })),
  closePanel: () => set({ isPanelOpen: false }),

  openChat: (id) =>
    set(s => ({
      isPanelOpen: false,
      openChatIds: s.openChatIds.includes(id)
        ? s.openChatIds
        : [...s.openChatIds.slice(-2), id],
      minimizedChatIds: s.minimizedChatIds.filter(i => i !== id),
    })),

  closeChat: (id) =>
    set(s => ({
      openChatIds: s.openChatIds.filter(i => i !== id),
      minimizedChatIds: s.minimizedChatIds.filter(i => i !== id),
    })),

  toggleMinimizeChat: (id) =>
    set(s => ({
      minimizedChatIds: s.minimizedChatIds.includes(id)
        ? s.minimizedChatIds.filter(i => i !== id)
        : [...s.minimizedChatIds, id],
    })),
}))