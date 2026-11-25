'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, MapPinOff } from 'lucide-react'

import { FilePreview } from '@/components/ui/FileViewer'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

import { formatDateTime } from '@/app/utils/timeFormat'
import { roleLabel } from '@/lib/roles'
import {
  DOCUMENT_SOURCE_LABELS,
  documentTypeLabel,
  downloadFile,
  fileSizeLabel,
  type LibraryDocument,
} from '@/app/types/documents.types'
import { docStatusOf } from './DocumentVisuals'
import { Tip } from '@/components/ui/tooltip'

/**
 * The preview's action buttons (Figma "modal preview document", 2026-11-25):
 * equal-width outlined buttons in one row at the foot of the details panel.
 * `tone` is the outline and text colour.
 */
export const PREVIEW_ACTION_CLASS =
  'ff-sc h-11 3xl:h-12 min-w-0 rounded-[10px] border bg-transparent px-3 text-base 3xl:text-lg font-bold transition-colors disabled:opacity-40 [@media(hover:hover)]:enabled:hover:bg-white/[0.04]'
export const PREVIEW_TONE = {
  archive: { color: '#ffea00', borderColor: '#ffea00' },
  reject:  { color: '#f62626', borderColor: '#f62626' },
  approve: { color: '#4df9ed', borderColor: '#4df9ed' },
  neutral: { color: '#c4c4c4', borderColor: '#818181' },
} as const

/** One row of the details box: grey small-caps label left, white value right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#424242] px-4 py-3 last:border-0">
      <span className="ff-sc shrink-0 text-xs 3xl:text-sm font-bold text-[#818181]">{label}</span>
      <span className="ff-sc min-w-0 break-words text-right text-xs 3xl:text-sm font-bold text-white">{children}</span>
    </div>
  )
}

/**
 * One document: a large preview beside everything known about it. The caller
 * passes whatever actions the viewer's tier allows (review, archive), built
 * with PREVIEW_ACTION_CLASS / PREVIEW_TONE so they sit in one equal row.
 */
