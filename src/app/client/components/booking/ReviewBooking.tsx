'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Truck } from 'lucide-react'
import Image from 'next/image'
import { ServiceType } from './BookingWizard'
import { useSessionState } from '../../hooks/UseSessionState'
import type { VehicleData } from '../../hooks/useTrucks'
import './BookingDetails.css'

interface Props {
  selectedService: ServiceType
  onBack: () => void
}

interface ItemGroup {
  id: number
  pieces: string
  length: string
  width: string
  height: string
  weight: string
  weightUnit: 'kg' | 'lbs'
  perItem: 'Per Item' | 'Total'
  nonTiltable: boolean
  nonStackable: boolean
  numPallets: string
  palletType: 'Standard' | 'Euro' | 'Custom'
  grossWeightPerPallet: string
  netWeightPerPallet: string
  stackable: boolean
  oversize: boolean
}

type CargoMode = 'loose' | 'palletized'

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38 } },
}
const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.08 } },
}

export default function StepReview({ selectedService, onBack }: Props) {
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [date]      = useSessionState('booking:date',      '')
  const [time]      = useSessionState('booking:time',      '')
  const [pickup]    = useSessionState('booking:pickup',    '')
  const [dropoffs]  = useSessionState<string[]>('booking:dropoffs', [''])
  const [commodity] = useSessionState('booking:commodity', '')
  const [product]   = useSessionState('booking:product',   '')
  const [shc]       = useSessionState('booking:shc',       '')
  const [addShc]    = useSessionState('booking:addShc',    '')
  const [mode]      = useSessionState<CargoMode>('booking:mode', 'loose')
  const [groups]    = useSessionState<ItemGroup[]>('booking:groups', [])

  // ✅ Read full vehicle object directly from session — no API call needed
  const [vehicle] = useSessionState<VehicleData | null>('booking:vehicle', null)

  const confirm = async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1800))
    setLoading(false)
    setSubmitted(true)
  }

  const serviceLabel =
    selectedService === 'ecommerce' ? 'E-Commerce'
    : selectedService === 'fmcg'   ? 'Fast Moving Cargo Goods'
    : 'Not selected'

  return (
    <div className="flex flex-col h-full overflow-auto p-4 lg:p-6 gap-4 lg:gap-6">
      <AnimatePresence mode="wait">
        {submitted ? (
          <SuccessView key="success" />
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
                <h2 className="font-body booking-text text-white font-bold tracking-wide text-lg lg:text-2xl">
                  Transit Details
                </h2>
                <p className="font-body booking-text text-[var(--color-muted)] text-xs lg:text-sm">
                  Review your booking
                </p>
              </div>
            </motion.div>

            {/* CARD 1: Schedule + Vehicle */}
            <motion.div variants={fadeUp}
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
                    <InfoBox value={pickup || '—'} className="w-full" />
                  </div>
                  <div>
                    <SectionLabel>Drop-Off Point</SectionLabel>
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

            {/* CARD 2: Product Details */}
            <motion.div variants={fadeUp}
              className="rounded-2xl bg-[#2A2828] border border-white/[0.07]
                         border-t-[3px] border-t-[var(--color-cyan)] p-5 lg:p-6"
            >
              <SectionLabel className="mb-4 text-base lg:text-lg">Product Details</SectionLabel>
              <div className="flex flex-col divide-y divide-white/[0.06]">
                <DetailRow label="Commodity"                        value={commodity || '—'} />
                <DetailRow label="Product"                          value={product   || '—'} />
                <DetailRow label="Special Handling Code"            value={shc       || '—'} />
                <DetailRow label="Additional Special Handling Code" value={addShc    || '—'} />
              </div>

              {groups.length > 0 && (
                <div className="flex flex-col gap-3 mt-4">
                  {groups.map((g, i) => (
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
                        <div className="flex flex-col divide-y bg-[#424242] divide-white/[0.06] p-2 sm:p-10">
                          {mode === 'loose' ? (
                            <>
                              <DetailRow label="Pieces"     value={g.pieces || '—'} />
                              <DetailRow label="Dimensions" value={g.length && g.width && g.height ? `${g.length} × ${g.width} × ${g.height}` : '—'} />
                              <DetailRow label="Weight"     value={g.weight ? `${g.weight} ${g.weightUnit}` : '—'} />
                              {g.nonTiltable  && <DetailRow label="Non-tiltable"  value="Yes" />}
                              {g.nonStackable && <DetailRow label="Non-stackable" value="Yes" />}
                            </>
                          ) : (
                            <>
                              <DetailRow label="No. of Pallets"        value={g.numPallets || '—'} />
                              <DetailRow label="Pallet Type"           value={g.palletType || '—'} />
                              <DetailRow label="Dimensions"            value={g.length && g.width && g.height ? `${g.length} × ${g.width} × ${g.height}` : '—'} />
                              <DetailRow label="Gross Weight / Pallet" value={g.grossWeightPerPallet ? `${g.grossWeightPerPallet} ${g.weightUnit}` : '—'} />
                              <DetailRow label="Net Weight / Pallet"   value={g.netWeightPerPallet   ? `${g.netWeightPerPallet} ${g.weightUnit}`   : '—'} />
                              {g.stackable && <DetailRow label="Stackable" value="Yes" />}
                              {g.oversize  && <DetailRow label="Oversize"  value="Yes" />}
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Action row */}
            <motion.div variants={fadeUp} className="flex justify-between items-center pt-2">
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                className="flex items-center gap-2 px-6 lg:px-8 py-3 rounded-xl
                           font-body booking-text text-base lg:text-lg
                           bg-transparent border border-white/10
                           hover:text-white hover:border-white/20
                           transition-all duration-300 cursor-pointer"
              >
                BACK
              </motion.button>
              <motion.button
                onClick={confirm}
                disabled={loading}
                whileHover={!loading ? { scale: 1.03 } : {}}
                whileTap={!loading  ? { scale: 0.97 } : {}}
                className="flex items-center gap-2 px-8 lg:px-12 py-3 rounded-xl cursor-pointer
                           font-body booking-text font-bold uppercase tracking-[0.15em]
                           bg-white text-[var(--color-bg)]
                           hover:bg-[var(--color-cyan)]
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

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`font-body booking-text text-white font-bold tracking-wide ${className}`}>{children}</h3>
  )
}

function InfoBox({ label, value, className = '' }: { label?: string; value: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 py-2 ${className}`}>
      {label && (
        <p className="font-body booking-text text-[var(--color-muted)] text-[10px] lg:text-xs uppercase tracking-widest leading-none mb-1">
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

function SuccessView() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, type: 'spring' }}
      className="flex flex-col items-center justify-center flex-1 text-center gap-6 py-16 min-h-[400px]"
    >
      <motion.div
        initial={{ scale: 0, rotate: -200 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 190, damping: 14, delay: 0.1 }}
      >
        <CheckCircle2 size={84} className="text-[var(--color-cyan)]" strokeWidth={1.2} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <h2 className="font-body booking-text text-white text-3xl lg:text-5xl font-bold mb-3 uppercase tracking-widest">
          Booking Confirmed!
        </h2>
        <p className="font-body booking-text text-[var(--color-muted)] text-base lg:text-xl">
          Your shipment has been scheduled successfully.
        </p>
        <p className="font-body booking-text text-[var(--color-cyan)] text-sm lg:text-lg mt-2">
          Booking ID: #ACS-2026-00142
        </p>
      </motion.div>
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => window.location.reload()}
        className="mt-2 px-8 py-3 rounded-xl font-body booking-text font-bold uppercase tracking-widest
                   text-base lg:text-lg text-[var(--color-bg)]
                   bg-[var(--color-cyan)] cursor-pointer hover:opacity-90 transition-opacity"
      >
        New Booking
      </motion.button>
    </motion.div>
  )
}