import proxyApi, {initCsrf} from '@/lib/api/auth.api'

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

export interface CreateBookingPayload {
  client_id: string
  origin: string
  origin_latitude?: number
  origin_longitude?: number
  truck_type_needed: string
  cargo_details?: string
  schedule_date: string
  call_time: string
  required_volume_cbm?: number
  required_weight_kg?: number
  required_length_cm?: number
  stackable_required?: boolean
  destinations: {
    address: string
    sequence_order: number
    notes?: string
    latitude?: number
    longitude?: number
  }[]
}

export interface CreateBookingResult {
  booking_id?: string
}

export type DestinationDeliveryStatus = 'pending' | 'delivered' | 'failed'

export type AdminBookingLifecycleStatus =
  | 'pending'
  | 'assigned'
  | 'in_transit'
  | 'completed'
  | 'cancelled'

export const bookingService = {
  optimizeRoute: async (bookingId: string) => {
    const { data } = await proxyApi.post(`/route-optimization/optimize/${bookingId}`)
    return data.data
  },

  createBooking: (input: CreateBookingPayload) => post<CreateBookingResult>('/booking', input),

  updateDestinationStatus: async (
    destinationId: string,
    status: DestinationDeliveryStatus,
    deliveredAt?: string
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

  /** Server-side list for super admin (pass `page` + `limit`). */
  fetchBookingsAdminPaginated: async (params: {
    page: number
    limit: number
    status: string
    search: string
  }): Promise<{
    rows: Record<string, unknown>[]
    meta: {
      total: number
      page: number
      limit: number
      totalPages: number
      statusCounts: Record<string, number>
    }
  }> => {
    const { data: body } = await proxyApi.get<{
      status: string
      data: Record<string, unknown>[]
      meta: {
        total: number
        page: number
        limit: number
        totalPages: number
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

  updateBookingStatusAdmin: async (bookingId: string, status: AdminBookingLifecycleStatus) => {
    await initCsrf()
    return patch<unknown>(`/booking/${bookingId}/status`, { status })
  },

  deleteDestinationAdmin: async (destinationId: string) => {
    await initCsrf()
    await proxyApi.delete(`/booking/destinations/${destinationId}`)
  },

  getBookingById: (bookingId: string) => get<unknown>(`/booking/${bookingId}`),
}
