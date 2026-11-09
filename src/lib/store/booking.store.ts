'use client'

import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { produce } from 'immer'
import { draftFingerprint, type ResubmitDraft } from '@/lib/booking-resubmit'
import { BOOKING_PERSIST_KEY } from './booking-draft'

/**
 * The client's booking form (the wizard) while it is being filled in: screen
 * state, not server data, so it lives in Zustand (it was the Redux `booking`
 * slice until 2026-11-10; same fields, same action names).
 *
 * - Survives a reload of the same tab: kept in sessionStorage (one copy per
 *   tab, gone when the tab closes). Attached files sit in IndexedDB
 *   (booking-draft.ts).
 * - Restored after the first render (like redux-persist was), so the page
 *   the server sent and the first browser render match; `hydrated` says when.
 * - Emptied when the signed-in account changes (StoreProvider).
 * - The client sidebar's open state is layout, not part of the draft.
 */

export type CargoMode   = 'loose' | 'palletized'
export type ServiceType = 'fmcg' | null
/** Weight units the client can type in; everything is converted to kg before sending. */
export type WeightUnit  = 'kg' | 'lbs'

export interface ItemGroup {
  id: string
  pieces: string
  looseLength: string
  looseWidth: string
  looseHeight: string
  weight: string
  weightUnit: WeightUnit
  perItem: 'Per Item' | 'Total'
  nonTiltable: boolean
  nonStackable: boolean
  numPallets: string
  palletType: 'Standard' | 'Euro' | 'Half' | 'Custom'
  palletLength: string
  palletWidth: string
  palletHeight: string
  palletWeightUnit: WeightUnit
  grossWeightPerPallet: string
  netWeightPerPallet: string
  stackable: boolean
  oversize: boolean
  commodity: string
  product: string
  shc: string
  additionalShc: string
  commodityId: string
  productId: string
  shcId: string
  ashcId: string
}

export interface DropoffSection {
  dropoffIndex: number
  groups: ItemGroup[]
}

/**
 * Set while the wizard is correcting a booking 8338 rejected, rather than
 * creating a new one. `existingDocuments` are the transaction documents already
 * on that booking; the client keeps or removes them and may add more.
 */
export interface ResubmitContext {
  bookingId:         string
  reference:         string | null
  rejectionReason:   string | null
  existingDocuments: string[]
  /**
   * The details as loaded, fingerprinted. Next stays disabled while the form
   * still matches it — resubmitting an unchanged booking would only be
   * rejected again.
   */
  baseline:          string
}

export interface BookingState {
  resubmit: ResubmitContext | null
  sidebarOpen: boolean
  step: number
  service: ServiceType
  date: string
  time: string
  pickup: string
  pickupLat: number | null
  pickupLng: number | null
  dropoffs: string[]
  dropoffCoords: { lat: number | null; lng: number | null }[]
  mode: CargoMode
  sections: DropoffSection[]
  allNonTiltable: boolean
  allNonStackable: boolean
  allStackable: boolean
  allOversize: boolean
}

export function makeDefaultGroup(): ItemGroup {
  return {
    id: crypto.randomUUID(),
    pieces: '',
    looseLength: '',
    looseWidth: '',
    looseHeight: '',
    weight: '',
    weightUnit: 'kg',
    perItem: 'Per Item',
    nonTiltable: false,
    nonStackable: false,
    numPallets: '',
    palletType: 'Standard',
    palletLength: '120',
    palletWidth: '100',
    palletHeight: '',
    palletWeightUnit: 'kg',
    grossWeightPerPallet: '',
    netWeightPerPallet: '',
    stackable: false,
    oversize: false,
    commodity: '',
    product: '',
    shc: '',
    additionalShc: '',
    commodityId: '',
    productId: '',
    shcId: '',
    ashcId: '',
  }
}

function ensureSection(state: BookingState, dropoffIndex: number): DropoffSection {
  let section = state.sections.find((s) => s.dropoffIndex === dropoffIndex)
  if (!section) {
    section = { dropoffIndex, groups: [makeDefaultGroup()] }
    state.sections.push(section)
    state.sections.sort((a, b) => a.dropoffIndex - b.dropoffIndex)
  }
  return section
}

const initialState: BookingState = {
  resubmit: null,
  sidebarOpen: true,
  step: 1,
  service: 'fmcg',
  date: '',
  time: '',
  pickup: '',
  pickupLat: null,
  pickupLng: null,
  dropoffs: [''],
  dropoffCoords: [{ lat: null, lng: null }],
  mode: 'palletized',
  sections: [{ dropoffIndex: 0, groups: [makeDefaultGroup()] }],
  allNonTiltable: false,
  allNonStackable: false,
  allStackable: false,
  allOversize: false,
}


const noStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

function tabStorage(): StateStorage {
  try {
    return typeof window === 'undefined' ? noStorage : window.sessionStorage
  } catch {
    return noStorage   // private browsing / blocked site data: the draft just won't survive
  }
}

type Store = BookingState & { hydrated: boolean }

export const useBookingStore = create<Store>()(
  persist(
    (): Store => ({ ...initialState, hydrated: false }),
    {
      name:        `${BOOKING_PERSIST_KEY}-form`,
      version:     1,
      storage:     createJSONStorage(tabStorage),
      skipHydration: true,
      partialize:  ({ hydrated, sidebarOpen, ...draft }) => { void hydrated; void sidebarOpen; return draft },
      onRehydrateStorage: () => () => { useBookingStore.setState({ hydrated: true }) },
    },
  ),
)

