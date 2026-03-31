'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, Truck, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/lib/store/hooks'
import { setVehicle } from '@/app/lib/store/bookingSlice'
import type { CargoMode, DropoffSection } from '@/app/lib/store/bookingSlice'
import { useTrucks } from '../../hooks/useTrucks'
import './BookingDetails.css'
import WizBtn from '../WizButton'

interface Props {
  onNext: () => void
  onBack: () => void
}

function calcSummary(sections: DropoffSection[], mode: CargoMode) {
  let totalPieces = 0, grossWeight = 0, netWeight = 0, volume = 0
  for (const section of sections) {
    for (const g of section.groups) {
      if (mode === 'palletized') {
        const pallets = Number(g.numPallets)           || 0
        const gross   = Number(g.grossWeightPerPallet) || 0
        const net     = Number(g.netWeightPerPallet)   || 0
        totalPieces += pallets
        grossWeight += pallets * gross
        netWeight   += pallets * net
      } else {
        const pieces = Number(g.pieces)      || 0
        const length = Number(g.looseLength) || 0
        const width  = Number(g.looseWidth)  || 0
        const height = Number(g.looseHeight) || 0
        const weight = Number(g.weight)      || 0
        if (pieces <= 0) continue
        const weightKG = g.weightUnit === 'lbs' ? weight * 0.453592 : weight
        totalPieces += pieces
        grossWeight += g.perItem === 'Per Item' ? pieces * weightKG : weightKG
        volume      += pieces * (length * width * height) / 1_000_000
      }
    }
  }
  const density = volume > 0 ? grossWeight / volume : 0
  return { totalPieces, grossWeight, netWeight, volume, density }
}

function getStatus(
  v: { maxWeightKG: number; maxVolumeCBM: number },
  grossWeight: number,
  volume: number,
) {
  const wOver = grossWeight > v.maxWeightKG && v.maxWeightKG > 0
  const vOver = volume > v.maxVolumeCBM && v.maxVolumeCBM > 0
  const isOverloaded = wOver || vOver
  let tripsNeeded = 1
  if (v.maxWeightKG > 0 && grossWeight > 0)
    tripsNeeded = Math.max(tripsNeeded, Math.ceil(grossWeight / v.maxWeightKG))
  if (v.maxVolumeCBM > 0 && volume > 0)
    tripsNeeded = Math.max(tripsNeeded, Math.ceil(volume / v.maxVolumeCBM))
  const wUtil = v.maxWeightKG > 0 ? grossWeight / v.maxWeightKG : 0
  const vUtil = v.maxVolumeCBM > 0 ? volume / v.maxVolumeCBM : 0
  const isSuggested = !isOverloaded && (wUtil > 0 || vUtil > 0) && wUtil <= 0.8 && vUtil <= 0.8
  return { isOverloaded, isSuggested, tripsNeeded }
}

