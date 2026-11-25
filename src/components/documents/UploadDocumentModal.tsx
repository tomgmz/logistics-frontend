'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, FileText, Trash2, ChevronLeft, ArrowUpFromLine } from 'lucide-react'

import AccountTypePicker from '@/components/admin/AccountTypePicker'

import { fetchOtherLabels, searchBookingsForUpload, searchClientsForUpload, searchVehiclesForUpload, uploadDocuments } from '@/lib/services/admin/documents.service'
import {
  BOOKING_DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  OTHER_LABEL_MAX,
  VEHICLE_DOCUMENT_TYPES,
  fileSizeLabel,
  type BookingOption,
  type ClientOption,
  needsReview,
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
import Combobox from '@/components/ui/Combobox'
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
  client:  ['contract'],
  vehicle: VEHICLE_DOCUMENT_TYPES,
}

/** Step 1's three choices (Figma "modal upload document", 2026-11-25). */
const TARGETS: { id: UploadTarget; title: string; sub: string }[] = [
  { id: 'client',  title: 'Client',  sub: 'Paperwork for a client company' },
  { id: 'booking', title: 'Booking', sub: 'Documents for a specific delivery' },
  // Vendor vehicles are typed in per booking, not kept as trucks, so only our
  // own trucks can be picked here.
  { id: 'vehicle', title: 'Vehicle', sub: 'Papers for one of our trucks' },
]

const NOTES_HINT: Record<UploadTarget, string> = {
  client:  'e.g. Signed service agreement for 2026, renewed after the rate review.',
  booking: 'e.g. Signed document returned by the driver for drop-off 1; stamped by the receiving bay.',
  vehicle: 'e.g. Renewed registration; the previous copy has expired.',
}

// The form's look (Figma): small-caps labels, dark rounded fields.
const LABEL = 'ff-sc mb-2 block text-sm 3xl:text-base font-bold uppercase text-white'
const FIELD = 'w-full rounded-xl border border-[#3a3a3a] bg-[#151515] px-4 text-sm 3xl:text-base text-white outline-none placeholder:text-[#818181] focus:border-[#4df9ed]/60'
const PICKER_ROW = 'flex w-full items-center justify-between gap-3 border-b border-[#3a3a3a] px-4 py-2.5 text-left last:border-0 [@media(hover:hover)]:hover:bg-white/[0.04]'

function Required() {
  return <span aria-hidden className="ml-0.5 align-super text-xs text-[#f62626]">*</span>
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="ml-1 text-xs 3xl:text-sm font-bold text-[#818181]">{children}</span>
}

/**
 * Staff upload, in two steps (Figma 2026-11-25): first what the document is
 * for (Client, Booking or Vehicle), then the form for it. A Contract goes on a
 * client; Proof of Delivery and Other on a booking; Vehicle Registration,
 * Insurance and Other on a vehicle. Other takes a typed-in type, suggested
 * from earlier ones on the same kind of target.
 *
 * `initialTarget` skips the first step (the page knows the folder it is in);
 * `vehicleOnly` (the Fleet Manager) always goes straight to Vehicle.
 */
