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
  /**
   * The `sequence_order` of the drop-off this line is for.
   *
   * The wizard has always collected cargo per destination; until now that
   * grouping was flattened away at submit, so nobody downstream could tell which
   * goods came off at which stop.
   */
  dropoff_sequence_order?: number
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
  // Minted per booking attempt and reused across its retries, so a request that
  // timed out client-side after the server had in fact created the booking
  // returns that same booking instead of a duplicate trip.
  idempotency_key:        string
  origin:                 string
  origin_latitude?:       number
  origin_longitude?:      number
  truck_type_needed?:     string
  schedule_date:          string
  call_time:              string
  required_volume_cbm?:   number
  required_weight_kg?:    number
  required_length_cm?:    number
  required_net_weight_kg?: number
  non_stackable_cargo?:   boolean
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
  transaction_documents?: string[] | null
}

/** What a client can be shown (the backend's CLIENT_VISIBLE_DOCUMENT_TYPES). */
export type ClientDocumentType =
  | 'transaction_document' | 'pickup_proof' | 'delivery_proof' | 'proof_of_delivery'

/** One step's time at a stop. `proof` = the photo confirmation (the finish). */
export interface StepTime {
  at:         string
  source:     'driver' | 'staff' | 'proof'
  corrected?: boolean
  note?:      string | null
  /** The phone's clock was changed between the tap and its sync, so the time
   *  was moved to keep the steps in order — worth checking. */
  clock_adjusted?: boolean
}

export interface StopTimes {
  arrived_parking: StepTime | null
  docked:          StepTime | null
  started:         StepTime | null
  finished:        StepTime | null
  departed:        StepTime | null
}

export interface TimelineStop extends StopTimes {
  trip_stop_id:   string
  destination_id: string
  sequence_order: number
  stop_number:    number | null
  address:        string | null
  status:         string
}

export interface TimelineTrip {
  trip_id:      string
  trip_number:  number
  status:       string
  total_loaded: { pieces: number; weight_kg: number | null } | null
  loading:      StopTimes
  stops:        TimelineStop[]
}

export type TimelineStage = 'arrived_parking' | 'docked' | 'started' | 'departed'

export interface ClientBookingDocument {
  doc_key:     string
  doc_type:    ClientDocumentType
  source:      'client' | 'driver' | 'staff'
  file_url:    string
  file_name:   string
  uploaded_at: string | null
  detail:      string | null
}

export type DestinationDeliveryStatus ='pending' | 'delivered' | 'failed'

export type AdminBookingLifecycleStatus =
  | 'pending'
  | 'approved'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'cancelled'

