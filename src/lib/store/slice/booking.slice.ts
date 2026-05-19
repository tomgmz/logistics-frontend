import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type CargoMode   = 'loose' | 'palletized'
export type ServiceType = 'fmcg' | null

export interface ItemGroup {
  id: string
  pieces: string
  looseLength: string
  looseWidth: string
  looseHeight: string
  weight: string
  weightUnit: 'kg' | 'lbs'
  perItem: 'Per Item' | 'Total'
  nonTiltable: boolean
  nonStackable: boolean
  numPallets: string
  palletType: 'Standard' | 'Euro' | 'Half' | 'Custom'
  palletLength: string
  palletWidth: string
  palletHeight: string
  palletWeightUnit: 'kg' | 'lbs'
  grossWeightPerPallet: string
  netWeightPerPallet: string
  stackable: boolean
  oversize: boolean
  // display strings
  commodity: string
  product: string
  shc: string
  additionalShc: string
  // resolved catalog UUIDs (empty string = freeform / not from catalog)
  commodityId: string
  productId: string
  shcId: string
  ashcId: string
}

export interface DropoffSection {
  dropoffIndex: number
  groups: ItemGroup[]
}

export interface VehicleData {
  id: string
  name: string
  imageUrl: string
  maxWeightKG: number
  maxVolumeCBM: number
  maxLengthCM: number
  bodyType: string
  dimension: string
  suitableFor: string
  stackableFriendly: boolean
}

interface BookingState {
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
  vehicle: VehicleData | null
  paymentTerms: string
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
  mode: 'loose',
  sections: [{ dropoffIndex: 0, groups: [makeDefaultGroup()] }],
  allNonTiltable: false,
  allNonStackable: false,
  allStackable: false,
  allOversize: false,
  vehicle: null,
  paymentTerms: '',
}

const bookingSlice = createSlice({
  name: 'booking',
  initialState,
  reducers: {
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload
    },
    setStep(state, action: PayloadAction<number>) {
      state.step = Math.min(Math.max(action.payload, 1), 3)
    },
    setService(state, action: PayloadAction<ServiceType>) {
      state.service = action.payload
    },
    setDate(state, action: PayloadAction<string>) {
      state.date = action.payload
    },
    setTime(state, action: PayloadAction<string>) {
      state.time = action.payload
    },
    setPickup(state, action: PayloadAction<string>) {
      state.pickup = action.payload
    },
    setPickupCoords(state, action: PayloadAction<{ lat: number | null; lng: number | null }>) {
      state.pickupLat = action.payload.lat
      state.pickupLng = action.payload.lng
    },
    setDropoffs(state, action: PayloadAction<string[]>) {
      state.dropoffs = action.payload
    },
    updateDropoff(state, action: PayloadAction<{ index: number; value: string }>) {
      state.dropoffs[action.payload.index] = action.payload.value
    },
    updateDropoffCoords(state, action: PayloadAction<{ index: number; lat: number | null; lng: number | null }>) {
      state.dropoffCoords[action.payload.index] = {
        lat: action.payload.lat,
        lng: action.payload.lng,
      }
    },
    addDropoff(state) {
      if (state.dropoffs.length < 3) {
        const newIndex = state.dropoffs.length
        state.dropoffs.push('')
        state.dropoffCoords.push({ lat: null, lng: null })
        state.sections.push({ dropoffIndex: newIndex, groups: [makeDefaultGroup()] })
      }
    },
    removeDropoff(state, action: PayloadAction<number>) {
      const removed = action.payload
      state.dropoffs      = state.dropoffs.filter((_, i) => i !== removed)
      state.dropoffCoords = state.dropoffCoords.filter((_, i) => i !== removed)
      state.sections = state.sections
        .filter((s) => s.dropoffIndex !== removed)
        .map((s, newIndex) => ({ ...s, dropoffIndex: newIndex }))
    },
    setMode(state, action: PayloadAction<CargoMode>) {
      state.mode = action.payload
    },
    setSections(state, action: PayloadAction<DropoffSection[]>) {
      state.sections = action.payload
    },
    updateGroup(state, action: PayloadAction<{ dropoffIndex: number; groupId: string; patch: Partial<ItemGroup> }>) {
      const section = ensureSection(state, action.payload.dropoffIndex)
      const group   = section.groups.find((g) => g.id === action.payload.groupId)
      if (!group) return
      Object.assign(group, action.payload.patch)
    },
    addGroup(state, action: PayloadAction<{ dropoffIndex: number; newGroup: ItemGroup }>) {
      const section = ensureSection(state, action.payload.dropoffIndex)
      section.groups.push(action.payload.newGroup)
    },
    removeGroup(state, action: PayloadAction<{ dropoffIndex: number; groupId: string }>) {
      const section = state.sections.find((s) => s.dropoffIndex === action.payload.dropoffIndex)
      if (!section) return
      if (section.groups.length <= 1) return
      section.groups = section.groups.filter((g) => g.id !== action.payload.groupId)
    },
    setAllNonTiltable(state, action: PayloadAction<boolean>) {
      state.allNonTiltable = action.payload
      state.sections.forEach((sec) => sec.groups.forEach((g) => { g.nonTiltable = action.payload }))
    },
    setAllNonStackable(state, action: PayloadAction<boolean>) {
      state.allNonStackable = action.payload
      state.sections.forEach((sec) => sec.groups.forEach((g) => { g.nonStackable = action.payload }))
    },
    setAllStackable(state, action: PayloadAction<boolean>) {
      state.allStackable = action.payload
      state.sections.forEach((sec) => sec.groups.forEach((g) => { g.stackable = action.payload }))
    },
    setAllOversize(state, action: PayloadAction<boolean>) {
      state.allOversize = action.payload
      state.sections.forEach((sec) => sec.groups.forEach((g) => { g.oversize = action.payload }))
    },
    setVehicle(state, action: PayloadAction<VehicleData | null>) {
      state.vehicle = action.payload
    },
    setPaymentTerms(state, action: PayloadAction<string>) {
      state.paymentTerms = action.payload
    },
    resetBooking() {
      return {
        ...initialState,
        sections: [{ dropoffIndex: 0, groups: [makeDefaultGroup()] }],
      }
    },
  },
})

export const {
  setSidebarOpen,
  setStep,
  setService,
  setDate,
  setTime,
  setPickup,
  setPickupCoords,
  setDropoffs,
  updateDropoff,
  updateDropoffCoords,
  addDropoff,
  removeDropoff,
  setMode,
  setSections,
  updateGroup,
  addGroup,
  removeGroup,
  setAllNonTiltable,
  setAllNonStackable,
  setAllStackable,
  setAllOversize,
  setVehicle,
  setPaymentTerms,
  resetBooking,
} = bookingSlice.actions

export default bookingSlice.reducer