/** Restore the saved draft; called once after the app mounts (StoreProvider). */
export function restoreBookingDraft() {
  void useBookingStore.persist.rehydrate()
}

const update = (fn: (d: BookingState) => void) =>
  useBookingStore.setState((s) => produce(s, (d) => { fn(d) }))

export function setSidebarOpen(v: boolean) { update((d) => { d.sidebarOpen = v }) }
export function setStep(n: number) { update((d) => { d.step = Math.min(Math.max(n, 1), 2) }) }
export function setService(v: ServiceType) { update((d) => { d.service = v }) }
export function setDate(v: string) { update((d) => { d.date = v }) }
export function setTime(v: string) { update((d) => { d.time = v }) }
export function setPickup(v: string) { update((d) => { d.pickup = v }) }
export function setPickupCoords(p: { lat: number | null; lng: number | null }) {
  update((d) => { d.pickupLat = p.lat; d.pickupLng = p.lng })
}
export function setDropoffs(v: string[]) { update((d) => { d.dropoffs = v }) }
export function updateDropoff(p: { index: number; value: string }) { update((d) => { d.dropoffs[p.index] = p.value }) }
export function updateDropoffCoords(p: { index: number; lat: number | null; lng: number | null }) {
  update((d) => { d.dropoffCoords[p.index] = { lat: p.lat, lng: p.lng } })
}
export function addDropoff() {
  update((d) => {
    if (d.dropoffs.length < 3) {
      const newIndex = d.dropoffs.length
      d.dropoffs.push('')
      d.dropoffCoords.push({ lat: null, lng: null })
      d.sections.push({ dropoffIndex: newIndex, groups: [makeDefaultGroup()] })
    }
  })
}
export function removeDropoff(removed: number) {
  update((d) => {
    d.dropoffs      = d.dropoffs.filter((_, i) => i !== removed)
    d.dropoffCoords = d.dropoffCoords.filter((_, i) => i !== removed)
    d.sections = d.sections
      .filter((s) => s.dropoffIndex !== removed)
      .map((s, newIndex) => ({ ...s, dropoffIndex: newIndex }))
  })
}
export function setMode(v: CargoMode) { update((d) => { d.mode = v }) }
export function setSections(v: DropoffSection[]) { update((d) => { d.sections = v }) }
export function updateGroup(p: { dropoffIndex: number; groupId: string; patch: Partial<ItemGroup> }) {
  update((d) => {
    const section = ensureSection(d, p.dropoffIndex)
    const group   = section.groups.find((g) => g.id === p.groupId)
    if (group) Object.assign(group, p.patch)
  })
}
export function addGroup(p: { dropoffIndex: number; newGroup: ItemGroup }) {
  update((d) => { ensureSection(d, p.dropoffIndex).groups.push(p.newGroup) })
}
export function removeGroup(p: { dropoffIndex: number; groupId: string }) {
  update((d) => {
    const section = d.sections.find((s) => s.dropoffIndex === p.dropoffIndex)
    if (!section || section.groups.length <= 1) return
    section.groups = section.groups.filter((g) => g.id !== p.groupId)
  })
}
export function setAllNonTiltable(v: boolean) {
  update((d) => { d.allNonTiltable = v; d.sections.forEach((sec) => sec.groups.forEach((g) => { g.nonTiltable = v })) })
}
export function setAllNonStackable(v: boolean) {
  update((d) => { d.allNonStackable = v; d.sections.forEach((sec) => sec.groups.forEach((g) => { g.nonStackable = v })) })
}
export function setAllStackable(v: boolean) {
  update((d) => { d.allStackable = v; d.sections.forEach((sec) => sec.groups.forEach((g) => { g.stackable = v })) })
}
export function setAllOversize(v: boolean) {
  update((d) => { d.allOversize = v; d.sections.forEach((sec) => sec.groups.forEach((g) => { g.oversize = v })) })
}
export function loadResubmitDraft(dr: ResubmitDraft) {
  useBookingStore.setState((s) => ({
    ...initialState,
    sidebarOpen: s.sidebarOpen,
    resubmit: {
      bookingId:         dr.bookingId,
      reference:         dr.reference,
      rejectionReason:   dr.rejectionReason,
      existingDocuments: dr.existingDocuments,
      baseline:          draftFingerprint({ ...dr, mode: 'loose' }),
    },
    date:            dr.date,
    time:            dr.time,
    pickup:          dr.pickup,
    pickupLat:       dr.pickupLat,
    pickupLng:       dr.pickupLng,
    dropoffs:        dr.dropoffs,
    dropoffCoords:   dr.dropoffCoords,
    mode:            'loose' as CargoMode,
    sections:        dr.sections,
    allNonStackable: dr.allNonStackable,
  }))
}
export function removeExistingDocument(url: string) {
  update((d) => { if (d.resubmit) d.resubmit.existingDocuments = d.resubmit.existingDocuments.filter((u) => u !== url) })
}
export function resetBooking() {
  useBookingStore.setState((s) => ({
    ...initialState,
    sidebarOpen: s.sidebarOpen,
    sections: [{ dropoffIndex: 0, groups: [makeDefaultGroup()] }],
  }))
}