export default function DocumentPreviewModal({
  doc,
  bookingHref,
  onClose,
  actions,
}: {
  doc:          LibraryDocument | null
  bookingHref?: string | null
  onClose:      () => void
  actions?:     ReactNode
}) {
  useBodyScrollLock(!!doc)

  return (
    <AnimatePresence>
      {doc && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-2 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Document ${doc.file_name}`}
            className="flex h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#424242] bg-[#1b1b1b] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: the file's name, then its type and booking or plate. */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#424242] px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0">
                <Tip label={doc.file_name}>
                  <h2 className="ff-sc truncate text-xl sm:text-2xl font-bold leading-tight text-white">{doc.file_name}</h2>
                </Tip>
                <p className="ff-regular mt-0.5 truncate text-sm sm:text-base text-[#818181]">
                  {documentTypeLabel(doc)}
                  {doc.reference_number && ` · ${doc.reference_number}`}
                  {doc.plate_number && ` · ${doc.plate_number}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Tip label="Download"><button
                  type="button"
                  onClick={() => { void downloadFile(doc.file_url, doc.file_name) }}
                  className="rounded-lg p-2 text-[#c4c4c4] [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-white"
                  aria-label="Download"
                >
                  <Download size={18} />
                </button></Tip>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-[#818181] [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-white"
                  aria-label="Close"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div className="flex min-h-[220px] flex-1 items-center justify-center overflow-hidden bg-[#0a0a0a]" onContextMenu={(e) => e.preventDefault()}>
                <FilePreview url={doc.file_url} name={doc.file_name} onDownload={() => { void downloadFile(doc.file_url, doc.file_name) }} />
              </div>

              <aside className="flex max-h-[50%] min-h-0 shrink-0 flex-col border-t border-[#424242] lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0 3xl:w-[440px]">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                  {/* Its type on the left, its status on the right. */}
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-[family-name:var(--font-darker)] text-base 3xl:text-lg font-bold uppercase leading-tight text-white">
                      {documentTypeLabel(doc)}
                    </span>
                    <span className="shrink-0 text-right font-[family-name:var(--font-darker)] text-base 3xl:text-lg font-bold uppercase leading-tight" style={{ color: docStatusOf(doc).color }}>
                      {docStatusOf(doc).label}
                    </span>
                  </div>

                  {doc.override_reason && (
                    <div className="flex gap-2 rounded-xl border border-[#ff7a30]/40 bg-[#ff7a30]/10 p-3 text-xs text-[#ffc8a8]">
                      <MapPinOff size={14} className="mt-0.5 shrink-0" />
                      <span>
                        <span className="block font-bold">Taken away from the stop</span>
                        {doc.override_reason}
                      </span>
                    </div>
                  )}

                  {doc.review_status === 'rejected' && doc.rejection_reason && (
                    <div className="rounded-xl border border-[#f62626]/40 bg-[#f62626]/10 p-3 text-xs text-[#ffb3b3]">
                      <span className="block font-bold">Rejection reason</span>
                      {doc.rejection_reason}
                    </div>
                  )}

                  <div className="overflow-hidden rounded-[10px] border border-[#424242] bg-[#181717]">
                    {doc.reference_number && (
                      <Row label="Booking">
                        {bookingHref && doc.booking_id ? (
                          <Link href={bookingHref} className="text-[#4df9ed] [@media(hover:hover)]:hover:underline">{doc.reference_number}</Link>
                        ) : doc.reference_number}
                      </Row>
                    )}
                    {doc.company_name && <Row label="Client">{doc.company_name}</Row>}
                    {doc.plate_number && <Row label="Vehicle">{doc.plate_number}</Row>}
                    {doc.detail && <Row label="Details">{doc.detail}</Row>}
                    <Row label="Source">{DOCUMENT_SOURCE_LABELS[doc.source]}</Row>
                    <Row label="Uploaded">{doc.uploaded_at ? formatDateTime(doc.uploaded_at) : '—'}</Row>
                    {doc.uploaded_by_name && (
                      <Row label="Uploaded By">
                        {doc.uploaded_by_name}
                        {doc.uploaded_by_role && <span className="block text-[11px] text-[#818181]">{roleLabel(doc.uploaded_by_role)}</span>}
                      </Row>
                    )}
                    {fileSizeLabel(doc.bytes) && <Row label="Size">{fileSizeLabel(doc.bytes)}</Row>}
                    {doc.reviewed_by_name && (
                      <Row label="Reviewed By">
                        {doc.reviewed_by_name}
                        {doc.reviewed_at && <span className="block text-[11px] text-[#818181]">{formatDateTime(doc.reviewed_at)}</span>}
                      </Row>
                    )}
                    {doc.archived_at && <Row label="Archived">{formatDateTime(doc.archived_at)}</Row>}
                  </div>

                  {doc.notes && (
                    <div>
                      <p className="ff-sc mb-1 text-xs font-bold text-[#818181]">Notes</p>
                      <p className="ff-regular whitespace-pre-wrap text-sm text-[#c4c4c4]">{doc.notes}</p>
                    </div>
                  )}

                  {!doc.document_id && (
                    <p className="ff-regular text-xs leading-relaxed text-[#818181]">
                      This file was recorded by the {doc.source === 'client' ? 'booking' : doc.source === 'driver' ? 'driver app' : 'fleet'} flow
                      and is kept as evidence, so it can be viewed and downloaded here but not changed.
                    </p>
                  )}
                </div>

                {actions && (
                  // Equal-width buttons in one row (one full-width button when it is alone).
                  <div className="grid shrink-0 grid-flow-col auto-cols-fr gap-2 border-t border-[#424242] p-4 sm:p-5 lg:border-t-0 lg:pt-0">
                    {actions}
                  </div>
                )}
              </aside>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
