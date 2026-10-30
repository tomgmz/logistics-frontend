import proxyApi, { initCsrf } from '@/lib/api/auth.api'
import type { PagedResponse, PageRequest } from '@/lib/hooks/useServerTable'
import { manilaCellDate, manilaDateStamp, xlsxBlob, type XlsxColumn } from '@/lib/xlsx-export'
import { roleLabel } from '@/lib/roles'
import {
  DOCUMENT_SOURCE_LABELS,
  DOCUMENT_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  type BookingOption,
  type DocumentFilters,
  type DocumentFolder,
  type DocumentFolderLevel,
  type DocumentPage,
  type LibraryDocument,
  type StaffDocumentType,
  downloadFile,
  saveBlob,
} from '@/app/types/documents.types'

/**
 * Document Management. Viewing needs the document-management module's
 * can_view, uploading can_create, reviewing can_edit, archiving can_delete and
 * exporting can_export — all enforced on the server.
 */

const B = '/admin/documents'

function toParams(f: DocumentFilters): Record<string, string> {
  const p: Record<string, string> = {}
  if (f.search?.trim())       p.search        = f.search.trim()
  if (f.types?.length)        p.types         = f.types.join(',')
  if (f.group)                p.group         = f.group
  if (f.review_status)        p.review_status = f.review_status
  if (f.booking_id)           p.booking_id    = f.booking_id
  if (f.truck_id)             p.truck_id      = f.truck_id
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

/** One level of folders: clients, a client's bookings (or every client's, with a search), or vehicles. */
export async function fetchFolders(level: DocumentFolderLevel, q: {
  client_id?:  string
  booking_id?: string
  search?:     string
} = {}): Promise<DocumentFolder[]> {
  const params: Record<string, string> = { level }
  if (q.client_id)       params.client_id  = q.client_id
  if (q.booking_id)      params.booking_id = q.booking_id
  if (q.search?.trim())  params.search     = q.search.trim()
  const { data } = await proxyApi.get<{ data: DocumentFolder[] }>(`${B}/folders`, { params })
  return data?.data ?? []
}

/** A folder row of the Documents table; `kind` is set on the paged top level. */
export type DocumentFolderRow = DocumentFolder & { kind?: 'client' | 'booking' | 'fleet' }

/**
 * One page of the folder table. `root` is the top level (clients, matching
 * bookings while searching, then Fleet when `fleet` is set); the others are a
 * client's bookings or the vehicles.
 */
export async function fetchFoldersPage(
  level: DocumentFolderLevel | 'root',
  q: PageRequest & { client_id?: string; search?: string; fleet?: boolean },
): Promise<PagedResponse<DocumentFolderRow>> {
  const params: Record<string, string | number> = { level, page: q.page, limit: q.limit }
  if (q.client_id)      params.client_id = q.client_id
  if (q.search?.trim()) params.search    = q.search.trim()
  if (q.fleet)          params.fleet     = '1'
  const { data } = await proxyApi.get<PagedResponse<DocumentFolderRow>>(`${B}/folders`, { params })
  return { data: data.data ?? [], meta: data.meta }
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

/** Most files one download may hold (the backend caps the same). */
export const MAX_DOWNLOAD_FILES = 100

/** A ticked document as listed in the ZIP's spreadsheet. */
type ZipRow = LibraryDocument & { zip_name: string | null }

const DOCUMENT_XLSX_COLUMNS: XlsxColumn<ZipRow>[] = [
  { label: 'File in ZIP',      width: 44, value: (d) => d.zip_name ?? 'Not included: it could not be downloaded' },
  { label: 'Uploaded (PHT)',   width: 20, value: (d) => manilaCellDate(d.uploaded_at) },
  { label: 'Type',             width: 24, value: (d) => DOCUMENT_TYPE_LABELS[d.doc_type] ?? d.doc_type },
  { label: 'Source',           width: 16, value: (d) => DOCUMENT_SOURCE_LABELS[d.source] },
  { label: 'Original File',    width: 36, value: (d) => d.file_name },
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
]

/** Photos stored under a random id; in the ZIP they are named after their booking or vehicle. */
const PHOTO_TYPES = new Set(['pickup_proof', 'delivery_proof', 'odometer_photo', 'service_receipt'])

function extensionOf(d: LibraryDocument): string {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(d.file_name)?.[1]
  if (fromName) return fromName.toLowerCase()
  try {
    return /\.([a-z0-9]{2,5})$/i.exec(new URL(d.file_url).pathname)?.[1]?.toLowerCase() ?? 'bin'
  } catch {
    return 'bin'
  }
}

/** A readable, unique, filesystem-safe name for each file in the ZIP. */
function zipName(d: LibraryDocument, used: Set<string>): string {
  const ext  = extensionOf(d)
  const base = PHOTO_TYPES.has(d.doc_type)
    ? [d.reference_number ?? d.plate_number, DOCUMENT_TYPE_LABELS[d.doc_type] ?? d.doc_type].filter(Boolean).join(' - ')
    : d.file_name.replace(/\.[a-z0-9]{2,5}$/i, '')
  const safe = (base || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'document'
  let name = `${safe}.${ext}`
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${safe} (${n}).${ext}`
  used.add(name.toLowerCase())
  return name
}

/**
 * Downloads the ticked documents. The rows are read again first, so every
 * link is freshly signed however long ago it was ticked (document links last
 * 10–15 minutes). One file downloads as itself; more become one ZIP holding
 * the files plus documents.xlsx listing them. A file that cannot be fetched
 * is left out and marked in the list rather than failing the whole download.
 */
export async function downloadDocuments(keys: string[]): Promise<{ included: number; failed: number }> {
  const { data: body } = await proxyApi.get<{ data: LibraryDocument[] }>(`${B}/export`, {
    params: { keys: keys.slice(0, MAX_DOWNLOAD_FILES).join(',') },
  })
  const rows = [...(body?.data ?? [])].sort((a, b) => (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? ''))
  if (rows.length === 0) throw new Error('Those documents could not be found any more. Refresh and try again.')

  if (rows.length === 1) {
    await downloadFile(rows[0].file_url, zipName(rows[0], new Set()))
    return { included: 1, failed: 0 }
  }

  const used  = new Set<string>(['documents.xlsx'])
  const named = rows.map((d) => ({ d, name: zipName(d, used) }))
  const fetched = new Map<string, Uint8Array>()

  // A few at a time: quick, without opening dozens of requests at once.
  let next = 0
  const worker = async () => {
    while (next < named.length) {
      const { d, name } = named[next++]
      try {
        // no-store: a cached thumbnail copy of this link would fail CORS (see downloadFile).
        const res = await fetch(d.file_url, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        fetched.set(name, new Uint8Array(await res.arrayBuffer()))
      } catch {
        // Left out; the list marks it.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, named.length) }, worker))

  const included = fetched.size
  if (included === 0) throw new Error('None of the selected files could be downloaded. Please try again.')

  // Newest first in the ZIP and in its list, whatever order the fetches finished in.
  const files: Record<string, Uint8Array> = {}
  const listed: ZipRow[] = named.map(({ d, name }) => {
    const bytes = fetched.get(name)
    if (bytes) files[name] = bytes
    return { ...d, zip_name: bytes ? name : null }
  })
  files['documents.xlsx'] = new Uint8Array(await (await xlsxBlob('Documents', listed, DOCUMENT_XLSX_COLUMNS)).arrayBuffer())

  // Loaded on click so the ZIP writer stays out of the page bundle. Level 0:
  // photos, PDFs and Office files are already compressed.
  const { zipSync } = await import('fflate')
  const zipped = zipSync(files, { level: 0 })
  saveBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), `documents_${manilaDateStamp()}.zip`)
  return { included, failed: rows.length - included }
}
