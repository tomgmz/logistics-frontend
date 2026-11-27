'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, FileText, ChevronLeft, ArrowUpFromLine } from 'lucide-react'
import ReusableModal from '@/components/layout/ReusableModal'
import { useFormGuard } from '@/lib/hooks/useFormGuard'

import AccountTypePicker from '@/components/admin/AccountTypePicker'

import { fetchBookingDropoffs, fetchOtherLabels, searchBookingsForUpload, searchVehiclesForUpload, uploadDocuments } from '@/lib/services/admin/documents.service'
import {
  BOOKING_DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  OTHER_LABEL_MAX,
  VEHICLE_DOCUMENT_TYPES,
  fileSizeLabel,
  type BookingOption,
  type DropoffProof,
  type StaffDocumentType,
  type UploadTarget,
  type VehicleOption,
} from '@/app/types/documents.types'
import { appToast } from '@/lib/toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { cachedFetch } from '@/lib/query/useApiQuery'
import { formatDate } from '@/app/utils/timeFormat'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import Dropdown from '@/components/ui/Dropdown'
import SearchClearButton from '@/components/ui/SearchClearButton'
import { FieldError, errorBorder } from '@/components/ui/FieldError'
import { mainStatusLabel } from '@/components/transactions/BookingStatusTag'

// Mirrors the backend's uploadDocuments middleware.
const MAX_FILES = 3
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.docx,.doc,.xlsx,.jpg,.jpeg,.png,.webp,.heic,.heif'
const ACCEPT_EXT = new Set(ACCEPT.split(',').map((e) => e.slice(1)))

const TYPES_FOR: Record<UploadTarget, readonly StaffDocumentType[]> = {
  booking: BOOKING_DOCUMENT_TYPES,
  vehicle: VEHICLE_DOCUMENT_TYPES,
}

/** Step 1's choices (Figma "modal upload document", 2026-11-25; Client removed with Contract 2026-11-27). */
const TARGETS: { id: UploadTarget; title: string; sub: string }[] = [
  { id: 'booking', title: 'Booking', sub: 'Documents for a specific delivery' },
  // Vendor vehicles are typed in per booking, not kept as trucks, so only our
  // own trucks can be picked here.
  { id: 'vehicle', title: 'Vehicle', sub: 'Papers for one of our trucks' },
]

const NOTES_HINT: Record<UploadTarget, string> = {
  booking: 'e.g. Signed document returned by the driver for drop-off 1; stamped by the receiving bay.',
  vehicle: 'e.g. Renewed registration; the previous copy has expired.',
}

// The form's look (Figma): small-caps labels, dark rounded fields.
const LABEL = 'font-[family-name:var(--font-alegreya-sc)] mb-1.5 block text-xs font-bold uppercase text-white'
const FIELD = 'w-full rounded-lg border border-[#3a3a3a] bg-[#151515] px-3 text-sm text-white outline-none placeholder:text-[#818181] focus:border-[#4df9ed]/60'
const PICKER_ROW = 'flex w-full items-center justify-between gap-3 border-b border-[#3a3a3a] px-3 py-2 text-left last:border-0 [@media(hover:hover)]:hover:bg-white/[0.04]'

function Required() {
  return <span aria-hidden className="ml-0.5 align-super text-xs text-[#f62626]">*</span>
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="ml-1 text-[11px] font-bold text-[#818181]">{children}</span>
}

/**
 * Staff upload, in two steps (Figma 2026-11-25): first what the document is
 * for (Booking or Vehicle), then the form for it. Proof of Delivery and Other
 * go on a booking; Vehicle Registration, Insurance and Other on a vehicle.
 * Other takes a typed-in type, suggested from earlier ones on the same kind of
 * target. Nothing waits for review (user 2026-11-27): a Proof of Delivery
 * reaches the client at once, so Upload asks the uploader to check it first.
 *
 * `initialTarget` skips the first step (the page knows the folder it is in);
 * `vehicleOnly` (the Fleet Manager) always goes straight to Vehicle.
 */
