'use client'

import type { ReactNode } from 'react'
import { ProtectedImg } from '@/components/ui/FileViewer'
import { FileText, FileSpreadsheet, File as FileIcon, Image as ImageIcon } from 'lucide-react'
import {
  DOCUMENT_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  previewKind,
  type LibraryDocument,
  type LibraryDocumentType,
  type ReviewStatus,
} from '@/app/types/documents.types'
import { Tip } from '@/components/ui/tooltip'

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
        <ProtectedImg src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
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
  proof_of_delivery:    '#4df9ed',
  other:                '#4df9ed',
  contract:             '#ff7a30',
  vehicle_registration: '#8a38f5',
  vehicle_insurance:    '#8a38f5',
}

/** `label` overrides the type's name, e.g. "Other: Invoice" (documentTypeLabel). */
export function DocumentTypeBadge({ type, label }: { type: LibraryDocumentType; label?: string }) {
  const color = TYPE_TONE[type] ?? '#aaa'
  return (
    <span
      className="inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border whitespace-nowrap"
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
    >
      {label ?? DOCUMENT_TYPE_LABELS[type] ?? type}
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

/**
 * A file's status as plain coloured capitals (Figma document_management,
 * 2026-11-25): Uploaded (staff paperwork; no review step since 2026-11-27)
 * green, Recorded (evidence from another flow) green, Archived grey. A file
 * rejected under the old review still reads Rejected in red.
 */
export function docStatusOf(doc: Pick<LibraryDocument, 'archived_at' | 'review_status'>): { label: string; color: string; hint?: string } {
  if (doc.archived_at) return { label: 'Archived', color: '#818181' }
  if (!doc.review_status) return { label: 'Recorded', color: '#3af626', hint: 'Recorded by the delivery or fleet flow' }
  if (doc.review_status === 'rejected') return { label: REVIEW_STATUS_LABELS.rejected, color: reviewStyle('rejected').color, hint: 'Rejected under the old review step' }
  return { label: 'Uploaded', color: reviewStyle('approved').color }
}

export function DocStatusText({ doc, className = '' }: { doc: LibraryDocument; className?: string }) {
  const s = docStatusOf(doc)
  const hint = s.hint
  const text = (
    <span className={`whitespace-nowrap font-[family-name:var(--font-darker)] font-bold uppercase ${className}`} style={{ color: s.color }}>
      {s.label}
    </span>
  )
  return hint ? <Tip label={hint}>{text}</Tip> : text
}

/** The icon tile at the start of a document or folder row: a hairline square with a grey outline icon. */
export function RowIconTile({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="flex size-10 3xl:size-[46px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[#424242] bg-[#1b1b1b] text-[#c4c4c4]">
      {children}
    </span>
  )
}

