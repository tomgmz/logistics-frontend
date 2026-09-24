import proxyApi from '@/lib/api/auth.api'
import type { BookingWithRelations } from '@/lib/store/slice/routeMap.slice'

/**
 * Staff transaction history.
 *
 * Talks to /api/transaction-history, not /api/booking: the two are gated by
 * different modules, and a role can hold this one without the other.
 */

export type DateBasis = 'scheduled' | 'booked' | 'completed'
export type SortKey   = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

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
  grossValue:  number
}

export interface TransactionSummary {
  total:            number
  grossValue:       number
  averageValue:     number
  completed:        number
  cancelled:        number
  unpriced:         number
  cancellationRate: number
  breakdown:        CompanyBreakdownRow[]
}

export interface CompanyOption {
  clientId:    string
  companyName: string
  count:       number
}

export interface ExportRow {
  reference_number: string | null
  company_name:     string
  status:           string
  booked_date:      string | null
  schedule_date:    string | null
  completed_date:   string | null
  origin:           string | null
  destinations:     string | null
  truck_type:       string | null
  total_cost:       number | null
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

  // Returns rows, not a file. The Next proxy re-serialises every response as
  // JSON, so the CSV itself is assembled in the browser.
  exportRows: async (
    filters: TransactionFilters,
  ): Promise<{ rows: ExportRow[]; truncated: boolean }> => {
    const { data: body } = await proxyApi.get<
      ApiResponse<ExportRow[]> & { meta: { truncated: boolean; count: number } }
    >(`${B}/export`, { params: toParams(filters) })

    return { rows: body?.data ?? [], truncated: !!body?.meta?.truncated }
  },
}

const CSV_COLUMNS: { key: keyof ExportRow; label: string; date?: true }[] = [
  { key: 'reference_number', label: 'Reference' },
  { key: 'company_name',     label: 'Company' },
  { key: 'status',           label: 'Status' },
  { key: 'booked_date',      label: 'Booked Date',    date: true },
  { key: 'schedule_date',    label: 'Scheduled Date', date: true },
  { key: 'completed_date',   label: 'Completed Date', date: true },
  { key: 'origin',           label: 'Pick Up' },
  { key: 'destinations',     label: 'Drop Offs' },
  { key: 'truck_type',       label: 'Truck Type' },
  { key: 'total_cost',       label: 'Total Cost' },
]

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // A leading =, +, - or @ makes a spreadsheet treat the cell as a formula.
  // Addresses and company names are user-supplied, so neutralise them.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * A bare YYYY-MM-DD is re-parsed by Excel as a real date and re-rendered in the
 * machine's short-date format, which is wider than the default column and shows
 * as `#######` until every date column is widened by hand. A CSV carries no
 * column widths, so the only fix is to keep the cell text: Excel reads
 * ="2026-09-09" as a formula returning a string, and text overflows the column
 * instead of hashing out. ISO text still sorts chronologically.
 */
function csvDateCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  // Emitted as the already-escaped CSV field so csvCell's formula guard, which
  // exists for user-supplied text, does not neutralise our own formula.
  return `"=""${String(value).replace(/"/g, '')}"""`
}

export function buildTransactionCsv(rows: ExportRow[]): string {
  const header = CSV_COLUMNS.map((c) => csvCell(c.label)).join(',')
  const body   = rows.map((r) =>
    CSV_COLUMNS.map((c) => (c.date ? csvDateCell(r[c.key]) : csvCell(r[c.key]))).join(','))
  // BOM so Excel opens the peso amounts and Filipino place names as UTF-8.
  return '﻿' + [header, ...body].join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