export default function UploadDocumentModal({
  open,
  initialTarget = null,
  initialBooking,
  initialTruck,
  initialDocType,
  initialDestinationId,
  vehicleOnly = false,
  onClose,
  onUploaded,
}: {
  open:            boolean
  initialTarget?:  UploadTarget | null
  /** Pre-selects the booking when the library is already focused on one. */
  initialBooking?: BookingOption | null
  /** Pre-selects the vehicle inside a vehicle's folder. */
  initialTruck?:   VehicleOption | null
  /** Pre-picks the type (a drop-off's "Upload Proof of Delivery" button). */
  initialDocType?: StaffDocumentType | null
  /** Pre-picks the drop-off a Proof of Delivery proves. */
  initialDestinationId?: string | null
  vehicleOnly?:    boolean
  onClose:         () => void
  onUploaded:      () => void
}) {
  // null = step 1, "What is this document for?"
  const [target,   setTarget]   = useState<UploadTarget | null>(null)
  const [askedTarget, setAskedTarget] = useState(false)
  const [truck,         setTruck]         = useState<VehicleOption | null>(null)
  const [truckQuery,    setTruckQuery]    = useState('')
  const [truckOptions,  setTruckOptions]  = useState<VehicleOption[]>([])
  const [booking,  setBooking]  = useState<BookingOption | null>(null)
  const [query,    setQuery]    = useState('')
  const [options,  setOptions]  = useState<BookingOption[]>([])
  const [searching, setSearching] = useState(false)
  const [otherLabel,    setOtherLabel]    = useState('')
  const [labelHints,    setLabelHints]    = useState<string[]>([])
  const [docType,  setDocType]  = useState<StaffDocumentType | ''>('')
  // Proof of Delivery: which drop-off it proves ('' = not one drop-off).
  const [dropoffs,    setDropoffs]    = useState<DropoffProof[]>([])
  const [dropoffId,   setDropoffId]   = useState('')
  const [notes,    setNotes]    = useState('')
  const [files,    setFiles]    = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  // Asks first (user 2026-11-25): closing with something chosen or typed, and taking a file off.
  const [confirmClose,  setConfirmClose]  = useState(false)
  // Proof of Delivery: its own confirmation, naming the booking and drop-off.
  const [confirmPod,    setConfirmPod]    = useState(false)
  const [pendingRemove, setPendingRemove] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasInput = files.length > 0 || notes.trim().length > 0 || otherLabel.trim().length > 0
  const requestClose = () => {
    if (busy) return
    if (hasInput) setConfirmClose(true)
    else onClose()
  }

  useBodyScrollLock(open)
  // Upload asks once more before it saves (user 2026-11-27); closing already asks.
  const submitGuard = useFormGuard(hasInput)

  /** A type is picked for you only when the target has just one. */
  const defaultType = (t: UploadTarget): StaffDocumentType | '' => (TYPES_FOR[t].length === 1 ? TYPES_FOR[t][0] : '')

  // Fresh form every time it opens.
  useEffect(() => {
    if (!open) return
    const t: UploadTarget | null = vehicleOnly ? 'vehicle' : initialTarget
    setTarget(t)
    setAskedTarget(t === null)
    setBooking(initialBooking ?? null)
    setQuery('')
    setTruck(initialTruck ?? null)
    setTruckQuery('')
    setOtherLabel('')
    setDocType(initialDocType && t && TYPES_FOR[t].includes(initialDocType) ? initialDocType : t ? defaultType(t) : '')
    setDropoffs([])
    setDropoffId(initialDestinationId ?? '')
    setNotes('')
    setFiles([])
    setShowErrors(false)
  }, [open, initialTarget, initialBooking, initialTruck, initialDocType, initialDestinationId, vehicleOnly])

  function chooseTarget(t: UploadTarget) {
    setTarget(t)
    setDocType(defaultType(t))
    setShowErrors(false)
  }

  const isVehicle = target === 'vehicle'
  const isBooking = target === 'booking'

  // Debounced vehicle search; an empty query lists vehicles by plate.
  useEffect(() => {
    if (!open || !isVehicle || truck) return
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      searchVehiclesForUpload(truckQuery)
        .then((rows) => { if (!cancelled) setTruckOptions(rows) })
        .catch(() => { if (!cancelled) setTruckOptions([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [open, isVehicle, truck, truckQuery])

  // Debounced booking search; an empty query lists the most recent bookings.
  useEffect(() => {
    if (!open || !isBooking || booking) return
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      searchBookingsForUpload(query)
        .then((rows) => { if (!cancelled) setOptions(rows) })
        .catch(() => { if (!cancelled) setOptions([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [open, isBooking, booking, query])

  // Proof of Delivery on a booking: its drop-offs, so the file can name the one
  // it proves (that clears the drop-off's "Proof missing"). With
  // nothing chosen yet, the only drop-off still missing proof is picked.
  const bookingId = isBooking ? booking?.booking_id ?? null : null
  const wantDropoffs = open && docType === 'proof_of_delivery' && !!bookingId
  useEffect(() => {
    if (!wantDropoffs || !bookingId) { setDropoffs([]); return }
    let cancelled = false
    fetchBookingDropoffs(bookingId)
      .then((rows) => {
        if (cancelled) return
        setDropoffs(rows)
        setDropoffId((cur) => {
          if (cur && rows.some((r) => r.destination_id === cur)) return cur
          if (rows.length === 1) return rows[0].destination_id
          const missing = rows.filter((r) => r.proof_state === 'missing')
          return missing.length === 1 ? missing[0].destination_id : ''
        })
      })
      .catch(() => { if (!cancelled) setDropoffs([]) })
    return () => { cancelled = true }
  }, [wantDropoffs, bookingId])

  // Types typed for Other before on the same kind of target, read when Other is chosen.
  useEffect(() => {
    if (!open || docType !== 'other') return
    let cancelled = false
    setLabelHints([])
    const kind = isVehicle ? 'vehicle' : 'booking'
    cachedFetch(['document-labels', kind], () => fetchOtherLabels(kind), setLabelHints)
      .then((l) => { if (!cancelled) setLabelHints(l) }).catch(() => {})
    return () => { cancelled = true }
  }, [open, docType, isVehicle])
  const typed = otherLabel.trim().toLowerCase()
  const hints = labelHints
    .filter((l) => l.toLowerCase() !== typed && (!typed || l.toLowerCase().includes(typed)))
    .slice(0, 6)

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

  const podDropoff = dropoffs.find((d) => d.destination_id === dropoffId) ?? null

  // Each check shows under its own field once Upload is pressed.
  const errors = {
    target:  isBooking && !booking ? 'Choose the booking.'
      : isVehicle && !truck ? 'Choose the vehicle.'
      : null,
    docType: !docType ? 'Choose the document type.' : null,
    other:   docType === 'other' && !otherLabel.trim() ? 'Say what kind of document it is.' : null,
    files:   files.length === 0 ? 'Add at least one file.' : null,
  }
  const shown = showErrors ? errors : { target: null, docType: null, other: null, files: null }
  const valid = !errors.target && !errors.docType && !errors.other && !errors.files

  async function submit() {
    if (busy || !target) return
    if (!valid || !docType) { setShowErrors(true); return }
    setBusy(true)
    try {
      const { document_ids } = await uploadDocuments({
        bookingId:    isBooking ? booking?.booking_id : null,
        truckId:      isVehicle ? truck?.truck_id : null,
        destinationId: isBooking && docType === 'proof_of_delivery' && dropoffId ? dropoffId : null,
        documentType: docType,
        otherLabel:   docType === 'other' ? otherLabel : null,
        notes,
        files,
      })
      const n = `${document_ids.length} document${document_ids.length === 1 ? '' : 's'}`
      appToast.success(
        isVehicle
          ? `${n} added to ${truck?.plate_number ?? 'the vehicle'}.`
          : `${n} attached to ${booking?.reference_number ?? 'the booking'}.`,
        { action: 'document-upload', entityId: isVehicle ? truck?.truck_id : booking?.booking_id },
      )
      onUploaded()
      onClose()
    } catch (e) {
      appToast.error(getApiErrorMessage(e, 'Upload failed. Please try again.'), { action: 'document-upload' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    {/* Step 1: the very panel Create User opens with (AccountTypePicker;
        user 2026-11-25: "use this panel … so it's the same size"). */}
    <AccountTypePicker
      open={open && !target}
      eyebrow="New Document"
      title="What is this document for?"
      options={TARGETS.map((t) => ({ key: t.id, label: t.title, hint: t.sub }))}
      onPick={chooseTarget}
      onClose={requestClose}
    />
    <AnimatePresence>
      {open && target && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={requestClose}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            role="dialog"
            aria-modal="true"
            aria-label="Upload document"
            className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#424242] bg-[#1b1b1b] shadow-2xl sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#424242] px-6 py-4">
              <div className="flex min-w-0 items-start gap-2">
                {askedTarget && !vehicleOnly && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setTarget(null)}
                    aria-label="Back to what the document is for"
                    className="-ml-2 mt-0.5 rounded-lg p-1 text-[#818181] [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-white"
                  >
                    <ChevronLeft size={22} />
                  </button>
                )}
                <div className="min-w-0">
                  <h2 className="font-[family-name:var(--font-alegreya-sc)] text-lg font-bold leading-tight text-white">Upload Document</h2>
                  <p className="font-[family-name:var(--font-alegreya-sc)] mt-0.5 text-xs font-bold uppercase text-[#4df9ed]">{TARGETS.find((x) => x.id === target)?.title}</p>
                </div>
              </div>
              <button type="button" disabled={busy} onClick={requestClose} className="rounded-lg p-2 text-[#818181] [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

              <>
                {/* Step 2: the form. */}
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  {/* Booking: a search box over a short list. */}
                  {isBooking && (
                    <div>
                      <span className={LABEL}>Booking<Required /></span>
                      {booking ? (
                        <SelectedRow
                          title={booking.reference_number ?? booking.booking_id.slice(0, 8)}
                          sub={[booking.company_name ?? 'Unknown client', booking.schedule_date && formatDate(booking.schedule_date)].filter(Boolean).join(' · ')}
                          right={mainStatusLabel(booking.status)}
                          busy={busy}
                          onChange={() => { setBooking(null); setDropoffId('') }}
                        />
                      ) : (
                        <PickerList
                          query={query}
                          onQuery={setQuery}
                          placeholder="Search by booking reference or client…"
                          error={shown.target}
                          loading={searching && options.length === 0}
                          empty="No bookings match."
                        >
                          {options.map((o) => (
                            <button key={o.booking_id} type="button" onClick={() => setBooking(o)} className={PICKER_ROW}>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-bold text-white">{o.reference_number ?? o.booking_id.slice(0, 8)}</span>
                                <span className="block truncate text-xs font-bold text-[#818181]">
                                  {o.company_name ?? 'Unknown client'}{o.schedule_date && ` · ${formatDate(o.schedule_date)}`}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs font-bold uppercase text-white">{mainStatusLabel(o.status)}</span>
                            </button>
                          ))}
                        </PickerList>
                      )}
                      <FieldError>{booking ? null : shown.target}</FieldError>
                    </div>
                  )}

                  {/* Vehicle: a search box over the plates. */}
                  {isVehicle && (
                    <div>
                      <span className={LABEL}>Vehicle<Required /></span>
                      {truck ? (
                        <SelectedRow
                          title={truck.plate_number ?? 'No plate on record'}
                          sub={truck.description}
                          busy={busy}
                          onChange={() => setTruck(null)}
                        />
                      ) : (
                        <PickerList
                          query={truckQuery}
                          onQuery={setTruckQuery}
                          placeholder="Search by plate…"
                          error={shown.target}
                          loading={searching && truckOptions.length === 0}
                          empty="No vehicles match."
                        >
                          {truckOptions.map((o) => (
                            <button key={o.truck_id} type="button" onClick={() => setTruck(o)} className={PICKER_ROW}>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-bold text-white">{o.plate_number ?? 'No plate on record'}</span>
                                {o.description && <span className="block truncate text-xs font-bold text-[#818181]">{o.description}</span>}
                              </span>
                            </button>
                          ))}
                        </PickerList>
                      )}
                      <FieldError>{truck ? null : shown.target}</FieldError>
                    </div>
                  )}

                  {/* Document type */}
                  <div>
                    <label htmlFor="doc-type" className={LABEL}>Document Type<Required /></label>
                    <Dropdown
                      id="doc-type"
                      value={docType}
                      disabled={busy}
                      onChange={(e) => setDocType(e.target.value as StaffDocumentType)}
                      className={`${FIELD} h-10 ${errorBorder(shown.docType)}`}
                    >
                      <option value="" disabled>Select document type</option>
                      {TYPES_FOR[target].map((t) => (
                        <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
                      ))}
                    </Dropdown>
                    <FieldError>{shown.docType}</FieldError>
                    {docType === 'proof_of_delivery' && (
                      <p className="ff-regular mt-1.5 text-xs text-[#818181]">
                        The client sees it in their booking as soon as it is uploaded.
                      </p>
                    )}
                  </div>

                  {/* Proof of Delivery: the drop-off it proves */}
                  {isBooking && docType === 'proof_of_delivery' && booking && dropoffs.length > 1 && (
                    <div>
                      <label htmlFor="doc-dropoff" className={LABEL}>Drop-off<Muted>(the one this proves)</Muted></label>
                      <Dropdown
                        id="doc-dropoff"
                        value={dropoffId}
                        disabled={busy}
                        onChange={(e) => setDropoffId(e.target.value)}
                        className={`${FIELD} h-10`}
                      >
                        <option value="">Not for one drop-off</option>
                        {dropoffs.map((d) => (
                          <option key={d.destination_id} value={d.destination_id}>
                            {`Drop-off ${d.sequence_order}${d.proof_state === 'missing' ? ' (proof missing)' : ''} · ${d.address}`}
                          </option>
                        ))}
                      </Dropdown>
                      <p className="ff-regular mt-1.5 text-xs text-[#818181]">
                        It clears that drop-off&apos;s Proof missing mark.
                      </p>
                    </div>
                  )}

                  {/* Other: what kind of document */}
                  {docType === 'other' && (
                    <div>
                      <label htmlFor="doc-other" className={LABEL}>
                        What kind of document?<Required /><Muted>(staff only)</Muted>
                      </label>
                      <input
                        id="doc-other"
                        value={otherLabel}
                        disabled={busy}
                        maxLength={OTHER_LABEL_MAX}
                        onChange={(e) => setOtherLabel(e.target.value)}
                        placeholder="e.g. Invoice"
                        className={`${FIELD} h-10 ${errorBorder(shown.other)}`}
                      />
                      <FieldError>{shown.other}</FieldError>
                      {hints.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {hints.map((h) => (
                            <button
                              key={h}
                              type="button"
                              disabled={busy}
                              onClick={() => setOtherLabel(h)}
                              className="rounded-full border border-[#424242] px-2.5 py-1 text-xs text-[#c4c4c4] [@media(hover:hover)]:hover:border-[#4df9ed]/50 [@media(hover:hover)]:hover:text-white"
                            >
                              {h}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Files */}
                  <div>
                    <span className={LABEL}>Files<Required /><Muted>(up to {MAX_FILES}, 10 MB each)</Muted></span>
                    {files.length < MAX_FILES && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => inputRef.current?.click()}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
                        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 transition-colors ${files.length ? 'py-4' : 'py-6'} ${
                          dragging ? 'border-[#4df9ed]/70 bg-[#4df9ed]/[0.06]' : shown.files ? 'border-[#f62626]/60 bg-[#151515]' : 'border-[#818181] bg-[#151515]'
                        }`}
                      >
                        <ArrowUpFromLine size={22} strokeWidth={1.5} className="mb-0.5 text-[#818181]" />
                        <p className="font-[family-name:var(--font-alegreya-sc)] text-sm font-bold text-white">
                          Drop files here or <span className="uppercase text-[#4df9ed]">browse</span>
                        </p>
                        <p className="font-[family-name:var(--font-alegreya-sc)] text-xs text-[#818181]">PDF, DOCX, XLSX, JPG, PNG, WEBP or HEIC</p>
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
                    <FieldError>{shown.files}</FieldError>
                    {files.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {files.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-[#3a3a3a] bg-[#151515] px-3 py-2">
                            <FileText size={15} className="shrink-0 text-[#818181]" />
                            <span className="ff-regular flex-1 truncate text-sm text-white">{f.name}</span>
                            <span className="ff-regular shrink-0 text-xs text-[#818181]">{fileSizeLabel(f.size)}</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setPendingRemove(f)}
                              className="rounded p-1 text-[#818181] [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-[#f62626]"
                              aria-label={`Remove ${f.name}`}
                            >
                              <X size={15} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label htmlFor="doc-notes" className={LABEL}>Notes<Muted>(optional)</Muted></label>
                    <textarea
                      id="doc-notes"
                      value={notes}
                      disabled={busy}
                      maxLength={500}
                      rows={3}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={NOTES_HINT[target]}
                      className={`${FIELD} resize-none py-3`}
                    />
                  </div>
                </div>

                {/* Buttons, outside the scrolling part. */}
                <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-[#424242] px-6 py-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={requestClose}
                    className="font-[family-name:var(--font-alegreya-sc)] h-10 rounded-lg border border-[#818181] text-base font-bold text-[#818181] transition-colors disabled:opacity-40 [@media(hover:hover)]:hover:bg-white/[0.04] [@media(hover:hover)]:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!valid || !docType) { setShowErrors(true); return }
                      // Proof of Delivery goes to the client at once, with no second
                      // check: always ask, naming the booking and the drop-off.
                      if (docType === 'proof_of_delivery') { setConfirmPod(true); return }
                      submitGuard.confirmSubmit(() => void submit(), {
                        title:        `Upload ${files.length} ${files.length === 1 ? 'file' : 'files'} as ${documentWords(docType, otherLabel)}?`,
                        description:  'It is saved at once.',
                        confirmLabel: 'Upload',
                      })
                    }}
                    className="font-[family-name:var(--font-alegreya-sc)] h-10 rounded-lg border border-[#4df9ed] bg-[#4df9ed]/[0.15] text-base font-bold text-[#4df9ed] transition-colors disabled:opacity-40 [@media(hover:hover)]:hover:bg-[#4df9ed]/25"
                  >
                    {busy ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <ReusableModal
      open={!!pendingRemove}
      title="Remove this file?"
      description={pendingRemove ? `${pendingRemove.name} will be taken off this upload. You can add it again with browse.` : undefined}
      confirmLabel="Remove"
      cancelLabel="Keep"
      onConfirm={() => {
        const f = pendingRemove
        setPendingRemove(null)
        if (f) setFiles((prev) => prev.filter((x) => x !== f))
      }}
      onCancel={() => setPendingRemove(null)}
    />

    {submitGuard.modal}
    <ReusableModal
      open={confirmPod}
      title={`Upload Proof of Delivery for ${booking?.reference_number ?? 'this booking'}?`}
      description={
        `The client sees ${files.length === 1 ? 'this file' : `these ${files.length} files`} in their booking right away; nobody checks it after you. ` +
        (podDropoff
          ? `Make sure it is the signed delivery receipt for drop-off ${podDropoff.sequence_order} (${podDropoff.address}) of this booking.`
          : 'Make sure it is the signed delivery receipt for this booking.')
      }
      confirmLabel="Yes, Upload"
      cancelLabel="Check Again"
      onConfirm={() => { setConfirmPod(false); void submit() }}
      onCancel={() => setConfirmPod(false)}
    />
    <ReusableModal
      open={confirmClose}
      title="Discard this upload?"
      description="The files and notes you added haven't been uploaded. If you close, they will be lost."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onConfirm={() => { setConfirmClose(false); onClose() }}
      onCancel={() => setConfirmClose(false)}
    />
    </>
  )
}

/** "Proof of Delivery", or Other with the type typed in. */
function documentWords(type: StaffDocumentType, otherLabel: string): string {
  return type === 'other' && otherLabel.trim() ? `Other (${otherLabel.trim()})` : DOCUMENT_TYPE_LABELS[type]
}

/** The picked booking or vehicle, with Change to pick another. */
function SelectedRow({ title, sub, right, busy, onChange }: {
  title: string; sub?: string | null; right?: string; busy: boolean; onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#4df9ed]/40 bg-[#4df9ed]/[0.06] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-white">{title}</p>
        {sub && <p className="truncate text-xs font-bold text-[#818181]">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {right && <span className="text-xs font-bold uppercase text-white">{right}</span>}
        <button type="button" disabled={busy} onClick={onChange} className="text-xs font-bold text-[#4df9ed] [@media(hover:hover)]:hover:underline">
          Change
        </button>
      </div>
    </div>
  )
}

/** A search box joined to a short scrolling list of choices (Figma's booking and vehicle pickers). */
function PickerList({ query, onQuery, placeholder, error, loading, empty, children }: {
  query: string; onQuery: (v: string) => void; placeholder: string; error: string | null
  loading: boolean; empty: string; children: ReactNode[]
}) {
  return (
    <div className={`overflow-hidden rounded-lg border bg-[#151515] ${error ? 'border-[#f62626]/60' : 'border-[#3a3a3a]'}`}>
      <div className="flex items-center gap-2 border-b border-[#3a3a3a] px-3">
        <Search size={15} className="shrink-0 text-[#818181]" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#818181]"
        />
        <SearchClearButton value={query} onClear={() => onQuery('')} className="static size-6 shrink-0 translate-y-0" />
      </div>
      <div className="max-h-[188px] overflow-y-auto">
        {loading ? (
          <p className="px-4 py-3 text-xs text-[#818181]">Searching…</p>
        ) : children.length === 0 ? (
          <p className="px-4 py-3 text-xs text-[#818181]">{empty}</p>
        ) : children}
      </div>
    </div>
  )
}
