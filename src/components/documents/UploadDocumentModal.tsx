'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, UploadCloud, Search, FileText, Trash2, Check } from 'lucide-react'

import { searchBookingsForUpload, uploadDocuments } from '@/lib/services/admin/documents.service'
import {
  DOCUMENT_TYPE_LABELS,
  STAFF_DOCUMENT_TYPES,
  fileSizeLabel,
  type BookingOption,
  type StaffDocumentType,
} from '@/app/types/documents.types'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'

// Mirrors the backend's uploadDocuments middleware.
const MAX_FILES = 3
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.docx,.doc,.xlsx,.jpg,.jpeg,.png,.webp,.heic,.heif'
const ACCEPT_EXT = new Set(ACCEPT.split(',').map((e) => e.slice(1)))

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function UploadDocumentModal({
  open,
  initialBooking,
  onClose,
  onUploaded,
}: {
  open:            boolean
  /** Pre-selects the booking when the library is already focused on one. */
  initialBooking?: BookingOption | null
  onClose:         () => void
  onUploaded:      () => void
}) {
  const [booking,  setBooking]  = useState<BookingOption | null>(null)
  const [query,    setQuery]    = useState('')
  const [options,  setOptions]  = useState<BookingOption[]>([])
  const [searching, setSearching] = useState(false)
  const [docType,  setDocType]  = useState<StaffDocumentType>('delivery_receipt')
  const [notes,    setNotes]    = useState('')
  const [files,    setFiles]    = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy,     setBusy]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fresh form every time it opens.
  useEffect(() => {
    if (!open) return
    setBooking(initialBooking ?? null)
    setQuery('')
    setDocType('delivery_receipt')
    setNotes('')
    setFiles([])
  }, [open, initialBooking])

  // Debounced booking search; an empty query lists the most recent bookings.
  useEffect(() => {
    if (!open || booking) return
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      searchBookingsForUpload(query)
        .then((rows) => { if (!cancelled) setOptions(rows) })
        .catch(() => { if (!cancelled) setOptions([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [open, booking, query])

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list)
    const accepted: File[] = []
    for (const f of incoming) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ACCEPT_EXT.has(ext)) {
        appToast.error(`${f.name}: only PDF, DOCX, XLSX, JPG, PNG, WEBP or HEIC files are allowed.`)
        continue
      }
      if (f.size > MAX_BYTES) {
        appToast.error(`${f.name} is larger than 10 MB.`)
        continue
      }
      accepted.push(f)
    }
    setFiles((prev) => {
      const next = [...prev, ...accepted].slice(0, MAX_FILES)
      if (prev.length + accepted.length > MAX_FILES) {
        appToast.error(`Up to ${MAX_FILES} files per upload.`)
      }
      return next
    })
  }

  async function submit() {
    if (!booking || files.length === 0) return
    setBusy(true)
    try {
      const { document_ids } = await uploadDocuments({
        bookingId:    booking.booking_id,
        documentType: docType,
        notes,
        files,
      })
      appToast.success(
        `${document_ids.length} document${document_ids.length === 1 ? '' : 's'} attached to ${booking.reference_number ?? 'the booking'}. Awaiting review.`,
        { action: 'document-upload', entityId: booking.booking_id },
      )
      onUploaded()
      onClose()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Upload failed. Please try again.'), { action: 'document-upload' })
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = !!booking && files.length > 0 && !busy

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { if (!busy) onClose() }}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-label="Upload document"
            className="w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
              <div>
                <h2 className="text-base font-bold text-white">Upload Document</h2>
                <p className="text-[11px] text-white/40 mt-0.5">Attach paperwork to a booking. It will wait for another reviewer to approve it.</p>
              </div>
              <button type="button" disabled={busy} onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-white/50" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto min-h-0">
              {/* Booking */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-white/45 mb-1.5">Booking</label>
                {booking ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-cyan)]/35 bg-[rgba(77,249,237,0.06)] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{booking.reference_number ?? booking.booking_id.slice(0, 8)}</p>
                      <p className="text-[11px] text-white/45 truncate">
                        {booking.company_name ?? 'Unknown client'} · {titleCase(booking.status)}
                        {booking.schedule_date && ` · ${booking.schedule_date}`}
                      </p>
                    </div>
                    <button type="button" disabled={busy} onClick={() => setBooking(null)} className="text-xs font-semibold text-[var(--color-cyan)] hover:underline shrink-0">
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-black/20">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
                      <Search size={14} className="text-white/35" />
                      <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by booking reference or client…"
                        className="bg-transparent outline-none text-sm flex-1 text-white/85 placeholder:text-white/30"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {searching && options.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-white/40">Searching…</p>
                      ) : options.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-white/40">No bookings match.</p>
                      ) : options.map((o) => (
                        <button
                          key={o.booking_id}
                          type="button"
                          onClick={() => setBooking(o)}
                          className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm text-white/85">{o.reference_number ?? o.booking_id.slice(0, 8)}</span>
                            <span className="block text-[11px] text-white/40 truncate">{o.company_name ?? 'Unknown client'}{o.schedule_date && ` · ${o.schedule_date}`}</span>
                          </span>
                          <span className="text-[10px] uppercase tracking-wide text-white/35 shrink-0">{titleCase(o.status)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Type */}
              <div>
                <label htmlFor="doc-type" className="block text-[11px] font-bold uppercase tracking-wide text-white/45 mb-1.5">Document Type</label>
                <select
                  id="doc-type"
                  value={docType}
                  disabled={busy}
                  onChange={(e) => setDocType(e.target.value as StaffDocumentType)}
                  className="w-full rounded-xl border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white/85 outline-none focus:border-[var(--color-cyan)]/50"
                >
                  {STAFF_DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Files */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-white/45 mb-1.5">
                  Files <span className="normal-case font-normal text-white/30">(up to {MAX_FILES}, 10 MB each)</span>
                </label>
                {files.length < MAX_FILES && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-colors"
                    style={{
                      borderColor: dragging ? 'rgba(77,249,237,0.6)' : 'rgba(255,255,255,0.12)',
                      background:  dragging ? 'rgba(77,249,237,0.06)' : 'transparent',
                    }}
                  >
                    <UploadCloud size={26} className="text-white/40" />
                    <p className="text-sm text-white/70">Drop files here or <span className="text-[var(--color-cyan)] font-semibold">browse</span></p>
                    <p className="text-[11px] text-white/35">PDF, DOCX, XLSX, JPG, PNG, WEBP or HEIC</p>
                    <input
                      ref={inputRef}
                      type="file"
                      multiple
                      accept={ACCEPT}
                      className="hidden"
                      onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
                    />
                  </div>
                )}
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
                        <FileText size={15} className="text-white/40 shrink-0" />
                        <span className="text-sm text-white/80 truncate flex-1">{f.name}</span>
                        <span className="text-[11px] text-white/35 shrink-0">{fileSizeLabel(f.size)}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-red-300"
                          aria-label={`Remove ${f.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="doc-notes" className="block text-[11px] font-bold uppercase tracking-wide text-white/45 mb-1.5">
                  Notes <span className="normal-case font-normal text-white/30">(optional)</span>
                </label>
                <textarea
                  id="doc-notes"
                  value={notes}
                  disabled={busy}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Signed receipt returned by the driver for stop 2; stamped by the receiving bay."
                  className="w-full rounded-xl border border-white/10 bg-[#111] px-3 py-2.5 text-sm text-white/85 outline-none resize-none focus:border-[var(--color-cyan)]/50 placeholder:text-white/25"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.07] shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm font-semibold text-white/80 hover:bg-white/5 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void submit()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-black disabled:opacity-40"
                style={{ background: 'var(--color-cyan)' }}
              >
                {busy ? 'Uploading…' : <><Check size={15} /> Upload</>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
