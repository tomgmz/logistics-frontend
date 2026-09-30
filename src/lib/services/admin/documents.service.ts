import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import { downloadXlsx, manilaCellDate, manilaDateStamp, type XlsxColumn } from '@/lib/xlsx-export'
import { roleLabel } from '@/lib/roles'
import {
  DOCUMENT_SOURCE_LABELS,
  DOCUMENT_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  type BookingOption,
  type DocumentFilters,
  type DocumentPage,
  type LibraryDocument,
  type StaffDocumentType,
} from '@/app/types/documents.types'

/**
 * Document Management. Viewing needs the document-management module's
 * can_view, uploading can_create, reviewing can_edit, archiving can_delete and
 * exporting can_export — all enforced on the server.
 */

const B = '/admin/documents'

/** Same as the backend's DOCUMENT_EXPORT_ROW_CAP. */
export const DOCUMENT_EXPORT_ROW_CAP = 5_000

function toParams(f: DocumentFilters): Record<string, string> {
  const p: Record<string, string> = {}
  if (f.search?.trim())       p.search        = f.search.trim()
  if (f.types?.length)        p.types         = f.types.join(',')
  if (f.group)                p.group         = f.group
  if (f.review_status)        p.review_status = f.review_status
  if (f.booking_id)           p.booking_id    = f.booking_id
  if (f.date_from)            p.date_from     = f.date_from
  if (f.date_to)              p.date_to       = f.date_to
  if (f.archived === 'only')  p.archived      = 'only'
  if (f.sort)                 p.sort          = f.sort
  return p
}

export async function fetchDocuments(f: DocumentFilters, page: number, limit: number): Promise<DocumentPage> {
  const { data } = await proxyApi.get<DocumentPage & { status: string }>(B, {
    params: { ...toParams(f), page, limit },
  })
  return data
}

export async function searchBookingsForUpload(search: string): Promise<BookingOption[]> {
  const { data } = await proxyApi.get<{ data: BookingOption[] }>(`${B}/bookings`, { params: { search } })
  return data?.data ?? []
}

export async function uploadDocuments(input: {
  bookingId:    string
  documentType: StaffDocumentType
  notes:        string
  files:        File[]
}): Promise<{ document_ids: string[] }> {
  await initCsrf()
  const form = new FormData()
  form.append('booking_id', input.bookingId)
  form.append('document_type', input.documentType)
  if (input.notes.trim()) form.append('notes', input.notes.trim())
  input.files.forEach((f) => form.append('documents', f))

  const { data } = await proxyApi.post<{ data: { document_ids: string[] } }>(B, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.data
}

export async function reviewDocument(documentId: string, decision: 'approved' | 'rejected', reason?: string): Promise<void> {
  await initCsrf()
  await proxyApi.patch(`${B}/${documentId}/review`, { decision, reason: reason?.trim() || null })
}

export async function archiveDocument(documentId: string): Promise<void> {
  await initCsrf()
  await proxyApi.post(`${B}/${documentId}/archive`)
}

export async function restoreDocument(documentId: string): Promise<void> {
  await initCsrf()
  await proxyApi.post(`${B}/${documentId}/restore`)
}

const DOCUMENT_XLSX_COLUMNS: XlsxColumn<LibraryDocument>[] = [
  { label: 'Uploaded (PHT)',   width: 20, value: (d) => manilaCellDate(d.uploaded_at) },
  { label: 'Type',             width: 24, value: (d) => DOCUMENT_TYPE_LABELS[d.doc_type] ?? d.doc_type },
  { label: 'Source',           width: 16, value: (d) => DOCUMENT_SOURCE_LABELS[d.source] },
  { label: 'File',             width: 36, value: (d) => d.file_name },
  { label: 'Booking',          width: 18, value: (d) => d.reference_number },
  { label: 'Client',           width: 26, value: (d) => d.company_name },
  { label: 'Vehicle',          width: 14, value: (d) => d.plate_number },
  { label: 'Details',          width: 40, value: (d) => d.detail },
  { label: 'Uploaded By',      width: 24, value: (d) => d.uploaded_by_name },
  { label: 'Uploader Role',    width: 22, value: (d) => roleLabel(d.uploaded_by_role) || null },
  { label: 'Review Status',    width: 16, value: (d) => (d.review_status ? REVIEW_STATUS_LABELS[d.review_status] : null) },
  { label: 'Reviewed By',      width: 24, value: (d) => d.reviewed_by_name },
  { label: 'Rejection Reason', width: 36, value: (d) => d.rejection_reason },
  { label: 'Outside Geofence', width: 36, value: (d) => d.override_reason },
  { label: 'Notes',            width: 36, value: (d) => d.notes },
  { label: 'Link',             width: 60, value: (d) => d.file_url },
]

export async function exportDocumentsXlsx(f: DocumentFilters): Promise<{ count: number; truncated: boolean }> {
  const { data: body } = await proxyApi.get<{
    data: LibraryDocument[]
    meta: { truncated: boolean; count: number }
  }>(`${B}/export`, { params: toParams(f) })

  const rows = body?.data ?? []
  if (rows.length > 0) {
    await downloadXlsx(`documents_${manilaDateStamp()}.xlsx`, 'Documents', rows, DOCUMENT_XLSX_COLUMNS)
  }
  return { count: rows.length, truncated: !!body?.meta?.truncated }
}
