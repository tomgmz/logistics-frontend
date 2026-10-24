'use client'

import { create } from 'zustand'

export interface CallRequest {
  conversationId: string
  /** Shown while the call is being placed, before the server answers. */
  peerName:       string
  peerRole:       string
}

/**
 * The link between a chat header's call button and ChatCallProvider. The
 * provider registers `placeCall` while it is mounted; with no provider (a
 * client's portal) the button doesn't render.
 */
interface ChatCallStore {
  placeCall: ((req: CallRequest) => void) | null
  /** True while this browser is ringing out, ringing in, or on a call. */
  inCall:    boolean
  setPlaceCall: (fn: ((req: CallRequest) => void) | null) => void
  setInCall:    (v: boolean) => void
}

export const useChatCallStore = create<ChatCallStore>((set) => ({
  placeCall:    null,
  inCall:       false,
  setPlaceCall: (placeCall) => set({ placeCall }),
  setInCall:    (inCall) => set({ inCall }),
}))
