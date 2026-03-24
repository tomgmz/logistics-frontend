'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, CheckCircle2,
  Package, Truck, MapPin, Calendar, Hash,
} from 'lucide-react'
import { ServiceType } from './BookingWizard'

interface Props {
  selectedService: ServiceType
  onBack: () => void
}

export default function StepReview({ selectedService, onBack }: Props) {
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const confirm = async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1800))
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <div className="flex flex-col h-full p-5 lg:p-10">
      <AnimatePresence mode="wait">
        {submitted ? (
          <SuccessView key="success" />
        ) : (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full"
          >
            {/* Heading */}
            <motion.div
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              className="mb-6 lg:mb-8"
            >
              <h2 className="font-display text-white text-2xl lg:text-4xl mb-1">
                REVIEW BOOKING
              </h2>
              <p className="font-body text-[var(--color-muted)]">
                Confirm your booking details before submitting
              </p>
            </motion.div>

            {/* Summary rows */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="max-w-2xl space-y-3"
            >
              <ReviewRow
                icon={<Package size={16} className="text-[var(--color-cyan)]" />}
                label="Service Type"
                value={
                  selectedService === 'ecommerce' ? 'Ecommerce'
                  : selectedService === 'fmcg'    ? 'FMCG'
                  : 'Not selected'
                }
              />
              <ReviewRow
                icon={<MapPin size={16} className="text-[var(--color-cyan)]" />}
                label="Pickup Address"
                value="123 Rizal Ave, Manila"
              />
              <ReviewRow
                icon={<MapPin size={16} className="text-[var(--color-muted)]" />}
                label="Delivery Address"
                value="456 Ayala Blvd, Makati"
              />
              <ReviewRow
                icon={<Calendar size={16} className="text-[var(--color-cyan)]" />}
                label="Pickup Date & Time"
                value="March 25, 2026 — 10:00 AM"
              />
              <ReviewRow
                icon={<Truck size={16} className="text-[var(--color-cyan)]" />}
                label="Vehicle"
                value="Van — Up to 1,000 kg"
              />
              <ReviewRow
                icon={<Hash size={16} className="text-[var(--color-muted)]" />}
                label="Quantity"
                value="24 units"
              />
            </motion.div>

            {/* Price breakdown */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-5 max-w-2xl glass-surface rounded-2xl
                         border border-[var(--color-cyan)]/20 p-5"
            >
              <div className="sep-x-cyan mb-4" />
              <PriceLine label="Base rate"      value="₱ 500.00" />
              <PriceLine label="Distance charge" value="₱ 120.00" />
              <div className="sep-x my-3" />
              <div className="flex justify-between">
                <span className="font-display text-white text-base lg:text-lg">TOTAL</span>
                <span className="font-display text-[var(--color-cyan)] text-base lg:text-lg
                                 text-glow-cyan">
                  ₱ 620.00
                </span>
              </div>
            </motion.div>

            {/* Nav buttons */}
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.44 }}
              className="flex justify-between mt-7 lg:mt-10"
            >
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="flex items-center gap-2 px-6 lg:px-8 py-3 rounded-xl
                           font-body text-base lg:text-lg
                           bg-transparent text-[var(--color-muted)] border border-white/10
                           hover:text-white hover:border-white/20 transition-all cursor-pointer"
              >
                <ArrowLeft size={16} /> BACK
              </motion.button>

              <motion.button
                onClick={confirm}
                disabled={loading}
                whileHover={!loading ? { scale: 1.04 } : {}}
                whileTap={!loading  ? { scale: 0.96 } : {}}
                className="relative flex items-center gap-2 px-7 lg:px-10 py-3 rounded-xl
                           font-display text-base lg:text-lg text-[var(--color-bg)]
                           bg-[var(--color-cyan)] glow-cyan
                           disabled:opacity-60 disabled:cursor-not-allowed
                           cursor-pointer overflow-hidden transition-all"
              >
                {loading ? <><Spinner /> Processing...</> : 'CONFIRM BOOKING'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ReviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 glass-surface rounded-xl
                 border border-white/[0.07] p-3.5 lg:p-4"
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="font-body text-[var(--color-muted)] text-xs mb-0.5">{label}</p>
        <p className="font-body text-white text-sm lg:text-base">{value}</p>
      </div>
    </motion.div>
  )
}

function PriceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between mb-2">
      <span className="font-body text-[var(--color-muted)] text-sm lg:text-base">{label}</span>
      <span className="font-body text-white text-sm lg:text-base">{value}</span>
    </div>
  )
}

function SuccessView() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, type: 'spring' }}
      className="flex flex-col items-center justify-center flex-1 text-center gap-6 py-16"
    >
      <motion.div
        initial={{ scale: 0, rotate: -200 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 190, damping: 14, delay: 0.1 }}
      >
        <CheckCircle2
          size={84}
          className="text-[var(--color-cyan)]"
          strokeWidth={1.2}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <h2 className="font-display text-white text-3xl lg:text-5xl mb-3">
          Booking Confirmed!
        </h2>
        <p className="font-body text-[var(--color-muted)] text-base lg:text-xl">
          Your shipment has been scheduled successfully.
        </p>
        <p className="font-body text-[var(--color-cyan)] text-sm lg:text-lg mt-2 text-glow-cyan">
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
        className="mt-2 px-8 py-3 rounded-xl font-display
                   text-base lg:text-lg text-[var(--color-bg)]
                   bg-[var(--color-cyan)] glow-cyan cursor-pointer"
      >
        NEW BOOKING
      </motion.button>
    </motion.div>
  )
}

function Spinner() {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
      className="w-4 h-4 rounded-full border-2
                 border-[var(--color-bg)]/30 border-t-[var(--color-bg)]"
    />
  )
}