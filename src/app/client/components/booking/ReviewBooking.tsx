'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Truck } from 'lucide-react'
import Image from 'next/image'
import { useAppSelector, useAppDispatch } from '@/lib/hooks/hooks'
import type { ServiceType, DropoffSection, CargoMode } from '@/lib/store/slice/booking.slice'
import { resetBooking } from '@/lib/store/slice/booking.slice'
import { bookingService } from '@/lib/services/client/booking.service'
import { calcCargoSummary, palletizedGroup, looseGroup } from '@/lib/cargo/summary'
import type { CargoItemPayload } from '@/lib/services/client/booking.service'
import { uploadService } from '@/lib/services/admin/documentUpload.service'
import { appToast } from '@/lib/toast'
import './BookingDetails.css'
import SuccessView from './SuccessView'

interface Props {
  selectedService: ServiceType
  pendingFiles: File[]
  onBack: () => void
  onNewBooking: () => void
  onClearFiles: () => void
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38 } },
}

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08 } },
}

/**
 * The per-line cargo rows.
 *
 * Derived from the same `palletizedGroup` / `looseGroup` helpers that produce
 * the booking-level totals, so a line and the header cannot drift apart — which
 * they did, in both directions: the header ignored the pounds/kilograms toggle
 * that these rows honoured, and skipped palletized volume that these rows
 * recorded.
 */
function buildCargoItems(
  sections: DropoffSection[],
  mode: CargoMode,
  /** Wizard drop-off index -> the `sequence_order` that stop is submitted with. */
  sequenceByDropoff: Map<number, number>,
): CargoItemPayload[] {
  const items: CargoItemPayload[] = []

  for (const section of sections) {
    const dropoffSequence = sequenceByDropoff.get(section.dropoffIndex)
    for (const g of section.groups) {
      const catalogFields: Partial<CargoItemPayload> = {
        ...(g.commodityId   ? { commodity_id:   g.commodityId   } : g.commodity     ? { commodity_text: g.commodity     } : {}),
        ...(g.productId     ? { product_id:     g.productId     } : g.product       ? { product_text:   g.product       } : {}),
        ...(g.shcId         ? { shc_id:         g.shcId         } : g.shc           ? { shc_text:        g.shc           } : {}),
        ...(g.ashcId        ? { ashc_id:        g.ashcId        } : g.additionalShc ? { ashc_text:       g.additionalShc } : {}),
      }

      const r = mode === 'palletized' ? palletizedGroup(g) : looseGroup(g)
      if (!r) continue

      items.push({
        ...catalogFields,
        ...(dropoffSequence != null && { dropoff_sequence_order: dropoffSequence }),
        quantity: r.count,
        ...(r.grossWeightKg > 0 && { weight_kg:  parseFloat(r.grossWeightKg.toFixed(2)) }),
        ...(r.volumeCbm     > 0 && { volume_cbm: parseFloat(r.volumeCbm.toFixed(4)) }),
        ...(r.lengthCm !== null && { length_cm: r.lengthCm }),
        ...(r.widthCm  !== null && { width_cm:  r.widthCm  }),
        ...(r.heightCm !== null && { height_cm: r.heightCm }),
      })
    }
  }

  return items
}

