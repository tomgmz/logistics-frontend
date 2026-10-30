/**
 * Document Management — mirrors logistics-backend/src/types/documents.types.ts.
 *
 * Derived documents (client attachments, driver proof photos, fleet photos and
 * receipts) are read-only evidence from other flows. Only staff documents —
 * paperwork attached from this page — can be reviewed or archived.
 */

export const STAFF_DOCUMENT_TYPES = [
  'delivery_receipt',
  'trip_ticket',
  'dtr',
  'proof_of_delivery',
  'purchase_order',
  'maintenance_record',
  'other',
] as const
export type StaffDocumentType = (typeof STAFF_DOCUMENT_TYPES)[number]

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
  delivery_receipt:     'Signed Delivery Receipt',
  trip_ticket:          'Trip Ticket',
  dtr:                  'Daily Time Record',
  proof_of_delivery:    'Proof of Delivery',
  purchase_order:       'Purchase Order',
  maintenance_record:   'Maintenance Record',
  other:                'Other Document',
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
  doc_group:        'booking' | 'fleet'
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
  group?:         'booking' | 'fleet'
  review_status?: ReviewStatus
  booking_id?:    string
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
    const href = URL.createObjectURL(await res.blob())
    const a    = document.createElement('a')
    a.href     = href
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Safari reads the blob after click() returns; revoke it later, not now.
    setTimeout(() => URL.revokeObjectURL(href), 60_000)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

export function fileSizeLabel(bytes: number | null): string | null {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