const slideV = {
  enter:  (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
}

export default function StepVehicle({ onNext, onBack }: Props) {
  const { vehicles, loading, error } = useTrucks()

  const dispatch = useAppDispatch()
  const sections = useAppSelector((s) => s.booking.sections)
  const mode     = useAppSelector((s) => s.booking.mode)

  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState(1)

  const allGroups = sections.flatMap((s) => s.groups)
  const summary   = useMemo(() => calcSummary(sections, mode), [sections, mode])

  const navigate = (delta: number) => {
    if (vehicles.length === 0) return
    setDir(delta)
    setIdx((i) => (i + delta + vehicles.length) % vehicles.length)
  }

  const goTo = (i: number) => {
    setDir(i > idx ? 1 : -1)
    setIdx(i)
  }

  const vehicle = vehicles[idx]
  const status  = vehicle ? getStatus(vehicle, summary.grossWeight, summary.volume) : null

  const handleReviewBooking = () => {
    if (!vehicle) return
    dispatch(setVehicle(vehicle))
    onNext()
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-[var(--color-cyan)] animate-spin" />
          <p className="font-body booking-text text-white/70">Loading available vehicles...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <Truck className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="font-body booking-text text-white text-xl mb-2">Failed to Load Vehicles</h3>
          <p className="font-body text-white/60 mb-6">{error}</p>
          <button onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-[var(--color-cyan)] text-[var(--color-bg)] font-body booking-text font-bold uppercase tracking-wider hover:opacity-90 transition-opacity">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (vehicles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
            <Truck className="w-8 h-8 text-white/40" />
          </div>
          <h3 className="font-body booking-text text-white text-xl mb-2">No Vehicles Available</h3>
          <p className="font-body text-white/60 mb-6">
            There are currently no vehicles available for booking. Please try again later or contact support.
          </p>
          <button onClick={onBack}
            className="px-6 py-3 rounded-xl bg-white/10 text-white font-body booking-text font-bold uppercase tracking-wider hover:bg-white/20 transition-colors">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto lg:overflow-hidden p-3 sm:p-4 lg:p-5 gap-3 sm:gap-4">
      <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 lg:flex-1 lg:min-h-0">

        {/* LEFT CARD */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="lg:w-[360px] xl:w-[400px] shrink-0 rounded-2xl bg-[#2A2828]
                     border border-white/[0.07] border-t-[3px] border-t-[var(--color-cyan)]
                     p-4 sm:p-5 lg:p-6 flex flex-col gap-3 sm:gap-4"
        >
          <div className="flex items-center gap-2">
            <Truck size={15} className="text-white" />
            <h3 className="font-body booking-text text-white font-bold tracking-wide">Product Details</h3>
          </div>
          <span className="inline-flex w-fit items-center px-3 py-1 rounded-sm
                           bg-[var(--color-cyan)] text-[var(--color-bg)]
                           font-body booking-text !text-[10px] sm:!text-xs lg:!text-sm font-bold uppercase tracking-widest">
            {mode} Cargo
          </span>
          <p className="font-body booking-text !text-[10px] sm:!text-xs lg:!text-sm uppercase tracking-[0.14em] text-white/70">
            {summary.totalPieces > 0
              ? mode === 'palletized'
                ? `${summary.totalPieces} pallet${summary.totalPieces !== 1 ? 's' : ''} across ${allGroups.length} group${allGroups.length !== 1 ? 's' : ''}`
                : `${summary.totalPieces} pieces across ${allGroups.length} item group${allGroups.length !== 1 ? 's' : ''}`
              : 'No pieces added yet'}
          </p>
          <div className="sep-x" />
          <div className="grid grid-cols-2 gap-2">
            <StatCard label={mode === 'palletized' ? 'Total Pallets' : 'Total Pieces'}
              value={summary.totalPieces > 0 ? String(summary.totalPieces) : '—'} />
            <StatCard label="Gross Weight"
              value={summary.grossWeight > 0 ? `${summary.grossWeight.toFixed(1)} KG` : '—'} />
            <StatCard label="Volume"
              value={summary.volume > 0 ? `${summary.volume.toFixed(2)} CBM` : '—'} />
            {mode === 'palletized'
              ? <StatCard label="Net Weight" value={summary.netWeight > 0 ? `${summary.netWeight.toFixed(1)} KG` : '—'} />
              : <StatCard label="Density"    value={summary.density > 0 ? `${summary.density.toFixed(0)} KG/CBM` : '—'} />}
          </div>
          <div className="flex flex-col gap-1 mt-1">
            {mode === 'loose' ? (
              <>
                {allGroups.some((g) => g.nonTiltable) && (
                  <p className="font-body booking-text !text-[10px] sm:!text-xs lg:!text-sm uppercase tracking-[0.12em] text-white/60">· Non-tiltable items present</p>
                )}
                {allGroups.some((g) => g.nonStackable) && (
                  <p className="font-body booking-text !text-[10px] sm:!text-xs lg:!text-sm uppercase tracking-[0.12em] text-white/60">· Non-stackable items present</p>
                )}
              </>
            ) : (
              <>
                {allGroups.some((g) => g.stackable) && (
                  <p className="font-body booking-text !text-[10px] sm:!text-xs lg:!text-sm uppercase tracking-[0.12em] text-white/60">· Stackable pallets</p>
                )}
                {allGroups.some((g) => g.oversize) && (
                  <p className="font-body booking-text !text-[10px] sm:!text-xs lg:!text-sm uppercase tracking-[0.12em] text-white/60">· Oversize pallets</p>
                )}
              </>
            )}
          </div>
        </motion.div>

        {/* RIGHT CARD */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06 }}
          className="flex-1 min-w-0 lg:min-h-0 rounded-2xl bg-[#2A2828]
                     border border-white/[0.07] border-t-[3px] border-t-[var(--color-cyan)] flex flex-col"
        >
          <div className="px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 pb-1 shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <Truck size={15} className="text-white" />
              <h3 className="font-body booking-text text-white font-bold tracking-wide">Transit Vehicle</h3>
            </div>
            <p className="font-body booking-text text-xs sm:text-sm sm:pl-5">Choose a vehicle for your transit</p>
          </div>

          <div className="flex-1 lg:min-h-0 lg:overflow-auto flex flex-col px-3 sm:px-4 lg:px-5 pb-4 sm:pb-5 gap-3 sm:gap-4">
            <div className="relative flex items-center gap-2">
              <motion.button onClick={() => navigate(-1)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-white/50 hover:text-white transition-colors cursor-pointer">
                <ChevronLeft size={22} />
              </motion.button>

              <div className="flex-1 relative overflow-hidden rounded-xl min-h-[160px] sm:min-h-[200px] lg:min-h-[240px] sm:p-20">
                <AnimatePresence mode="wait" custom={dir}>
                  <motion.div key={vehicle.id} custom={dir} variants={slideV} initial="enter" animate="center" exit="exit"
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
                    className="absolute inset-0 flex items-center justify-center p-4 sm:p-6"
                  >
                    <div className="relative w-full h-full">
                      <Image src={vehicle.imageUrl || '/images/vehicles/default-truck.png'} alt={vehicle.name}
                        fill className="object-contain drop-shadow-2xl" priority />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <motion.button onClick={() => navigate(1)} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-white/50 hover:text-white transition-colors cursor-pointer">
                <ChevronRight size={22} />
              </motion.button>
            </div>

            <AnimatePresence mode="wait">
              <motion.h2 key={vehicle.id + '-name'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="font-body booking-text text-white text-center tracking-widest">
                {vehicle.name}
              </motion.h2>
            </AnimatePresence>

            <div className="flex justify-center items-center gap-1.5">
              {vehicles.map((v, i) => (
                <button key={v.id} onClick={() => goTo(i)}
                  className={`transition-all duration-300 rounded-full
                    ${i === idx ? 'w-5 h-1.5 bg-[var(--color-cyan)]' : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'}`} />
              ))}
            </div>

            {status && (
              <div className="flex flex-wrap items-center gap-2 min-h-[28px]">
                <AnimatePresence>
                  {status.isSuggested && (
                    <motion.span key="suggested" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                      className="px-3 py-1 rounded-md bg-[var(--color-cyan)] text-[var(--color-bg)] font-body booking-text !text-[10px] sm:!text-xs lg:!text-sm font-bold uppercase tracking-widest">
                      Suggested
                    </motion.span>
                  )}
                  {status.isOverloaded && (
                    <motion.span key="overloaded" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                      className="px-3 py-1 rounded-md bg-red-500 text-white font-body booking-text !text-[10px] sm:!text-xs lg:!text-sm font-bold uppercase tracking-widest">
                      Overloaded
                    </motion.span>
                  )}
                </AnimatePresence>
                {status.isOverloaded && status.tripsNeeded > 1 && (
                  <p className="font-body booking-text !text-[10px] sm:!text-xs lg:!text-sm uppercase tracking-[0.10em] text-white/50">
                    · {status.tripsNeeded} trips needed for this cargo volume
                  </p>
                )}
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div key={vehicle.id + '-caps'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="grid grid-cols-3 gap-2 sm:gap-3">
                <CapCard label="Maximum Volume Capacity"
                  value={vehicle.maxVolumeCBM > 0 ? `${vehicle.maxVolumeCBM} CBM` : '—'}
                  overloaded={summary.volume > vehicle.maxVolumeCBM && vehicle.maxVolumeCBM > 0} />
                <CapCard label="Maximum Weight Capacity"
                  value={`${vehicle.maxWeightKG.toLocaleString()} KG`}
                  overloaded={summary.grossWeight > vehicle.maxWeightKG && vehicle.maxWeightKG > 0} />
                <CapCard label="Maximum Length Capacity"
                  value={vehicle.maxLengthCM > 0 ? `${vehicle.maxLengthCM} CM` : '0'}
                  overloaded={false} />
              </motion.div>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.div key={vehicle.id + '-specs'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.22, delay: 0.04 }}
                className="flex flex-col divide-y divide-white/[0.06]">
                <SpecRow label="Body type"         value={vehicle.bodyType} />
                <SpecRow label="Dimension"          value={vehicle.dimension} />
                <SpecRow label="Suitable for"       value={vehicle.suitableFor} />
                <SpecRow label="Stackable friendly" value={vehicle.stackableFriendly ? 'Yes' : 'No'} />
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-between items-center pt-2">
              <WizBtn onClick={onBack} variant="back"><ArrowLeft size={14} /> BACK</WizBtn>
              <WizBtn onClick={handleReviewBooking} variant="next">Review Booking</WizBtn>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#4DF9ED] bg-white p-2.5 sm:p-3 lg:p-4 flex flex-col gap-1">
      <p className="font-body text-[#818181] !text-[10px] sm:!text-xs lg:!text-sm uppercase tracking-widest leading-none">{label}</p>
      <p className="font-body booking-text text-black text-base sm:text-lg lg:text-2xl leading-none tracking-wide font-bold whitespace-nowrap truncate">{value}</p>
    </div>
  )
}

function CapCard({ label, value, overloaded }: { label: string; value: string; overloaded: boolean }) {
  return (
    <div className={`rounded-xl border p-2.5 sm:p-3 lg:p-4 flex flex-col gap-1 bg-white transition-colors ${overloaded ? 'border-red-400' : 'border-[#4DF9ED]'}`}>
      <p className={`font-body !text-[10px] sm:!text-xs lg:!text-sm uppercase tracking-widest leading-tight ${overloaded ? 'text-red-500' : 'text-[#818181]'}`}>{label}</p>
      <p className={`font-body booking-text text-sm sm:text-base lg:text-xl leading-none font-bold whitespace-nowrap truncate ${overloaded ? 'text-red-500' : 'text-black'}`}>{value}</p>
    </div>
  )
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-0 py-2 sm:py-2.5">
      <span className="font-body !text-[10px] sm:!text-xs lg:!text-base uppercase tracking-wider">{label}</span>
      <span className="font-body !text-[10px] sm:!text-xs lg:!text-base text-white text-right">{value}</span>
    </div>
  )
}