'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Truck } from 'lucide-react'
import Image from 'next/image'
import { useAppSelector } from '@/app/lib/store/hooks'
import type { ServiceType, DropoffSection, CargoMode } from '@/app/lib/store/slice/booking.slice'
import { createBooking } from '@/app/lib/api/client/booking.api'
import { getMe } from '@/app/lib/api/auth.api'
import './BookingDetails.css'
import SuccessView from './SuccessView'

interface Props {
  selectedService: ServiceType
  onBack: () => void
  onNewBooking: () => void
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38 } },
}

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08 } },
}

function calcSummary(sections: DropoffSection[], mode: CargoMode) {
  let grossWeight = 0
  let volume = 0
  let stackableRequired = false

  for (const section of sections) {
    for (const g of section.groups) {
      if (mode === 'palletized') {
        const pallets = Number(g.numPallets) || 0
        if (pallets <= 0) continue
        grossWeight += pallets * (Number(g.grossWeightPerPallet) || 0)
        if (g.stackable) stackableRequired = true
      } else {
        const pieces = Number(g.pieces)
        const l      = Number(g.looseLength)
        const w      = Number(g.looseWidth)
        const h      = Number(g.looseHeight)
        const wt     = Number(g.weight)
        if (!Number.isFinite(pieces) || pieces <= 0) continue
        if (!Number.isFinite(l) || l <= 0 ||
            !Number.isFinite(w) || w <= 0 ||
            !Number.isFinite(h) || h <= 0) continue
        if (!Number.isFinite(wt) || wt <= 0) continue
        const weightKG = g.weightUnit === 'lbs' ? wt * 0.453592 : wt
        grossWeight += g.perItem === 'Per Item' ? pieces * weightKG : weightKG
        volume += pieces * (l * w * h) / 1_000_000
      }
    }
  }

  return { grossWeight, volume, stackableRequired }
}

function buildCargoDetails(
  sections: DropoffSection[],
  mode: CargoMode,
  service: ServiceType,
): string {
  return JSON.stringify({ service, mode, sections })
}

