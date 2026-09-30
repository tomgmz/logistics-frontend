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
  // Cloudinary image resources without an extension are still images.
  if (path.includes('/image/upload/') && !/\.[a-z0-9]{2,5}$/.test(path)) return 'image'
  return 'other'
}

/**
 * A URL that downloads instead of opening. Cloudinary's fl_attachment flag
 * only works on image/video resources; raw files (DOCX, XLSX) are served as
 * downloads by the browser anyway.
 */
export function downloadUrl(url: string): string {
  return url.includes('/image/upload/')
    ? url.replace('/image/upload/', '/image/upload/fl_attachment/')
    : url
}

export function fileSizeLabel(bytes: number | null): string | null {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
