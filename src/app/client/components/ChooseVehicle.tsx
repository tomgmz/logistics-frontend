'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'

interface Props {
  onNext: () => void
  onBack: () => void
}

const VEHICLES = [
  { id: 'motorcycle', label: 'Motorcycle',    capacity: 'Up to 10 kg',     eta: '1–2 hrs',  price: '₱80',    emoji: '🏍️' },
  { id: 'sedan',      label: 'Sedan / Car',   capacity: 'Up to 200 kg',    eta: '2–3 hrs',  price: '₱200',   emoji: '🚗' },
  { id: 'van',        label: 'Van',           capacity: 'Up to 1,000 kg',  eta: '3–4 hrs',  price: '₱500',   emoji: '🚐' },
  { id: 'truck',      label: 'Truck (4W)',    capacity: 'Up to 3,000 kg',  eta: '4–6 hrs',  price: '₱1,200', emoji: '🚛' },
  { id: 'wingvan',    label: 'Wing Van',      capacity: 'Up to 12,000 kg', eta: '6–8 hrs',  price: '₱3,500', emoji: '🚚' },
  { id: 'trailer',    label: 'Trailer Truck', capacity: 'Up to 22,000 kg', eta: '8–12 hrs', price: '₱7,000', emoji: '🚜' },
]

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const fadeUp  = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38 } },
}

export default function StepVehicle({ onNext, onBack }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="flex flex-col h-full p-5 lg:p-10">

      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        className="mb-6 lg:mb-8"
      >
        <h2 className="font-display text-white text-2xl lg:text-4xl mb-1">SELECT VEHICLE</h2>
        <p className="font-body text-[var(--color-muted)]">
          Choose the right vehicle for your shipment
        </p>
      </motion.div>

      {/* Vehicle grid */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl"
      >
        {VEHICLES.map((v) => {
          const isSelected = selected === v.id
          return (
            <motion.div
              key={v.id}
              variants={fadeUp}
              onClick={() => setSelected(v.id)}
              whileHover={{ scale: 1.03, y: -3 }}
              whileTap={{ scale: 0.97 }}
              className={`relative rounded-2xl p-5 cursor-pointer
                          border-2 transition-all duration-300 noise
                          ${isSelected
                            ? 'bg-[var(--color-cyan)]/8 border-[var(--color-cyan)] glow-cyan'
                            : 'glass-surface border-white/[0.07] hover:border-white/20 card-hover'
                          }`}
            >
              {/* Check badge */}
              <AnimatedCheck show={isSelected} />

              <div className="text-3xl lg:text-4xl mb-3">{v.emoji}</div>

              <h3 className={`font-display text-base lg:text-lg mb-1
                ${isSelected ? 'text-[var(--color-cyan)]' : 'text-white'}`}>
                {v.label}
              </h3>
              <p className="font-body text-[var(--color-muted)] text-xs lg:text-sm mb-3">
                {v.capacity}
              </p>

              <div className="sep-x mb-3" />

              <div className="flex items-center justify-between">
                <span className="font-body text-[var(--color-muted)] text-xs">ETA: {v.eta}</span>
                <span className={`font-display text-sm lg:text-base
                  ${isSelected ? 'text-[var(--color-cyan)]' : 'text-white'}`}>
                  {v.price}
                </span>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Nav */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.48 }}
        className="flex justify-between mt-7 lg:mt-10"
      >
        <WizBtn onClick={onBack} variant="back"><ArrowLeft size={16} /> BACK</WizBtn>
        <WizBtn onClick={() => selected && onNext()} variant="next" disabled={!selected}>
          NEXT <ArrowRight size={16} />
        </WizBtn>
      </motion.div>
    </div>
  )
}

function AnimatedCheck({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      className="absolute top-3 right-3 w-6 h-6 rounded-full
                 bg-[var(--color-cyan)] flex items-center justify-center"
    >
      <Check size={13} strokeWidth={3} className="text-[var(--color-bg)]" />
    </motion.div>
  )
}

function WizBtn({
  onClick, children, variant, disabled,
}: {
  onClick: () => void; children: React.ReactNode
  variant: 'next' | 'back'; disabled?: boolean
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={!disabled ? { scale: 1.04 } : {}}
      whileTap={!disabled  ? { scale: 0.96 } : {}}
      className={`flex items-center gap-2 px-6 lg:px-8 py-3 rounded-xl
                  font-body text-base lg:text-lg transition-all duration-300
                  ${disabled
                    ? 'glass text-white/20 border border-white/[0.06] cursor-not-allowed'
                    : variant === 'next'
                      ? 'glass text-white border border-white/20 hover:border-[var(--color-cyan)]/40 cursor-pointer'
                      : 'bg-transparent text-[var(--color-muted)] border border-white/10 hover:text-white hover:border-white/20 cursor-pointer'
                  }`}
    >
      {children}
    </motion.button>
  )
}