export default function StepReview({ selectedService, onBack, onNewBooking }: Props) {
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  const pickupLat     = useAppSelector((s) => s.booking.pickupLat)
  const pickupLng     = useAppSelector((s) => s.booking.pickupLng)
  const dropoffCoords = useAppSelector((s) => s.booking.dropoffCoords)

  const date     = useAppSelector((s) => s.booking.date)
  const time     = useAppSelector((s) => s.booking.time)
  const pickup   = useAppSelector((s) => s.booking.pickup)
  const dropoffs = useAppSelector((s) => s.booking.dropoffs)
  const mode     = useAppSelector((s) => s.booking.mode)
  const sections = useAppSelector((s) => s.booking.sections)
  const vehicle  = useAppSelector((s) => s.booking.vehicle)

  const allGroups = sections.flatMap((s) => s.groups)

const confirm = async () => {
    if (!vehicle) return
    setLoading(true)
    setError(null)

    try {
      const me = await getMe()
      const clientId = me.clients?.client_id

      if (!clientId) {
        setError('Client profile not found. Please contact support.')
        setLoading(false)
        return
      }

      const { grossWeight, volume, stackableRequired } = calcSummary(sections, mode)

      const payload = {
        client_id:         clientId,
        origin:            pickup,
        ...(pickupLat != null && { origin_latitude:  pickupLat }),
        ...(pickupLng != null && { origin_longitude: pickupLng }),
        truck_type_needed: vehicle.name,
        cargo_details:     buildCargoDetails(sections, mode, selectedService),
        schedule_date:     date,
        call_time:         time,
        ...(grossWeight > 0 && { required_weight_kg:  parseFloat(grossWeight.toFixed(2)) }),
        ...(volume      > 0 && { required_volume_cbm: parseFloat(volume.toFixed(4)) }),
        ...(vehicle.maxLengthCM > 0 && { required_length_cm: vehicle.maxLengthCM }),
        stackable_required: stackableRequired,
        destinations: dropoffs
          .filter(Boolean)
          .map((address, i) => ({
            address,
            sequence_order: i + 1,
            ...(dropoffCoords[i]?.lat != null && { latitude:  dropoffCoords[i].lat }),
            ...(dropoffCoords[i]?.lng != null && { longitude: dropoffCoords[i].lng }),
          })),
      }

      const result = await createBooking(payload)
      setBookingId(result?.booking_id ?? null)
      setSubmitted(true)

    } catch (err: unknown) {
      console.error('Booking failed:', err)

      let message = 'Failed to submit booking. Please try again.'
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string }; status?: number } }
        console.error('Backend response:', axiosErr.response?.status, axiosErr.response?.data)
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
    selectedService === 'ecommerce' ? 'E-Commerce'
    : selectedService === 'fmcg'   ? 'Fast Moving Cargo Goods'
    : 'Not selected'

  return (
    <div className="flex flex-col h-full overflow-auto p-4 lg:p-6 gap-4 lg:gap-6">
      <AnimatePresence mode="wait">

        {submitted ? (
          <SuccessView
            key="success"
            bookingId={bookingId}
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

            {/* heading */}
            <motion.div variants={fadeUp} className="flex items-center gap-2">
              <Truck size={18} className="text-white" />
              <div>
                <h2 className="font-body booking-text text-white font-bold tracking-wide text-lg lg:text-2xl">
                  Transit Details
                </h2>
                <p className="font-body booking-text text-[var(--color-muted)] text-xs lg:text-sm">
                  Review your booking
                </p>
              </div>
            </motion.div>

            {/* card 1 */}
            <motion.div
              variants={fadeUp}
              className="rounded-2xl bg-[#2A2828] border border-white/[0.07]
                         border-t-[3px] border-t-[var(--color-cyan)] p-5 lg:p-6"
            >
              <div className="flex flex-col lg:flex-row gap-6">

                {/* left */}
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
                </div>

                {/* right */}
                <div className="flex flex-col items-center lg:items-end gap-3 w-full lg:w-1/2">
                  <SectionLabel className="self-start lg:self-end">Transit Vehicle</SectionLabel>
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
                      <p className="font-body booking-text text-white text-2xl lg:text-3xl tracking-widest text-center">
                        {vehicle.name}
                      </p>
                    </>
                  ) : (
                    <p className="font-body booking-text text-white/40 text-sm">No vehicle selected</p>
                  )}
                </div>

              </div>
            </motion.div>

            {/* card 2 */}
            <motion.div
              variants={fadeUp}
              className="rounded-2xl bg-[#2A2828] border border-white/[0.07]
                         border-t-[3px] border-t-[var(--color-cyan)] p-5 lg:p-6"
            >
              <SectionLabel className="mb-4 text-base lg:text-lg">Product Details</SectionLabel>

              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 rounded-sm bg-[var(--color-cyan)] text-[var(--color-bg)]
                                 font-body booking-text text-xs font-bold uppercase tracking-widest">
                  {mode} Cargo
                </span>
                <p className="font-body booking-text text-white/50 text-xs uppercase tracking-widest">
                  {allGroups.length} product group{allGroups.length !== 1 ? 's' : ''}
                </p>
              </div>

              {sections.length === 0 && (
                <p className="font-body booking-text text-white/40 text-sm">No cargo details added.</p>
              )}

              <div className="flex flex-col gap-6">
                {sections.map((section) => {
                  const dropoffLabel =
                    dropoffs[section.dropoffIndex]?.trim() || `Drop-off ${section.dropoffIndex + 1}`

                  return (
                    <div key={section.dropoffIndex} className="flex flex-col gap-3">

                      {/* dropoff label */}
                      <div className="flex items-center gap-2">
                        <span className="font-body booking-text text-white/50 text-xs uppercase tracking-widest">
                          Drop-off {section.dropoffIndex + 1}:
                        </span>
                        <span className="font-body booking-text text-white/80 text-xs truncate">
                          {dropoffLabel}
                        </span>
                      </div>

                      {/* groups */}
                      {section.groups.map((g, i) => (
                        <motion.div
                          key={g.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="flex flex-col gap-1"
                        >
                          <span className="font-body booking-text text-white text-xs lg:text-sm uppercase tracking-widest px-2">
                            {mode === 'palletized' ? `Pallet Group #${i + 1}` : `Product #${i + 1}`}
                          </span>

                          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
                            <div className="flex flex-col divide-y bg-[#424242] divide-white/[0.06]">

                              {g.commodity     && <DetailRow label="Commodity"      value={g.commodity} />}
                              {g.product       && <DetailRow label="Product"        value={g.product} />}
                              {g.shc           && <DetailRow label="SHC"            value={g.shc} />}
                              {g.additionalShc && <DetailRow label="Additional SHC" value={g.additionalShc} />}

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

            {/* error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3"
              >
                <p className="font-body booking-text text-red-400 text-sm">{error}</p>
              </motion.div>
            )}

            {/* action row */}
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
                           px-6 lg:px-8 py-3 rounded-xl font-body booking-text text-base lg:text-lg
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
                           font-body booking-text font-bold uppercase tracking-[0.15em]
                           bg-white text-[var(--color-bg)] hover:bg-[var(--color-cyan)]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors duration-300 text-sm lg:text-base"
              >
                {loading ? <><Spinner /> Processing...</> : 'Book Transit'}
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
    <h3 className={`font-body booking-text text-white font-bold tracking-wide ${className}`}>
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
        <p className="font-body booking-text text-[var(--color-muted)] text-[10px] lg:text-xs
                      uppercase tracking-widest leading-none mb-1">
          {label}
        </p>
      )}
      <p className="font-body booking-text text-white text-sm lg:text-base leading-snug">{value}</p>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="font-body booking-text text-xs lg:text-sm uppercase tracking-wider">{label}</span>
      <span className="font-body booking-text text-white text-sm lg:text-base text-right">{value}</span>
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

