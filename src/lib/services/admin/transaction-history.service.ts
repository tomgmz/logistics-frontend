import proxyApi from '@/lib/api/auth.api'
import type { BookingWithRelations } from '@/lib/types/booking-relations'
import { downloadXlsxSheets, manilaCellDate, type XlsxColumn } from '@/lib/xlsx-export'
import { roleLabel } from '@/lib/roles'

/**
 * Staff transaction history.
 *
 * Talks to /api/transaction-history, not /api/booking: the two are gated by
 * different modules, and a role can hold this one without the other.
 */

export type DateBasis = 'scheduled' | 'booked' | 'completed'
export type SortKey   = 'date_desc' | 'date_asc'

export interface TransactionFilters {
  status?:    string
  search?:    string
  clientIds?: string[]
  dateBasis?: DateBasis
  dateFrom?:  string
  dateTo?:    string
  sort?:      SortKey
}

export interface TransactionListMeta {
  total:        number
  page:         number
  limit:        number
  totalPages:   number
  statusCounts: Record<string, number>
}

export interface CompanyBreakdownRow {
  clientId:    string | null
  companyName: string
  count:       number
}

export interface TransactionSummary {
  total:            number
  completed:        number
  cancelled:        number
  cancellationRate: number
  breakdown:        CompanyBreakdownRow[]
}

export interface CompanyOption {
  clientId:    string
  companyName: string
  count:       number
}

/**
 * One row of the exported dispatch sheet: one trip's visit to one drop-off.
 * A booking with no trip plan yet has one row per drop-off and no trip number.
 */
export interface ExportRow {
  booking_id:      string
  dispatched_date: string | null   // YYYY-MM-DD
  vendor_name:     string | null
  plate_number:    string | null
  driver_id:       string | null   // the driver's license number
  fleet_type:      string | null
  driver_name:     string | null
  call_time:       string | null   // HH:MM
  origin:          string | null
  trip_number:     number | null
  destination:     string | null
}

/** One run's proof at a drop-off. */
export interface RecordTripStop {
  trip_stop_id:          string
  sequence_order:        number
  status:                string
  delivered_at:          string | null
  proof_photo_url:       string | null
  proof_at:              string | null
  proof_distance_m:      number | null
  proof_override_reason: string | null
  booking_destinations?: { address?: string | null } | null
}

export interface RecordTrip {
  trip_id:                      string
  trip_number:                  number
  status:                       string
  notes:                        string | null
  pickup_proof_photo_url:       string | null
  pickup_proof_at:              string | null
  pickup_proof_distance_m:      number | null
  pickup_proof_override_reason: string | null
  booking_trip_stops:           RecordTripStop[]
}

export interface RecordDelivery {
  status:                string
  pickup_time:           string | null
  delivery_time:         string | null
  created_at:            string
  is_vendor_supplied:    boolean
  vendor_name:           string | null
  vendor_contact:        string | null
  vendor_driver_name:    string | null
  vendor_driver_license: string | null
  vendor_driver_phone:   string | null
  vendor_driver_email:   string | null
  vendor_vehicle_plate:  string | null
  vendor_vehicle_type:   string | null
  helper_name?:          string | null
  second_driver?: {
    license_number?: string | null
    users?: { first_name?: string; last_name?: string; phone?: string | null; email?: string | null } | null
  } | null
  drivers?: {
    license_number?: string | null
    license_expiry?: string | null
    users?: { first_name?: string; last_name?: string; phone?: string | null; email?: string | null } | null
  } | null
  trucks?: {
    plate_number?: string | null
    truck_models?: { name?: string | null; vehicle_type?: string | null } | null
  } | null
}

export interface RecordReport {
  report_id:         string
  source:            'quick' | 'detailed'
  incident_type:     string | null
  sub_type:          string | null
  description:       string | null
  photo_urls:        string[]
  video_urls:        string[]
  address:           string | null
  trip_can_continue: boolean | null
  status:            string
  resolution_note:   string | null
  resolved_at:       string | null
  created_at:        string
  latitude?:         number | string | null
  longitude?:        number | string | null
  drivers?: { users?: { first_name?: string; last_name?: string; phone?: string | null } | null } | null
  trucks?:  { plate_number?: string | null; truck_models?: { name?: string | null; vehicle_type?: string | null } | null } | null
}

export interface RecordInspection {
  inspection_id: string
  items:         Record<string, boolean>
  passed:        boolean
  notes:         string | null
  inspected_at:  string
  inspector?:    { first_name?: string; last_name?: string } | null
}

export interface DecisionActor {
  name: string | null
  /** users.role the person acted in, e.g. 'general_manager' or 'admin'. */
  role: string | null
  at:   string | null
}

