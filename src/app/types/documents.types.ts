/**
 * Document Management — mirrors logistics-backend/src/types/documents.types.ts.
 *
 * Derived documents (client attachments, driver proof photos, fleet photos and
 * receipts) are read-only evidence from other flows. Only staff documents —
 * paperwork attached from this page — can be reviewed or archived.
 */

/**
 * Staff paperwork, in the order the upload form lists it. A Contract belongs
 * to a client (its Contract folder), never a booking, and is staff only.
 * Proof of Delivery and Other go on a booking; Other carries the type the
 * uploader typed in and is staff only.
 */
export const STAFF_DOCUMENT_TYPES = [
  'contract',
  'proof_of_delivery',
  'other',
] as const
export type StaffDocumentType = (typeof STAFF_DOCUMENT_TYPES)[number]

/** What can be picked when uploading to a booking. */
export const BOOKING_DOCUMENT_TYPES = ['proof_of_delivery', 'other'] as const satisfies readonly StaffDocumentType[]

/** The longest type an uploader may type in for Other (the backend's OTHER_LABEL_MAX). */
export const OTHER_LABEL_MAX = 60

export const DERIVED_DOCUMENT_TYPES = [
  'transaction_document',
  'pickup_proof',
  'delivery_proof',
  'odometer_photo',
  'service_receipt',
] as const
export type DerivedDocumentType = (typeof DERIVED_DOCUMENT_TYPES)[number]

export type LibraryDocumentType = StaffDocumentType | DerivedDocumentType

// Spelled out in full — the UI never shows abbreviations (DTR, POD, PO).
export const DOCUMENT_TYPE_LABELS: Record<LibraryDocumentType, string> = {
  transaction_document: 'Transaction Document',
  pickup_proof:         'Pickup Proof',
  delivery_proof:       'Delivery Proof',
  odometer_photo:       'Odometer Photo',
  service_receipt:      'Service Receipt',
  proof_of_delivery:    'Proof of Delivery',
  other:                'Other',
  contract:             'Contract',
}

/** A row's type as shown: Other reads "Other: <what was typed>". */
export function documentTypeLabel(d: { doc_type: LibraryDocumentType; other_label?: string | null }): string {
  if (d.doc_type === 'other' && d.other_label) return `Other: ${d.other_label}`
  return DOCUMENT_TYPE_LABELS[d.doc_type] ?? d.doc_type
}

export type DocumentSource = 'client' | 'driver' | 'fleet' | 'staff'

export const DOCUMENT_SOURCE_LABELS: Record<DocumentSource, string> = {
  client: 'Client',
  driver: 'Driver',
  fleet:  'Fleet Manager',
  staff:  'Staff Upload',
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending:  'Awaiting Review',
  approved: 'Approved',
  rejected: 'Rejected',
}

export interface LibraryDocument {
  doc_key:          string
  doc_type:         LibraryDocumentType
  /** `client`: a contract, filed under the client rather than a booking. */
  doc_group:        'booking' | 'fleet' | 'client'
  source:           DocumentSource
  file_url:         string
  file_name:        string
  uploaded_at:      string | null
  detail:           string | null
  notes:            string | null
  override_reason:  string | null
  booking_id:       string | null
  reference_number: string | null
  booking_status:   string | null
  company_name:     string | null
  client_id:        string | null
  /** Other only: the type the uploader typed in. */
  other_label:      string | null
  truck_id:         string | null
  plate_number:     string | null
  uploaded_by:      string | null
  uploaded_by_name: string | null
  uploaded_by_role: string | null
  document_id:      string | null
  review_status:    ReviewStatus | null
  rejection_reason: string | null
  reviewed_at:      string | null
  reviewed_by_name: string | null
  archived_at:      string | null
  bytes:            number | null
}

export interface DocumentCounts {
  total:          number
  pending_review: number
  by_type:        Partial<Record<LibraryDocumentType, number>>
}

export interface DocumentFilters {
  search?:        string
  types?:         LibraryDocumentType[]
  group?:         'booking' | 'fleet' | 'client'
  review_status?: ReviewStatus
  booking_id?:    string
  /** A client's Contract folder (with group 'client'). */
  client_id?:     string
  /** A vehicle's folder. */
  truck_id?:      string
  date_from?:     string
  date_to?:       string
  archived?:      'hide' | 'only'
  sort?:          'asc' | 'desc'
}

export interface DocumentPage {
  data:   LibraryDocument[]
  total:  number
  page:   number
  limit:  number
  counts: DocumentCounts
}

/** A folder row: a client, one of its bookings, or a vehicle (see backend findFolders). */
export interface DocumentFolder {
  id:             string | null
  name:           string | null
  client_id:      string | null
  company_name:   string | null
  booking_status: string | null
  schedule_date:  string | null
  booking_count:  number
  file_count:     number
  pending_review: number
  last_upload:    string | null
}

export type DocumentFolderLevel = 'clients' | 'bookings' | 'vehicles'

export interface ClientOption {
  client_id:    string
  company_name: string | null
}

export interface BookingOption {
  booking_id:       string
  reference_number: string | null
  status:           string
  schedule_date:    string | null
  company_name:     string | null
}

export type PreviewKind = 'image' | 'pdf' | 'other'

/** How the file can be shown in the browser, judged from its URL. */
export function previewKind(url: string): PreviewKind {
  const path = url.split('?')[0].toLowerCase()
  if (/\.(jpe?g|png|webp|gif|heic|heif|avif)$/.test(path)) return 'image'
  if (path.endsWith('.pdf')) return 'pdf'
  // Older Cloudinary image resources without an extension are still images.
  if (path.includes('/image/upload/') && !/\.[a-z0-9]{2,5}$/.test(path)) return 'image'
  return 'other'
}

/**
 * Saves the file instead of opening it. File links are signed and expire, so
 * the name cannot be forced through the URL; the file is fetched and saved
 * from a blob instead. If the fetch is refused (storage CORS not set for this
 * site, very old browser), it opens in a new tab, where it can still be saved.
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  try {
    // no-store: the thumbnail already loaded this exact link through <img>,
    // which sends no Origin, and storage answers that without CORS headers or
    // `Vary: Origin`. Read from the browser cache, that copy fails CORS here,
    // so ask storage directly.
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    saveBlob(await res.blob(), fileName)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

/** Hands a file built in the browser to the user as a download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = href
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Safari reads the blob after click() returns; revoke it later, not now.
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
}

export function fileSizeLabel(bytes: number | null): string | null {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
