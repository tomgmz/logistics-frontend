'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, Download, ExternalLink, FileText, Loader2 } from 'lucide-react'

import {
  bookingService,
  type ClientBookingDocument,
  type ClientDocumentType,
} from '@/lib/services/client/booking.service'
import { useLiveTable } from '@/lib/hooks/useLiveTable'
import { getApiErrorMessage } from '@/lib/api-error'
import { downloadUrl } from '@/app/types/documents.types'
import { DocumentThumb, DocumentTypeBadge } from '@/components/documents/DocumentVisuals'
import { SectionHeader } from './TransactionDetail'
import { formatDateTime } from './transaction-format'
import { BG_PANEL, BG_CARD, BORDER, BORDER_C, CYAN, MUTED, ERROR } from './transaction-theme'

/**
 * Every file on one booking that its client may see, for the client's own
 * transaction history: the pickup and drop-off proof photos, and the documents
 * (their own attachments and the shipment paperwork staff attached and approved).
 *
 * The server decides what is client-visible (GET /booking/:id/documents); this
 * only lays it out. It re-reads when a proof or a document lands, so a client
 * watching the page sees the drop-off photo arrive.
 */

const PROOF_TYPES: ReadonlySet<ClientDocumentType> = new Set([
  'pickup_proof', 'delivery_proof', 'proof_of_delivery', 'delivery_receipt',
])

function FileRow({ doc }: { doc: ClientBookingDocument }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 border"
      style={{ background: BG_CARD, borderColor: BORDER_C }}>
      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="shrink-0 hover:opacity-80">
        <DocumentThumb doc={doc} size={48} />
      </a>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <DocumentTypeBadge type={doc.doc_type} />
          {doc.uploaded_at && (
            <span className="text-[10px] truncate" style={{ color: MUTED }}>{formatDateTime(doc.uploaded_at)}</span>
          )}
        </div>
        <span className="text-xs text-white/80 truncate">{doc.detail ?? doc.file_name}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
          className="p-2 rounded-lg hover:bg-white/5" style={{ color: MUTED }}
          title="Open in a new tab" aria-label={`Open ${doc.file_name} in a new tab`}>
          <ExternalLink size={14} />
        </a>
        <a href={downloadUrl(doc.file_url)} target="_blank" rel="noopener noreferrer"
          className="p-2 rounded-lg hover:bg-white/5" style={{ color: CYAN }}
          title="Download" aria-label={`Download ${doc.file_name}`}>
          <Download size={14} />
        </a>
      </div>
    </div>
  )
}

function Group({ icon, title, docs, empty }: {
  icon: React.ReactNode; title: string; docs: ClientBookingDocument[]; empty: string
}) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ background: BG_PANEL, borderColor: BORDER }}>
      <SectionHeader icon={icon} title={title} />
      {docs.length > 0
        ? <div className="flex flex-col gap-2">{docs.map((d) => <FileRow key={d.doc_key} doc={d} />)}</div>
        : <p className="text-xs" style={{ color: MUTED }}>{empty}</p>}
    </div>
  )
}

export default function BookingDocuments({ bookingId }: { bookingId: string }) {
  const [docs, setDocs]       = useState<ClientBookingDocument[] | null>(null)
  const [error, setError]     = useState<string | null>(null)

  // Bumped by a live signal to re-read. The caller keys this component on the
  // booking, so a different booking is a fresh mount.
  const [reload, setReload]   = useState(0)

  useEffect(() => {
    let cancelled = false
    bookingService.fetchBookingDocuments(bookingId)
      .then((rows) => { if (!cancelled) { setDocs(rows ?? []); setError(null) } })
      .catch((e) => { if (!cancelled) setError(getApiErrorMessage(e, 'Could not load the documents for this booking.')) })
    return () => { cancelled = true }
  }, [bookingId, reload])

  // Proof photos and staff uploads both signal on live:documents.
  const bump = useCallback(() => setReload((n) => n + 1), [])
  useLiveTable(['live:documents', 'live:bookings'], bump)

  if (error && !docs) {
    return (
      <div className="rounded-xl border px-4 py-3 text-sm"
        style={{ background: `${ERROR}10`, borderColor: `${ERROR}30`, color: ERROR }}>
        {error}
      </div>
    )
  }

  if (!docs) {
    return (
      <div className="flex items-center gap-2 text-xs px-1" style={{ color: MUTED }}>
        <Loader2 size={13} className="animate-spin" /> Loading documents…
      </div>
    )
  }

  const proofs = docs.filter((d) => PROOF_TYPES.has(d.doc_type))
  const papers = docs.filter((d) => !PROOF_TYPES.has(d.doc_type))

  return (
    <>
      <Group icon={<Camera size={15} />} title="Proof of Delivery" docs={proofs}
        empty="No proof yet. The driver's pickup and drop-off photos appear here as each stop is completed." />
      <Group icon={<FileText size={15} />} title="Documents" docs={papers}
        empty="No documents are attached to this booking." />
    </>
  )
}