export interface TransactionApprovals {
  /** Approve/reject: the General Manager, or the Company Administrator in their place.
   *  `remarks` are the approval remarks, or the rejection remarks on a rejection. */
  review:     (DecisionActor & { outcome: string | null; remarks: string | null }) | null
  /** Who assigned the driver and vehicle. */
  assignment: DecisionActor | null
  /** A cancellation or Company Administrator rejection. */
  cancelled:  DecisionActor | null
  /** Who confirmed completion; `auto` when it completed on its own after 3 days. */
  completion: (DecisionActor & { auto: boolean }) | null
  /** A problem the client reported instead of confirming. */
  issue:      { note: string; at: string | null } | null
}

export interface TransactionRecord {
  delivery:    RecordDelivery | null
  trips:       RecordTrip[]
  reports:     RecordReport[]
  /** The passed inspection the vehicle was assigned on, if any. */
  inspection:  RecordInspection | null
  approvals:   TransactionApprovals
  /** Every change of driver, second driver, helper and vehicle, and navigation take-overs, oldest first. */
  crew_changes?: CrewChangeEvent[]
  /** The History section's three groups; null when the server could not read it. */
  history?:    BookingHistory | null
}

/** One card of the History section (backend booking-history.service.ts). */
export interface HistoryItem {
  key:      string
  at:       string | null
  /** Approvals and transaction cards show the date only; transit cards the time too. */
  withTime: boolean
  title:    string
  by?:      { label: string; name: string | null; role: string | null } | null
  lines?:   string[]
  /** Yellow words after the last line. */
  accent?:  string | null
  place?:   { label: string; address: string; kind: string | null } | null
  /** Orange line under the place. */
  late?:    string | null
  /** Grey "Trip 1 of 2". */
  trip?:    string | null
  remarks?: string | null
  note?:    { text: string; tone: 'yellow' | 'orange' | 'red' } | null
  /** An "Assigned" list that opens and closes. */
  list?:    { title: string; rows: Array<{ label: string; value: string }> } | null
  /** A photo row (the load moved onto the new vehicle). */
  photo?:   { url: string; label: string } | null
}

export interface BookingHistory {
  approvals:   HistoryItem[]
  transaction: HistoryItem[]
  transit:     HistoryItem[]
}

/** One crew change (one assignment / replacement / swap) or one navigation take-over. */
export interface CrewChangeEvent {
  at:      string
  kind:    'crew_changed' | 'navigation_moved'
  title:   string
  lines:   string[]
  reason:  string | null
  by:      string | null
  by_role: string | null
}

interface ApiResponse<T> {
  status:   string
  data:     T
  message?: string
}

const B = '/transaction-history'

/** Filters → query string. Empty values are dropped so the URL stays readable. */
function toParams(f: TransactionFilters): Record<string, unknown> {
  return {
    status:     f.status && f.status !== 'all' ? f.status : undefined,
    search:     f.search?.trim() || undefined,
    client_ids: f.clientIds?.length ? f.clientIds.join(',') : undefined,
    date_basis: f.dateBasis || undefined,
    date_from:  f.dateFrom  || undefined,
    date_to:    f.dateTo    || undefined,
    sort:       f.sort      || undefined,
  }
}

export const transactionHistoryService = {
  list: async (
    filters: TransactionFilters & { page: number; limit: number },
  ): Promise<{ rows: BookingWithRelations[]; meta: TransactionListMeta }> => {
    const { data: body } = await proxyApi.get<
      ApiResponse<BookingWithRelations[]> & { meta: TransactionListMeta }
    >(B, { params: { ...toParams(filters), page: filters.page, limit: filters.limit } })

    return {
      rows: body?.data ?? [],
      meta: body?.meta ?? {
        total: 0, page: filters.page, limit: filters.limit,
        totalPages: 1, statusCounts: { all: 0 },
      },
    }
  },

  summary: async (filters: TransactionFilters): Promise<TransactionSummary> => {
    const { data } = await proxyApi.get<ApiResponse<TransactionSummary>>(
      `${B}/summary`, { params: toParams(filters) },
    )
    return data.data
  },

  companies: async (): Promise<CompanyOption[]> => {
    const { data } = await proxyApi.get<ApiResponse<CompanyOption[]>>(`${B}/companies`)
    return data.data ?? []
  },

  /** Crew, vehicle, trip proof, reports and inspection for one booking. */
  record: async (bookingId: string): Promise<TransactionRecord> => {
    const { data } = await proxyApi.get<ApiResponse<TransactionRecord>>(
      `${B}/${encodeURIComponent(bookingId)}/record`,
    )
    return data.data
  },

  // Returns rows, not a file. The Next proxy re-serialises every response as
  // JSON, so the CSV itself is assembled in the browser.
  exportRows: async (
    filters: TransactionFilters,
  ): Promise<{ rows: ExportRow[]; crewChanges: CrewChangeExportRow[]; truncated: boolean }> => {
    const { data: body } = await proxyApi.get<
      ApiResponse<ExportRow[]> & { crew_changes?: CrewChangeExportRow[]; meta: { truncated: boolean; count: number } }
    >(`${B}/export`, { params: toParams(filters) })

    return { rows: body?.data ?? [], crewChanges: body?.crew_changes ?? [], truncated: !!body?.meta?.truncated }
  },
}