export default function UploadDocumentModal({
  open,
  initialTarget = null,
  initialBooking,
  initialClient,
  initialTruck,
  vehicleOnly = false,
  onClose,
  onUploaded,
}: {
  open:            boolean
  initialTarget?:  UploadTarget | null
  /** Pre-selects the booking when the library is already focused on one. */
  initialBooking?: BookingOption | null
  /** Pre-selects the client inside a client's folder. */
  initialClient?:  ClientOption | null
  /** Pre-selects the vehicle inside a vehicle's folder. */
  initialTruck?:   VehicleOption | null
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
  const [client,        setClient]        = useState<ClientOption | null>(null)
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [otherLabel,    setOtherLabel]    = useState('')
  const [labelHints,    setLabelHints]    = useState<string[]>([])
  const [docType,  setDocType]  = useState<StaffDocumentType | ''>('')
  const [notes,    setNotes]    = useState('')
  const [files,    setFiles]    = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useBodyScrollLock(open)

  /** A type is picked for you only when the target has just one (a client's Contract). */
  const defaultType = (t: UploadTarget): StaffDocumentType | '' => (TYPES_FOR[t].length === 1 ? TYPES_FOR[t][0] : '')

  // Fresh form every time it opens.
  useEffect(() => {
    if (!open) return
    const t: UploadTarget | null = vehicleOnly ? 'vehicle' : initialTarget
    setTarget(t)
    setAskedTarget(t === null)
    setBooking(initialBooking ?? null)
    setQuery('')
    setClient(initialClient ?? null)
    setTruck(initialTruck ?? null)
    setTruckQuery('')
    setOtherLabel('')
    setDocType(t ? defaultType(t) : '')
    setNotes('')
    setFiles([])
    setShowErrors(false)
  }, [open, initialTarget, initialBooking, initialClient, initialTruck, vehicleOnly])

  function chooseTarget(t: UploadTarget) {
    setTarget(t)
    setDocType(defaultType(t))
    setShowErrors(false)
  }

  const isClient  = target === 'client'
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

  // The Client dropdown: every client, read once per opening.
  useEffect(() => {
    if (!open || !isClient) return
    let cancelled = false
    setClientsLoading(true)
    searchClientsForUpload('')
      .then((rows) => { if (!cancelled) setClientOptions(rows) })
      .catch(() => { if (!cancelled) setClientOptions([]) })
      .finally(() => { if (!cancelled) setClientsLoading(false) })
    return () => { cancelled = true }
  }, [open, isClient])

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

  // Each check shows under its own field once Upload is pressed.
  const errors = {
    target:  isClient && !client ? 'Choose the client.'
      : isBooking && !booking ? 'Choose the booking.'
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
      const { document_ids, needs_review } = await uploadDocuments({
        bookingId:    isBooking ? booking?.booking_id : null,
        clientId:     isClient ? client?.client_id : null,
        truckId:      isVehicle ? truck?.truck_id : null,
        documentType: docType,
        otherLabel:   docType === 'other' ? otherLabel : null,
        notes,
        files,
      })
      const n = `${document_ids.length} document${document_ids.length === 1 ? '' : 's'}`
      // An older backend does not send needs_review; fall back to the type.
      const after = (needs_review ?? needsReview(docType)) ? ' Awaiting review.' : ''
      appToast.success(
        isClient
          ? `${n} added to the documents of ${client?.company_name ?? 'the client'}.${after}`
          : isVehicle
          ? `${n} added to ${truck?.plate_number ?? 'the vehicle'}.${after}`
          : `${n} attached to ${booking?.reference_number ?? 'the booking'}.${after}`,
        { action: 'document-upload', entityId: isClient ? client?.client_id : isVehicle ? truck?.truck_id : booking?.booking_id },
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
      onClose={onClose}
    />
    <AnimatePresence>
      {open && target && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
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
            className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#424242] bg-[#1b1b1b] shadow-2xl sm:max-w-[600px] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#424242] px-5 py-4 sm:px-7 sm:py-5">
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
                  <h2 className="ff-sc text-xl sm:text-2xl font-bold leading-tight text-white">Upload Document</h2>
                  <p className="ff-sc mt-0.5 text-sm sm:text-base font-bold uppercase text-[#4df9ed]">{TARGETS.find((x) => x.id === target)?.title}</p>
                </div>
              </div>
              <button type="button" disabled={busy} onClick={onClose} className="rounded-lg p-2 text-[#818181] [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-white" aria-label="Close">
                <X size={24} />
              </button>
            </div>

              <>
                {/* Step 2: the form. */}
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                  {/* Client: a dropdown of every client. */}
                  {isClient && (
                    <div>
                      <label htmlFor="doc-client" className={LABEL}>Client<Required /></label>
                      <Combobox
                        id="doc-client"
                        value={client?.client_id ?? ''}
                        disabled={busy || clientsLoading}
                        searchPlaceholder="Search client…"
                        emptyText="No clients match."
                        onChange={(e) => setClient(clientOptions.find((o) => o.client_id === e.target.value) ?? null)}
                        className={`${FIELD} h-12 ${errorBorder(shown.target)}`}
                      >
                        <option value="" disabled>{clientsLoading ? 'Loading clients…' : 'Select client'}</option>
                        {/* The pre-picked client stays listed even before the list arrives. */}
                        {client && !clientOptions.some((o) => o.client_id === client.client_id) && (
                          <option value={client.client_id}>{client.company_name ?? 'Unnamed client'}</option>
                        )}
                        {clientOptions.map((o) => (
                          <option key={o.client_id} value={o.client_id}>{o.company_name ?? 'Unnamed client'}</option>
                        ))}
                      </Combobox>
                      <FieldError>{shown.target}</FieldError>
                    </div>
                  )}

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
                          onChange={() => setBooking(null)}
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
                                <span className="block truncate text-sm 3xl:text-base font-bold text-white">{o.reference_number ?? o.booking_id.slice(0, 8)}</span>
                                <span className="block truncate text-xs 3xl:text-sm font-bold text-[#818181]">
                                  {o.company_name ?? 'Unknown client'}{o.schedule_date && ` · ${formatDate(o.schedule_date)}`}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs 3xl:text-sm font-bold uppercase text-white">{mainStatusLabel(o.status)}</span>
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
                                <span className="block truncate text-sm 3xl:text-base font-bold text-white">{o.plate_number ?? 'No plate on record'}</span>
                                {o.description && <span className="block truncate text-xs 3xl:text-sm font-bold text-[#818181]">{o.description}</span>}
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
                      disabled={busy || TYPES_FOR[target].length === 1}
                      onChange={(e) => setDocType(e.target.value as StaffDocumentType)}
                      className={`${FIELD} h-12 ${errorBorder(shown.docType)}`}
                    >
                      <option value="" disabled>Select document type</option>
                      {TYPES_FOR[target].map((t) => (
                        <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
                      ))}
                    </Dropdown>
                    <FieldError>{shown.docType}</FieldError>
                    {docType && (
                      <p className="ff-regular mt-1.5 text-xs text-[#818181]">
                        {needsReview(docType) ? 'Another reviewer has to approve it before it counts.' : 'This type needs no review.'}
                      </p>
                    )}
                  </div>

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
                        className={`${FIELD} h-12 ${errorBorder(shown.other)}`}
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
                        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 transition-colors ${files.length ? 'py-6' : 'py-10 sm:py-14'} ${
                          dragging ? 'border-[#4df9ed]/70 bg-[#4df9ed]/[0.06]' : shown.files ? 'border-[#f62626]/60 bg-[#151515]' : 'border-[#818181] bg-[#151515]'
                        }`}
                      >
                        <ArrowUpFromLine size={30} strokeWidth={1.5} className="mb-1 text-[#818181]" />
                        <p className="ff-sc text-base font-bold text-white">
                          Drop files here or <span className="uppercase text-[#4df9ed]">browse</span>
                        </p>
                        <p className="ff-sc text-sm text-[#818181]">PDF, DOCX, XLSX, JPG, PNG, WEBP or HEIC</p>
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
                              onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                              className="rounded p-1 text-[#818181] [@media(hover:hover)]:hover:bg-white/5 [@media(hover:hover)]:hover:text-[#f62626]"
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
                <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-[#424242] px-5 py-4 sm:gap-4 sm:px-7 sm:py-5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onClose}
                    className="ff-sc h-12 sm:h-[54px] rounded-xl border border-[#818181] text-lg sm:text-xl font-bold text-[#818181] transition-colors disabled:opacity-40 [@media(hover:hover)]:hover:bg-white/[0.04] [@media(hover:hover)]:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submit()}
                    className="ff-sc h-12 sm:h-[54px] rounded-xl border border-[#4df9ed] bg-[#4df9ed]/[0.15] text-lg sm:text-xl font-bold text-[#4df9ed] transition-colors disabled:opacity-40 [@media(hover:hover)]:hover:bg-[#4df9ed]/25"
                  >
                    {busy ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}

/** The picked booking or vehicle, with Change to pick another. */
function SelectedRow({ title, sub, right, busy, onChange }: {
  title: string; sub?: string | null; right?: string; busy: boolean; onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#4df9ed]/40 bg-[#4df9ed]/[0.06] px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm 3xl:text-base font-bold text-white">{title}</p>
        {sub && <p className="truncate text-xs 3xl:text-sm font-bold text-[#818181]">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {right && <span className="text-xs 3xl:text-sm font-bold uppercase text-white">{right}</span>}
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
    <div className={`overflow-hidden rounded-xl border bg-[#151515] ${error ? 'border-[#f62626]/60' : 'border-[#3a3a3a]'}`}>
      <div className="flex items-center gap-3 border-b border-[#3a3a3a] px-4">
        <Search size={18} className="shrink-0 text-[#818181]" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm 3xl:text-base text-white outline-none placeholder:text-[#818181]"
        />
        <SearchClearButton value={query} onClear={() => onQuery('')} className="static size-6 shrink-0 translate-y-0" />
      </div>
      <div className="max-h-[232px] overflow-y-auto">
        {loading ? (
          <p className="px-4 py-3 text-xs text-[#818181]">Searching…</p>
        ) : children.length === 0 ? (
          <p className="px-4 py-3 text-xs text-[#818181]">{empty}</p>
        ) : children}
      </div>
    </div>
  )
}
