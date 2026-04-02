import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type CargoMode   = 'loose' | 'palletized'
export type ServiceType = 'ecommerce' | 'fmcg' | null

export interface ItemGroup {
  id: string
  // loose
  pieces: string
  looseLength: string
  looseWidth: string
  looseHeight: string
  weight: string
  weightUnit: 'kg' | 'lbs'
  perItem: 'Per Item' | 'Total'
  nonTiltable: boolean
  nonStackable: boolean
  // palletized
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
  // product meta
  commodity: string
  product: string
  shc: string
  additionalShc: string
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
}

const initialState: BookingState = {
  sidebarOpen: true,
  step: 1,
  service: null,
  date: '',
  time: '',
  pickup: '',
  pickupLat: null,
  pickupLng: null,
  dropoffs: [''],
  dropoffCoords: [{ lat: null, lng: null }],
  mode: 'loose',
  sections: [],
  allNonTiltable: false,
  allNonStackable: false,
  allStackable: false,
  allOversize: false,
  vehicle: null,
}

const bookingSlice = createSlice({
  name: 'booking',
  initialState,
  reducers: {
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload
    },
    setStep(state, action: PayloadAction<number>) {
      state.step = Math.min(Math.max(action.payload, 1), 4)
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
        state.dropoffs.push('')
        state.dropoffCoords.push({ lat: null, lng: null })
      }
    },
    removeDropoff(state, action: PayloadAction<number>) {
      state.dropoffs      = state.dropoffs.filter((_, i) => i !== action.payload)
      state.dropoffCoords = state.dropoffCoords.filter((_, i) => i !== action.payload)
      state.sections = state.sections
        .filter((s) => s.dropoffIndex !== action.payload)
        .map((s, newIndex) => ({ ...s, dropoffIndex: newIndex }))
    },
    setMode(state, action: PayloadAction<CargoMode>) {
      state.mode = action.payload
    },
    setSections(state, action: PayloadAction<DropoffSection[]>) {
      state.sections = action.payload
    },
    updateGroup(state, action: PayloadAction<{ dropoffIndex: number; groupId: string; patch: Partial<ItemGroup> }>) {
      const section = state.sections.find((s) => s.dropoffIndex === action.payload.dropoffIndex)
      if (!section) return
      const group = section.groups.find((g) => g.id === action.payload.groupId)
      if (!group) return
      Object.assign(group, action.payload.patch)
    },
    addGroup(state, action: PayloadAction<{ dropoffIndex: number; newGroup: ItemGroup }>) {
      const section = state.sections.find((s) => s.dropoffIndex === action.payload.dropoffIndex)
      if (section) section.groups.push(action.payload.newGroup)
    },
    removeGroup(state, action: PayloadAction<{ dropoffIndex: number; groupId: string }>) {
      const section = state.sections.find((s) => s.dropoffIndex === action.payload.dropoffIndex)
      if (!section) return
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
    resetBooking() {
      return initialState
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
  resetBooking,
} = bookingSlice.actions

export default bookingSlice.reducer