export default function StepReview({ selectedService, pendingFiles, onBack, onNewBooking, onClearFiles }: Props) {
  const dispatch = useAppDispatch()

  const [loading,        setLoading]        = useState(false)
  const [submitted,      setSubmitted]      = useState(false)
  const [bookingId,      setBookingId]      = useState<string | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [docUploadState, setDocUploadState] = useState<'idle' | 'uploading' | 'done' | 'failed'>('idle')

  const pickupLat     = useAppSelector((s) => s.booking.pickupLat)
  const pickupLng     = useAppSelector((s) => s.booking.pickupLng)
  const dropoffCoords = useAppSelector((s) => s.booking.dropoffCoords)
  const date          = useAppSelector((s) => s.booking.date)
  const time          = useAppSelector((s) => s.booking.time)
  const pickup        = useAppSelector((s) => s.booking.pickup)
  const dropoffs      = useAppSelector((s) => s.booking.dropoffs)
  const mode          = useAppSelector((s) => s.booking.mode)
  const sections      = useAppSelector((s) => s.booking.sections)
  const vehicle       = useAppSelector((s) => s.booking.vehicle)
  const paymentTerms  = useAppSelector((s) => s.booking.paymentTerms)

  const allGroups = sections.flatMap((s) => s.groups)

  /**
   * Documents already in Cloudinary for THIS attempt.
   *
   * The upload runs before the booking is created, so a create that failed used
   * to send the same files up again on every press of the button, piling up
   * duplicates in Cloudinary that nothing ever cleaned away. Holding the URLs
   * means the retry reuses what already landed.
   */
  const [uploadedUrls, setUploadedUrls] = useState<string[] | null>(null)

  /**
   * One key per booking attempt, reused by every retry of it.
   *
   * If the request times out on our side after the server has already committed
   * the booking, pressing the button again would otherwise book the same trip
   * twice. The server matches on this key and returns the original instead.
   * Cleared once a booking is successfully created, so a genuinely new booking
   * from the same screen mints a fresh one.
   */
  const attemptKey = useRef<string | null>(null)

  const confirm = async () => {
    if (!vehicle) return
    if (pendingFiles.length === 0) {
      setError('At least one transaction document is required.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      // Upload once per attempt, then reuse.
      let transactionUrls = uploadedUrls
      if (!transactionUrls) {
        setDocUploadState('uploading')
        try {
          const uploadResult = await uploadService.uploadBookingDocuments(pendingFiles)
          transactionUrls = uploadResult.urls
          setUploadedUrls(transactionUrls)
          setDocUploadState('done')
        } catch (uploadErr) {
          console.error('Document upload failed:', uploadErr)
          setDocUploadState('failed')
          // The API requires at least one document, so there is no "book it
          // anyway" path — submitting without them is a guaranteed rejection.
          // Say so plainly instead of letting it fail as a validation error.
          setError(
            'Your transaction documents could not be uploaded, and a booking cannot be ' +
            'submitted without them. Check your connection and try again.',
          )
          return
        }
      }

      if (transactionUrls.length === 0) {
        setError('At least one transaction document is required.')
        return
      }

      // Exactly the figures the client was shown — same function, same numbers.
      const cargo = calcCargoSummary(sections, mode)

      // Built once, so the cargo sections and the destinations agree on which
      // stop is which. A blank drop-off is filtered out, which shifts the
      // positions of everything after it — the wizard index a cargo section
      // carries is therefore NOT its sequence_order, and has to be mapped.
      const activeDropoffs = dropoffs
        .map((address, dropoffIndex) => ({ address, dropoffIndex }))
        .filter((d) => Boolean(d.address))

      const sequenceByDropoff = new Map(
        activeDropoffs.map((d, i) => [d.dropoffIndex, i + 1] as const),
      )

      const cargoItems = buildCargoItems(sections, mode, sequenceByDropoff)

      if (!attemptKey.current) attemptKey.current = crypto.randomUUID()

      const payload = {
        idempotency_key:   attemptKey.current,
        origin:            pickup,
        ...(pickupLat != null && { origin_latitude:  pickupLat }),
        ...(pickupLng != null && { origin_longitude: pickupLng }),
        truck_type_needed: vehicle.name,
        schedule_date:     date,
        call_time:         time,
        ...(paymentTerms            && { payment_terms:       paymentTerms }),
        ...(cargo.grossWeightKg  > 0 && { required_weight_kg:     parseFloat(cargo.grossWeightKg.toFixed(2)) }),
        ...(cargo.volumeCbm      > 0 && { required_volume_cbm:    parseFloat(cargo.volumeCbm.toFixed(4)) }),
        ...(cargo.netWeightKg    > 0 && { required_net_weight_kg: parseFloat(cargo.netWeightKg.toFixed(2)) }),
        // The longest edge of any single item, whichever axis it was entered on.
        ...(cargo.maxDimensionCm > 0 && { required_length_cm:     cargo.maxDimensionCm }),
        non_stackable_cargo: cargo.hasNonStackable,
        transaction_documents: transactionUrls,
        ...(cargoItems.length > 0      && { cargo_items:           cargoItems }),
        destinations: activeDropoffs.map(({ address, dropoffIndex }, i) => ({
          address,
          sequence_order: i + 1,
          // Coordinates are stored against the ORIGINAL wizard index, so they
          // must be read with that index, not the post-filter one. They were
          // read with the filtered index before, which silently attached the
          // wrong coordinates to every stop after a blank one.
          ...(dropoffCoords[dropoffIndex]?.lat != null && { latitude:  dropoffCoords[dropoffIndex].lat }),
          ...(dropoffCoords[dropoffIndex]?.lng != null && { longitude: dropoffCoords[dropoffIndex].lng }),
        })),
      }

      const result = await bookingService.createBooking(payload)
      const bookingReference = result?.reference_number ?? result?.booking_id ?? null

      // Booked. Release the attempt key and the cached uploads so "New booking"
      // starts genuinely fresh rather than resolving back to this one.
      attemptKey.current = null
      setUploadedUrls(null)

      setBookingId(bookingReference)
      dispatch(resetBooking())
      onClearFiles()
      setSubmitted(true)

      appToast.success('Booking submitted successfully.', {
        action: 'booking-create',
        ...(result?.booking_id != null ? { entityId: result.booking_id } : {}),
      })

    } catch (err: unknown) {
      console.error('Booking failed:', err)
      let message = 'Failed to submit booking. Please try again.'
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string }; status?: number } }
        message = axiosErr.response?.data?.message ?? message
      } else if (err instanceof Error) {
        message = err.message
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const serviceLabel =
    selectedService === 'fmcg'
      ? 'Fast Moving Cargo Goods'
      : 'Not selected'

  const buttonLabel = (() => {
    if (!loading) return 'Book Transit'
    if (docUploadState === 'uploading') return 'Uploading documents…'
    return 'Processing…'
  })()

  return (
    <div className="flex flex-col h-full overflow-auto p-4 lg:p-6 gap-4 lg:gap-6">
      <AnimatePresence mode="wait">

        {submitted ? (
          <SuccessView
            key="success"
            bookingReference={bookingId}
            onNewBooking={onNewBooking}
          />
        ) : (

          <motion.div
            key="review"
            variants={stagger}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-4 lg:gap-6 pb-4"
          >

            <motion.div variants={fadeUp} className="flex items-center gap-2">
              <Truck size={18} className="text-white" />
              <div>
                <h2 className="ff-sc booking-text text-white font-bold tracking-wide text-lg lg:text-2xl">
                  Transit Details
                </h2>
                <p className="ff-sc booking-text text-[var(--color-muted)] text-xs lg:text-sm">
                  Review your booking
                </p>
              </div>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="rounded-2xl bg-[#2A2828] border border-white/[0.07]
                         border-t-[3px] border-t-[var(--color-cyan)] p-5 lg:p-6"
            >
              <div className="flex flex-col lg:flex-row gap-6">

                <div className="flex flex-col gap-4 w-full lg:w-1/2">
                  <div>
                    <SectionLabel>Schedule</SectionLabel>
                    <div className="flex gap-3 mt-2">
                      <InfoBox label="Date" value={date || '—'} className="flex-1" />
                      <InfoBox label="Time" value={time || '—'} className="w-[120px] sm:min-w-[250px]" />
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Pick-Up Point</SectionLabel>
                    <InfoBox value={pickup || '—'} className="w-full mt-2" />
                  </div>

                  <div>
                    <SectionLabel>Drop-Off Point(s)</SectionLabel>
                    <div className="flex flex-col gap-2 mt-2">
                      {dropoffs.filter(Boolean).map((d, i) => (
                        <InfoBox key={i} value={d} className="w-full" />
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Service Type</SectionLabel>
                    <InfoBox value={serviceLabel} className="mt-2 w-full" />
                  </div>

                  {paymentTerms && (
                    <div>
                      <SectionLabel>Payment Terms</SectionLabel>
                      <InfoBox value={`${paymentTerms} days`} className="mt-2 w-full" />
                    </div>
                  )}

                  {pendingFiles.length > 0 && (
                    <div>
                      <SectionLabel>Transaction Documents</SectionLabel>
                      <div className="flex flex-col gap-1 mt-2">
                        {pendingFiles.map((f, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded-lg border border-white/[0.10]
                                       bg-white/[0.03] px-3 py-2"
                          >
                            <span className="ff-sc booking-text text-white/60 text-xs truncate flex-1">
                              {f.name}
                            </span>
                            <span className="ff-sc booking-text text-white/30 text-[10px] shrink-0">
                              {(f.size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        ))}
                        <p className="ff-sc booking-text text-[10px] text-white/30 mt-1">
                          Will be uploaded on confirmation
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center gap-3 w-full lg:w-1/2">
                  <SectionLabel className="self-center">Transit Vehicle</SectionLabel>
                  {vehicle ? (
                    <>
                      <div className="relative w-full h-[180px] lg:h-[220px]">
                        <Image
                          src={vehicle.imageUrl || '/images/vehicles/default-truck.png'}
                          alt={vehicle.name}
                          fill
                          className="object-contain drop-shadow-2xl"
                        />
                      </div>
                      <p className="ff-sc booking-text text-white text-2xl lg:text-3xl tracking-widest text-center">
                        {vehicle.name}
                      </p>
                    </>
                  ) : (
                    <p className="ff-sc booking-text text-white/40 text-sm">No vehicle selected</p>
                  )}
                </div>

              </div>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="rounded-2xl bg-[#2A2828] border border-white/[0.07]
                         border-t-[3px] border-t-[var(--color-cyan)] p-5 lg:p-6"
            >
              <SectionLabel className="mb-4 text-base lg:text-lg">Product Details</SectionLabel>

              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 rounded-sm bg-[var(--color-cyan)] text-[var(--color-bg)]
                                 ff-sc booking-text text-xs font-bold uppercase tracking-widest">
                  {mode} Cargo
                </span>
                <p className="ff-sc booking-text text-white/50 text-xs uppercase tracking-widest">
                  {allGroups.length} product group{allGroups.length !== 1 ? 's' : ''}
                </p>
              </div>

              {sections.length === 0 && (
                <p className="ff-sc booking-text text-white/40 text-sm">No cargo details added.</p>
              )}

              <div className="flex flex-col gap-6">
                {sections.map((section) => {
                  const dropoffLabel =
                    dropoffs[section.dropoffIndex]?.trim() || `Drop-off ${section.dropoffIndex + 1}`

                  return (
                    <div key={section.dropoffIndex} className="flex flex-col gap-3">

                      <div className="flex items-center gap-2">
                        <span className="ff-sc booking-text text-white/50 text-xs uppercase tracking-widest">
                          Drop-off {section.dropoffIndex + 1}:
                        </span>
                        <span className="ff-sc booking-text text-white/80 text-xs truncate">
                          {dropoffLabel}
                        </span>
                      </div>

                      {section.groups.map((g, i) => (
                        <motion.div
                          key={g.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="flex flex-col gap-1"
                        >
                          <span className="ff-sc booking-text text-white text-xs lg:text-sm uppercase tracking-widest px-2">
                            {mode === 'palletized' ? `Pallet Group #${i + 1}` : `Product #${i + 1}`}
                          </span>

                          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                            <div className="flex flex-col divide-y bg-[#424242] divide-white/[0.06]">

                              {g.commodity     && <DetailRow label="Commodity"      value={g.commodity} />}
                              {g.product       && <DetailRow label="Product"        value={g.product} />}
                              {g.shc           && <DetailRow label="Special Handling Code"            value={g.shc} />}
                              {g.additionalShc && <DetailRow label="Additional Special Handling Code" value={g.additionalShc} />}

                              {mode === 'loose' && (
                                <>
                                  <DetailRow label="Pieces" value={g.pieces || '—'} />
                                  <DetailRow
                                    label="Dimensions (L × W × H)"
                                    value={
                                      g.looseLength && g.looseWidth && g.looseHeight
                                        ? `${g.looseLength} × ${g.looseWidth} × ${g.looseHeight} cm`
                                        : '—'
                                    }
                                  />
                                  <DetailRow
                                    label="Weight"
                                    value={g.weight ? `${g.weight} ${g.weightUnit} (${g.perItem})` : '—'}
                                  />
                                  {g.nonTiltable  && <DetailRow label="Non-tiltable"  value="Yes" />}
                                  {g.nonStackable && <DetailRow label="Non-stackable" value="Yes" />}
                                </>
                              )}

                              {mode === 'palletized' && (
                                <>
                                  <DetailRow label="No. of Pallets" value={g.numPallets || '—'} />
                                  <DetailRow label="Pallet Type"    value={g.palletType || '—'} />
                                  <DetailRow
                                    label="Dimensions (L × W × H)"
                                    value={
                                      g.palletLength && g.palletWidth && g.palletHeight
                                        ? `${g.palletLength} × ${g.palletWidth} × ${g.palletHeight} cm`
                                        : '—'
                                    }
                                  />
                                  <DetailRow
                                    label="Gross Weight / Pallet"
                                    value={
                                      g.grossWeightPerPallet
                                        ? `${g.grossWeightPerPallet} ${g.palletWeightUnit}`
                                        : '—'
                                    }
                                  />
                                  <DetailRow
                                    label="Net Weight / Pallet"
                                    value={
                                      g.netWeightPerPallet
                                        ? `${g.netWeightPerPallet} ${g.palletWeightUnit}`
                                        : '—'
                                    }
                                  />
                                  {g.stackable && <DetailRow label="Stackable" value="Yes" />}
                                  {g.oversize  && <DetailRow label="Oversize"  value="Yes" />}
                                </>
                              )}

                            </div>
                          </div>
                        </motion.div>
                      ))}

                    </div>
                  )
                })}
              </div>
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3"
              >
                <p className="ff-sc booking-text text-red-400 text-sm">{error}</p>
              </motion.div>
            )}

            <motion.div
              variants={fadeUp}
              className="flex justify-between items-center gap-3 pt-2"
            >
              <motion.button
                onClick={onBack}
                disabled={loading}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2
                           px-6 lg:px-8 py-3 rounded-xl ff-sc booking-text text-base lg:text-lg
                           bg-transparent border border-white/10 hover:text-white hover:border-white/20
                           disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all duration-300 cursor-pointer"
              >
                BACK
              </motion.button>

              <motion.button
                onClick={confirm}
                disabled={loading}
                whileHover={!loading ? { scale: 1.03 } : {}}
                whileTap={!loading ? { scale: 0.97 } : {}}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2
                           px-8 lg:px-12 py-3 rounded-xl cursor-pointer
                           ff-sc booking-text font-bold uppercase tracking-[0.15em]
                           bg-white text-[var(--color-bg)] hover:bg-[var(--color-cyan)]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors duration-300 text-sm lg:text-base"
              >
                {loading ? <><Spinner /> {buttonLabel}</> : 'Book Transit'}
              </motion.button>
            </motion.div>

          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

function SectionLabel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h3 className={`ff-sc booking-text text-white font-bold tracking-wide ${className}`}>
      {children}
    </h3>
  )
}

function InfoBox({
  label,
  value,
  className = '',
}: {
  label?: string
  value: string
  className?: string
}) {
  return (
    <div className={`rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 py-2 ${className}`}>
      {label && (
        <p className="ff-sc booking-text text-[var(--color-muted)] text-[10px] lg:text-xs
                      uppercase tracking-widest leading-none mb-1">
          {label}
        </p>
      )}
      <p className="ff-sc booking-text text-white text-sm lg:text-base leading-snug">{value}</p>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="ff-sc booking-text text-xs lg:text-sm uppercase tracking-wider leading-tight">{label}</span>
      <span className="ff-sc booking-text text-white text-sm lg:text-base text-right">{value}</span>
    </div>
  )
}

function Spinner() {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
      className="w-4 h-4 rounded-full border-2 border-[var(--color-bg)]/30 border-t-[var(--color-bg)]"
    />
  )
}