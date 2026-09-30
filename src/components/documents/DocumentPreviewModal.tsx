'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, ExternalLink, MapPinOff, FileQuestion } from 'lucide-react'

import { formatDateTime } from '@/app/utils/timeFormat'
import { roleLabel } from '@/lib/roles'
import {
  DOCUMENT_SOURCE_LABELS,
  DOCUMENT_TYPE_LABELS,
  downloadUrl,
  fileSizeLabel,
  previewKind,
  type LibraryDocument,
} from '@/app/types/documents.types'
import { DocumentTypeBadge, ReviewStatusBadge } from './DocumentVisuals'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-white/40 shrink-0">{label}</span>
      <span className="text-sm text-white/80 text-right min-w-0 break-words">{children}</span>
    </div>
  )
}

function Preview({ doc }: { doc: LibraryDocument }) {
  const kind = previewKind(doc.file_url)
  if (kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={doc.file_url} alt={doc.file_name} className="max-h-full max-w-full object-contain" />
    )
  }
  if (kind === 'pdf') {
    return <iframe src={doc.file_url} title={doc.file_name} className="w-full h-full bg-white" />
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center px-6">
      <FileQuestion size={40} className="text-white/25" />
      <p className="text-sm text-white/50">This file type can&apos;t be previewed in the browser.</p>
      <a
        href={downloadUrl(doc.file_url)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-black"
        style={{ background: 'var(--color-cyan)' }}
      >
        <Download size={14} /> Download to open
      </a>
    </div>
  )
}

/**
 * One document: a large preview beside everything known about it. The caller
 * passes whatever actions the viewer's tier allows (review, archive).
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
  return (
    <AnimatePresence>
      {doc && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-center justify-center p-2 sm:p-4 bg-black/70"
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
            className="w-full max-w-5xl h-[92vh] flex flex-col rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.07] shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white truncate">{doc.file_name}</h2>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {DOCUMENT_TYPE_LABELS[doc.doc_type]}
                  {doc.reference_number && ` · ${doc.reference_number}`}
                  {doc.plate_number && ` · ${doc.plate_number}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-white/5 text-white/60"
                  title="Open in a new tab"
                  aria-label="Open in a new tab"
                >
                  <ExternalLink size={17} />
                </a>
                <a
                  href={downloadUrl(doc.file_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-white/5 text-white/60"
                  title="Download"
                  aria-label="Download"
                >
                  <Download size={17} />
                </a>
                <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              <div className="flex-1 min-h-[240px] bg-black/60 flex items-center justify-center overflow-hidden">
                <Preview doc={doc} />
              </div>

              <aside className="lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.07] flex flex-col min-h-0 max-h-[45%] lg:max-h-none">
                <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DocumentTypeBadge type={doc.doc_type} />
                    <ReviewStatusBadge doc={doc} />
                  </div>

                  {doc.override_reason && (
                    <div className="flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
                      <MapPinOff size={14} className="shrink-0 mt-0.5" />
                      <span>
                        <span className="font-bold block">Taken away from the stop</span>
                        {doc.override_reason}
                      </span>
                    </div>
                  )}

                  {doc.review_status === 'rejected' && doc.rejection_reason && (
                    <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-200">
                      <span className="font-bold block">Rejection reason</span>
                      {doc.rejection_reason}
                    </div>
                  )}

                  <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3">
                    {doc.reference_number && (
                      <Row label="Booking">
                        {bookingHref && doc.booking_id ? (
                          <Link href={bookingHref} className="text-[var(--color-cyan)] hover:underline">{doc.reference_number}</Link>
                        ) : doc.reference_number}
                      </Row>
                    )}
                    {doc.company_name && <Row label="Client">{doc.company_name}</Row>}
                    {doc.plate_number && <Row label="Vehicle"><span className="font-mono">{doc.plate_number}</span></Row>}
                    {doc.detail && <Row label="Details">{doc.detail}</Row>}
                    <Row label="Source">{DOCUMENT_SOURCE_LABELS[doc.source]}</Row>
                    <Row label="Uploaded">{doc.uploaded_at ? formatDateTime(doc.uploaded_at) : '—'}</Row>
                    {doc.uploaded_by_name && (
                      <Row label="Uploaded By">
                        {doc.uploaded_by_name}
                        {doc.uploaded_by_role && <span className="block text-[11px] text-white/40">{roleLabel(doc.uploaded_by_role)}</span>}
                      </Row>
                    )}
                    {fileSizeLabel(doc.bytes) && <Row label="Size">{fileSizeLabel(doc.bytes)}</Row>}
                    {doc.reviewed_by_name && (
                      <Row label="Reviewed">
                        {doc.reviewed_by_name}
                        {doc.reviewed_at && <span className="block text-[11px] text-white/40">{formatDateTime(doc.reviewed_at)}</span>}
                      </Row>
                    )}
                    {doc.archived_at && <Row label="Archived">{formatDateTime(doc.archived_at)}</Row>}
                  </div>

                  {doc.notes && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-1">Notes</p>
                      <p className="text-sm text-white/75 whitespace-pre-wrap">{doc.notes}</p>
                    </div>
                  )}

                  {!doc.document_id && (
                    <p className="text-[11px] text-white/35 leading-relaxed">
                      This file was recorded by the {doc.source === 'client' ? 'booking' : doc.source === 'driver' ? 'driver app' : 'fleet'} flow
                      and is kept as evidence, so it can be viewed and downloaded here but not changed.
                    </p>
                  )}
                </div>

                {actions && (
                  <div className="shrink-0 border-t border-white/[0.07] p-3 flex flex-wrap justify-end gap-2">
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
