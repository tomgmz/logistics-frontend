import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'

interface ApiResponse<T> {
  status: string
  data: T
  message?: string
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await proxyApi.get<ApiResponse<T>>(url, { params })
  return data.data
}

async function post<T>(url: string, payload?: unknown): Promise<T> {
  const { data } = await proxyApi.post<ApiResponse<T>>(url, payload)
  return data.data
}

async function patch<T>(url: string, payload?: unknown): Promise<T> {
  const { data } = await proxyApi.patch<ApiResponse<T>>(url, payload ?? {})
  return data.data
}

// Keys of the fleet manager's BLOWBAGETS inspection. Must match the backend
// `recordTruckInspectionSchema` exactly. The inspection is recorded against a
// VEHICLE in Vehicle Management, not against a booking.
export type BlowbagetsKey =
  | 'battery' | 'lights' | 'oil' | 'water' | 'brakes'
  | 'air' | 'gas' | 'engine' | 'tires' | 'self'

export type BlowbagetsItems = Record<BlowbagetsKey, boolean>

// Legacy per-booking inspection snapshot, still present on bookings recorded
// before BLOWBAGETS moved onto the vehicle.
export interface BlowbagetsCheck {
  items:      BlowbagetsItems
  checked_by: string | null
  checked_at: string
}

export interface CargoItemPayload {
  commodity_id?:   string
  commodity_text?: string
  product_id?:     string
  product_text?:   string
  shc_id?:         string
  shc_text?:       string
  ashc_id?:        string
  ashc_text?:      string
  quantity?:       number
  weight_kg?:      number
  volume_cbm?:     number
  length_cm?:      number
  width_cm?:       number
  height_cm?:      number
  notes?:          string
}

export interface CreateBookingPayload {
  client_id:              string
  origin:                 string
  origin_latitude?:       number
  origin_longitude?:      number
  truck_type_needed:      string
  schedule_date:          string
  call_time:              string
  required_volume_cbm?:   number
  required_weight_kg?:    number
  required_length_cm?:    number
  stackable_required?:    boolean
  payment_terms?:         string
  transaction_documents?: string[]
  cargo_items?:           CargoItemPayload[]
  destinations: {
    address:        string
    sequence_order: number
    notes?:         string
    latitude?:      number
    longitude?:     number
  }[]
}

export interface CreateBookingResult {
  booking_id?:       string
  reference_number?: string
}

export interface UpdateBookingPayload {
  origin?:                string
  origin_longitude?:      number | null
  origin_latitude?:       number | null
  truck_type_needed?:     string
  schedule_date?:         string
  call_time?:             string
  status?:                string
  required_volume_cbm?:   number | null
  required_weight_kg?:    number | null
  required_length_cm?:    number | null
  stackable_required?:    boolean | null
  payment_terms?:         string | null
  transaction_documents?: string[] | null
}

export type DestinationDeliveryStatus = 'pending' | 'delivered' | 'failed'

export type AdminBookingLifecycleStatus =
  | 'pending'
  | 'approved'
  | 'assigned'
  | 'in_transit'
  | 'completed'
  | 'cancelled'

export const bookingService = {
  optimizeRoute: async (bookingId: string) => {
    const { data } = await proxyApi.post(`/route-optimization/optimize/${bookingId}`)
    return data.data
  },

  createBooking: (input: CreateBookingPayload) =>
    post<CreateBookingResult>('/booking', input),

  updateBooking: (bookingId: string, payload: UpdateBookingPayload) =>
    patch<unknown>(`/booking/${bookingId}`, payload),

  updateDestinationStatus: async (
    destinationId: string,
    status: DestinationDeliveryStatus,
    deliveredAt?: string,
  ) => {
    await initCsrf()
    return patch<unknown>(`/booking/destinations/${destinationId}/status`, {
      status,
      ...(deliveredAt && { delivered_at: deliveredAt }),
    })
  },

  fetchAllBookingsForAdmin: async () => {
    const { data } = await proxyApi.get<{ data: unknown[] }>('/booking')
    return (data?.data ?? []) as Record<string, unknown>[]
  },

  fetchBookingsAdminPaginated: async (params: {
    page:   number
    limit:  number
    status: string
    search: string
  }): Promise<{
    rows: Record<string, unknown>[]
    meta: {
      total:        number
      page:         number
      limit:        number
      totalPages:   number
      statusCounts: Record<string, number>
    }
  }> => {
    const { data: body } = await proxyApi.get<{
      status: string
      data:   Record<string, unknown>[]
      meta: {
        total:        number
        page:         number
        limit:        number
        totalPages:   number
        statusCounts: Record<string, number>
      }
    }>('/booking', {
      params: {
        page:   params.page,
        limit:  params.limit,
        status: params.status,
        search: params.search || undefined,
      },
    })
    return {
      rows: body?.data ?? [],
      meta: body.meta ?? {
        total:        0,
        page:         params.page,
        limit:        params.limit,
        totalPages:   1,
        statusCounts: { all: 0 },
      },
    }
  },

  // Drives the booking lifecycle directly. On 'cancelled' this is the
  // administrator rejecting the booking on their own authority — `rejectionReason`
  // is stored on the booking and sent to the client, and the backend records the
  // admin as the decision-maker rather than touching the GM's sub-status.
  updateBookingStatusAdmin: async (
    bookingId: string,
    status: AdminBookingLifecycleStatus,
    rejectionReason?: string,
  ) => {
    await initCsrf()
    return patch<unknown>(`/booking/${bookingId}/status`, {
      status,
      ...(rejectionReason?.trim() && { rejection_reason: rejectionReason.trim() }),
    })
  },

  deleteDestinationAdmin: async (destinationId: string) => {
    await initCsrf()
    await proxyApi.delete(`/booking/destinations/${destinationId}`)
  },

  // --- approval workflow ---------------------------------------------------
  // The general manager's decision is the only approval gate. An accountant the
  // IT admin appointed as GM proxy calls the same endpoint. A rejection must
  // carry remarks, which the client sees on the booking.
  gmReview: async (
    bookingId: string,
    payload: { gm_status: 'approved' | 'rejected'; rejection_reason?: string },
  ) => {
    await initCsrf()
    return patch<unknown>(`/booking/${bookingId}/gm-review`, payload)
  },

  getBookingById: (bookingId: string) =>
    get<unknown>(`/booking/${bookingId}`),

  fetchBookingsByClient: async (clientId: string): Promise<BookingWithRelations[]> => {
    const { data } = await proxyApi.get<{ status: string; data: BookingWithRelations[] }>(
      `/booking/client/${clientId}`,
    )
    return data?.data ?? []
  },
}