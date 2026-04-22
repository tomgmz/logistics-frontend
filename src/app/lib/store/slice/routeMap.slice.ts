import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import authApi, { initCsrf } from '@/app/lib/api/auth.api'
import type { OptimizedStop, OptimizeRouteResponse } from '@/app/types/maps/routemap.types'
import type { BookingDetail } from '@/app/types/maps/routemap.types'
import type { AuthUser } from '@/app/lib/api/auth.api'

export interface BookingDestination {
  address: string
  [key: string]: unknown
}

export interface BookingWithRelations {
  booking_id: string
  origin?: string
  status: string
  schedule_date?: string
  truck_type_needed?: string
  booking_destinations?: BookingDestination[]
  [key: string]: unknown
}

export const fetchBookings = createAsyncThunk(
  'routeMap/fetchBookings',
  async (user: AuthUser | null, { rejectWithValue }) => {
    if (!user) return rejectWithValue('Not authenticated')

    try {
      if (user.role === 'client') {
        const clientId = user.clients?.client_id
        if (!clientId) {
          return rejectWithValue('Client ID not found. Please log out and log in again.')
        }

        const res = await authApi.get(`/booking/client/${clientId}`)
        return (res.data?.data ?? []) as BookingWithRelations[]
      }

      const res = await authApi.get('/booking')
      return (res.data?.data ?? []) as BookingWithRelations[]
    } catch (err: unknown) {
      return rejectWithValue(err instanceof Error ? err.message : 'Failed to load bookings')
    }
  }
)

export const fetchRouteAndDetail = createAsyncThunk(
  'routeMap/fetchRouteAndDetail',
  async (bookingId: string, { rejectWithValue }) => {
    try {
      await initCsrf()
      const [routeRes, detailRes] = await Promise.all([
        authApi.post(`/route-optimization/optimize/${bookingId}`),
        authApi.get(`/booking/${bookingId}`),
      ])
      return {
        routeData:     routeRes.data?.data as OptimizeRouteResponse,
        bookingDetail: detailRes.data?.data as BookingDetail,
      }
    } catch (err: unknown) {
      return rejectWithValue(err instanceof Error ? err.message : 'Failed to load route')
    }
  }
)

interface RouteMapState {
  bookings:         BookingWithRelations[]
  listLoading:      boolean
  listError:        string | null

  selectedId:       string | null
  routeData:        OptimizeRouteResponse | null
  bookingDetail:    BookingDetail | null
  stops:            OptimizedStop[]
  encodedPolyline:  string | null
  detailLoading:    boolean
  detailError:      string | null
}

const initialState: RouteMapState = {
  bookings:         [],
  listLoading:      false,
  listError:        null,

  selectedId:       null,
  routeData:        null,
  bookingDetail:    null,
  stops:            [],
  encodedPolyline:  null,
  detailLoading:    false,
  detailError:      null,
}

const routeMapSlice = createSlice({
  name: 'routeMap',
  initialState,
  reducers: {
    clearSelection(state) {
      state.selectedId       = null
      state.routeData        = null
      state.bookingDetail    = null
      state.stops            = []
      state.encodedPolyline  = null
      state.detailError      = null
    },
    setSelectedId(state, action: PayloadAction<string>) {
      state.selectedId       = action.payload
      state.routeData        = null
      state.bookingDetail    = null
      state.stops            = []
      state.encodedPolyline  = null
      state.detailError      = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBookings.pending, (state) => {
        state.listLoading = true
        state.listError   = null
      })
      .addCase(fetchBookings.fulfilled, (state, action) => {
        state.listLoading = false
        state.bookings    = action.payload
      })
      .addCase(fetchBookings.rejected, (state, action) => {
        state.listLoading = false
        state.listError   = action.payload as string
      })

    builder
      .addCase(fetchRouteAndDetail.pending, (state) => {
        state.detailLoading = true
        state.detailError   = null
      })
      .addCase(fetchRouteAndDetail.fulfilled, (state, action) => {
        state.detailLoading = false
        const routeData     = action.payload.routeData

        state.routeData     = routeData
        state.bookingDetail = action.payload.bookingDetail
        state.stops         = [...(routeData?.optimized_stops ?? [])].sort(
          (a, b) => a.optimized_sequence_order - b.optimized_sequence_order
        )

        interface RouteDataWithPolyline {
          encoded_polyline?: string
          encodedPolyline?:  string
        }
        const routeDataExt    = routeData as unknown as RouteDataWithPolyline
        state.encodedPolyline =
          routeDataExt?.encoded_polyline ??
          routeDataExt?.encodedPolyline ??
          null
      })
      .addCase(fetchRouteAndDetail.rejected, (state, action) => {
        state.detailLoading = false
        state.detailError   = action.payload as string
      })
  },
})

export const { clearSelection, setSelectedId } = routeMapSlice.actions
export default routeMapSlice.reducer