export const bookingService = {
  optimizeRoute: async (bookingId: string) => {
    const { data } = await proxyApi.post(`/route-optimization/optimize/${bookingId}`)
    return data.data
  },

  createBooking: async (input: CreateBookingPayload) => {
    // Every other mutating call primes the CSRF cookie first; this one did not,
    // which left the header off whenever nothing else had primed it yet.
    await initCsrf()
    return post<CreateBookingResult>('/booking', input)
  },

  // A booking 8338 rejected, corrected by the client and sent back for review.
  // The full booking is restated, like a new one, but keeps its id and number.
  resubmitBooking: async (bookingId: string, input: Omit<CreateBookingPayload, 'idempotency_key'>) => {
    await initCsrf()
    return post<CreateBookingResult>(`/booking/${bookingId}/resubmit`, input)
  },

  // The client lets a rejected booking go instead of resubmitting it.
  closeRejectedBooking: async (bookingId: string): Promise<BookingWithRelations> => {
    await initCsrf()
    return post<BookingWithRelations>(`/booking/${bookingId}/close`)
  },

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
    /** Schedule-date window, inclusive, YYYY-MM-DD. */
    dateFrom?: string
    dateTo?:   string
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
        date_from: params.dateFrom || undefined,
        date_to:   params.dateTo   || undefined,
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
    // Required by the backend when this call approves a pending booking.
    approvalRemarks?: string,
  ) => {
    await initCsrf()
    return patch<unknown>(`/booking/${bookingId}/status`, {
      status,
      ...(rejectionReason?.trim() && { rejection_reason: rejectionReason.trim() }),
      ...(approvalRemarks?.trim() && { approval_remarks: approvalRemarks.trim() }),
    })
  },

  deleteDestinationAdmin: async (destinationId: string) => {
    await initCsrf()
    await proxyApi.delete(`/booking/destinations/${destinationId}`)
  },

  // --- approval workflow ---------------------------------------------------
  // The general manager's decision is the only approval gate. Both decisions
  // carry remarks, which the client sees in their transaction history.
  gmReview: async (
    bookingId: string,
    payload: { gm_status: 'approved' | 'rejected'; rejection_reason?: string; approval_remarks?: string },
  ) => {
    await initCsrf()
    return patch<unknown>(`/booking/${bookingId}/gm-review`, payload)
  },

  // --- completion ----------------------------------------------------------
  // Only the client confirms a delivered booking is complete.
  confirmCompletion: async (bookingId: string): Promise<BookingWithRelations> => {
    await initCsrf()
    return post<BookingWithRelations>(`/booking/${bookingId}/confirm-completion`)
  },

  // Company Administrator / Operations Manager: the client's reported problem is
  // dealt with. The booking stays delivered and the client gets a fresh 3 days.
  // Staff only. `note` says what was done about it; it is sent to the client.
  resolveDeliveryIssue: async (bookingId: string, note: string): Promise<BookingWithRelations> => {
    await initCsrf()
    return post<BookingWithRelations>(`/booking/${bookingId}/resolve-issue`, { note })
  },

  // The client says the delivery is not right; holds auto-completion.
  reportDeliveryIssue: async (bookingId: string, note: string): Promise<BookingWithRelations> => {
    await initCsrf()
    return post<BookingWithRelations>(`/booking/${bookingId}/report-issue`, { note })
  },

  getBookingById: (bookingId: string) =>
    get<unknown>(`/booking/${bookingId}`),

  // Every file the client may see on their booking: their attachments, the
  // pickup and drop-off proof photos, and approved staff paperwork.
  fetchBookingDocuments: (bookingId: string) =>
    get<ClientBookingDocument[]>(`/booking/${bookingId}/documents`),

  // Both sides of every resubmission of a rejected booking, oldest first.
  fetchBookingRevisions: (bookingId: string) =>
    get<BookingRevision[]>(`/booking/${bookingId}/revisions`),

  // The times at each stop (arrival, docking, start, finish, departure) and the
  // total loaded per run. Correction notes are staff-only (admin route).
  fetchBookingTimeline: (bookingId: string) =>
    get<TimelineTrip[]>(`/booking/${bookingId}/timeline`),

  /**
   * One page of the client's Booking History (GET /booking, scoped to the
   * caller's company on the server): newest schedule date first, with the
   * status tab, search and dates applied there. `meta.statusCounts` covers all
   * of the client's bookings, keyed by lower-case status plus `all`.
   */
  fetchClientBookingsPage: async (params: {
    page: number; limit: number; status?: string; search?: string; date_from?: string; date_to?: string
  }): Promise<{ data: BookingWithRelations[]; meta: { total: number; page: number; limit: number; totalPages: number; statusCounts: Record<string, number> } }> => {
    const { data } = await proxyApi.get<{
      status: string
      data:   BookingWithRelations[]
      meta:   { total: number; page: number; limit: number; totalPages: number; statusCounts: Record<string, number> }
    }>('/booking', { params: { ...params, order: 'schedule' } })
    return { data: data.data ?? [], meta: data.meta }
  },

  fetchBookingsByClient: async (clientId: string): Promise<BookingWithRelations[]> => {
    const { data } = await proxyApi.get<{ status: string; data: BookingWithRelations[] }>(
      `/booking/client/${clientId}`,
    )
    return data?.data ?? []
  },
}
/**
 * One booking as the server's booking_snapshot() captured it: the request
 * fields, drop-offs in order and cargo lines with catalogue names resolved. The
 * "before" side also carries the rejection it received.
 */
export interface BookingSnapshot {
  origin?:                 string | null
  schedule_date?:          string | null
  call_time?:              string | null
  truck_type_needed?:      string | null
  required_volume_cbm?:    number | null
  required_weight_kg?:     number | null
  required_length_cm?:     number | null
  required_net_weight_kg?: number | null
  stackable_required?:     boolean | null
  non_stackable_cargo?:    boolean | null
  transaction_documents?:  string[] | null
  gm_status?:              string | null
  rejection_reason?:       string | null
  rejected_role?:          string | null
  rejected_at?:            string | null
  destinations?:           Record<string, unknown>[]
  cargo_items?:            Record<string, unknown>[]
}

/** One resubmission: the booking before the client's corrections and as resubmitted. */
export interface BookingRevision {
  revision_number: number
  before_snapshot: BookingSnapshot
  after_snapshot:  BookingSnapshot
  created_at:      string
}
