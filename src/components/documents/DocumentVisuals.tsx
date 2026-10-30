'use client'

import { FileText, FileSpreadsheet, File as FileIcon, Image as ImageIcon } from 'lucide-react'
import {
  DOCUMENT_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  previewKind,
  type LibraryDocument,
  type LibraryDocumentType,
  type ReviewStatus,
} from '@/app/types/documents.types'

/**
 * The thumbnail source: photos are shown themselves (scaled by the box), every
 * other file has nothing to render and gets an icon.
 */
export function thumbnailUrl(url: string): string | null {
  return previewKind(url) === 'image' ? url : null
}

/** All a thumbnail needs, so the client's history can use it with its slimmer rows. */
type ThumbDoc = Pick<LibraryDocument, 'file_url' | 'file_name'>

function FallbackIcon({ doc, size }: { doc: ThumbDoc; size: number }) {
  const name = doc.file_name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    return <FileSpreadsheet size={size} className="text-emerald-300/80" />
  }
  if (name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.doc')) {
    return <FileText size={size} className="text-sky-300/80" />
  }
  if (previewKind(doc.file_url) === 'image') return <ImageIcon size={size} className="text-white/40" />
  return <FileIcon size={size} className="text-white/40" />
}

export function DocumentThumb({ doc, size = 40, big = false }: { doc: ThumbDoc; size?: number; big?: boolean }) {
  const thumb = thumbnailUrl(doc.file_url)
  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40 flex items-center justify-center"
      style={big ? { width: '100%', aspectRatio: '4 / 3' } : { width: size, height: size }}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <FallbackIcon doc={doc} size={big ? 36 : Math.round(size * 0.45)} />
      )}
    </div>
  )
}

const TYPE_TONE: Record<LibraryDocumentType, string> = {
  transaction_document: '#4df9ed',
  pickup_proof:         '#ffea00',
  delivery_proof:       '#3af626',
  odometer_photo:       '#8a38f5',
  service_receipt:      '#8a38f5',
  delivery_receipt:     '#4df9ed',
  trip_ticket:          '#4df9ed',
  dtr:                  '#4df9ed',
  proof_of_delivery:    '#4df9ed',
  purchase_order:       '#4df9ed',
  maintenance_record:   '#4df9ed',
  other:                '#4df9ed',
}

export function DocumentTypeBadge({ type }: { type: LibraryDocumentType }) {
  const color = TYPE_TONE[type] ?? '#aaa'
  return (
    <span
      className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border whitespace-nowrap"
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
    >
      {DOCUMENT_TYPE_LABELS[type] ?? type}
    </span>
  )
}

function reviewStyle(status: ReviewStatus) {
  switch (status) {
    case 'pending':  return { bg: 'rgba(255,234,0,0.12)', color: '#ffea00', border: 'rgba(255,234,0,0.35)' }
    case 'approved': return { bg: 'rgba(58,246,38,0.12)',  color: '#3af626', border: 'rgba(58,246,38,0.35)' }
    default:         return { bg: 'rgba(246,38,38,0.12)', color: '#f62626', border: 'rgba(246,38,38,0.35)' }
  }
}

export function ReviewStatusBadge({ doc }: { doc: LibraryDocument }) {
  if (doc.archived_at) {
    return (
      <span className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border text-white/50 border-white/15 bg-white/5">
        Archived
      </span>
    )
  }
  if (!doc.review_status) {
    return <span className="text-[11px] text-white/35" title="Recorded by the delivery or fleet flow; no review needed">Recorded</span>
  }
  const st = reviewStyle(doc.review_status)
  return (
    <span
      className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border whitespace-nowrap"
      style={{ color: st.color, borderColor: st.border, background: st.bg }}
    >
      {REVIEW_STATUS_LABELS[doc.review_status]}
    </span>
  )
}