/** "MFM-TUNASAN" out of "MFM-TUNASAN, 123 Some Rd, Muntinlupa, …": the place, not the street. */
function placeName(address: string | null): string | null {
  if (!address) return null
  return address.split(',')[0].trim() || address
}

/** 1 → "1ST", 2 → "2ND", 11 → "11TH". */
function ordinal(n: number | null): string | null {
  if (n == null) return null
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' } as Record<number, string>)[n % 10] ?? 'TH'
  return `${n}${suffix}`
}

/** A YYYY-MM-DD day as an Excel date cell (the writer stores Dates by their UTC fields). */
function dayCell(day: string | null): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  return new Date(`${day}T00:00:00Z`)
}

/** The dispatch sheet's columns, in operations' own order and words. */
export const DISPATCH_COLUMNS: XlsxColumn<ExportRow>[] = [
  { label: 'Dispatched Date',    width: 14, value: (r) => dayCell(r.dispatched_date), format: 'mm/dd/yyyy', align: 'center' },
  { label: 'Vendor Name',        width: 28, value: (r) => r.vendor_name },
  { label: 'Plate Number',       width: 13, value: (r) => r.plate_number, align: 'center' },
  { label: "Driver's ID",        width: 17, value: (r) => r.driver_id, align: 'center' },
  { label: 'Fleet Type',         width: 13, value: (r) => r.fleet_type, align: 'center' },
  { label: 'Drivers Name',       width: 30, value: (r) => r.driver_name },
  { label: 'Assigned Call Time', width: 12, value: (r) => r.call_time, align: 'center' },
  { label: 'Origin',             width: 26, value: (r) => placeName(r.origin) },
  { label: 'Trip Sequence',      width: 11, value: (r) => ordinal(r.trip_number), align: 'center' },
  { label: 'Destination',        width: 28, value: (r) => placeName(r.destination) },
]

/** One row of the "Driver Changes" sheet: one seat changed, or one navigation take-over. */
export interface CrewChangeExportRow {
  booking_id:       string
  reference_number: string | null
  changed_at:       string
  change:           string
  seat:             string
  from:             string | null
  to:               string | null
  reason:           string | null
  by:               string | null
  by_role:          string | null
}

export const CREW_CHANGE_COLUMNS: XlsxColumn<CrewChangeExportRow>[] = [
  { label: 'Booking',     width: 20, value: (r) => r.reference_number, align: 'center' },
  { label: 'Date and Time', width: 18, value: (r) => manilaCellDate(r.changed_at), format: 'mm/dd/yyyy hh:mm', align: 'center' },
  { label: 'Change',      width: 38, value: (r) => r.change },
  { label: 'What',        width: 18, value: (r) => r.seat },
  { label: 'From',        width: 28, value: (r) => r.from },
  { label: 'To',          width: 28, value: (r) => r.to },
  { label: 'Reason',      width: 40, value: (r) => r.reason },
  { label: 'Changed By',  width: 26, value: (r) => r.by },
  { label: 'Role',        width: 22, value: (r) => (r.by_role ? roleLabel(r.by_role) : null) },
]

const SHEET_HEADER = { headerBackground: '#1F3D7A', headerTextColor: '#FFFFFF' }

/**
 * Builds and downloads the export (.xlsx): the Dispatch sheet, and a "Driver
 * Changes" sheet with every change of driver, second driver, helper and
 * vehicle (and navigation take-overs) on the same bookings.
 */
export function downloadDispatchXlsx(fileName: string, rows: ExportRow[], crewChanges: CrewChangeExportRow[] = []): Promise<void> {
  return downloadXlsxSheets(fileName, [
    { name: 'Dispatch',       rows,                 columns: DISPATCH_COLUMNS,    options: SHEET_HEADER },
    { name: 'Driver Changes', rows: crewChanges,    columns: CREW_CHANGE_COLUMNS, options: SHEET_HEADER },
  ])
}
