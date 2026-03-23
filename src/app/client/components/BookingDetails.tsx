'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight,
  MapPin, Calendar, Clock, Package, Hash, FileText,
} from 'lucide-react'

interface Props {
  onNext: () => void
  onBack: () => void
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const fadeUp  = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38 } },
}

export default function StepBookingDetails({ onNext, onBack }: Props) {
  const [form, setForm] = useState({
    pickup:      '',
    delivery:    '',
    date:        '',
    time:        '',
    description: '',
    quantity:    '',
    notes:       '',
  })

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const valid = form.pickup && form.delivery && form.date

  return (
    <div className="flex flex-col h-full p-5 lg:p-10">

      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        className="mb-6 lg:mb-8"
      >
        <h2 className="font-display text-white text-2xl lg:text-4xl mb-1">
          BOOKING DETAILS
        </h2>
        <p className="font-body text-[var(--color-muted)]">
          Fill in the shipment information below
        </p>
      </motion.div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 max-w-4xl"
      >
        <motion.div variants={fadeUp}>
          <Field label="Pickup Address" icon={<MapPin size={15} className="text-[var(--color-cyan)]" />}
            value={form.pickup} onChange={set('pickup')} placeholder="Enter pickup location" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <Field label="Delivery Address" icon={<MapPin size={15} className="text-[var(--color-muted)]" />}
            value={form.delivery} onChange={set('delivery')} placeholder="Enter delivery location" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <Field label="Pickup Date" icon={<Calendar size={15} className="text-[var(--color-cyan)]" />}
            value={form.date} onChange={set('date')} type="date" placeholder="" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <Field label="Preferred Time" icon={<Clock size={15} className="text-[var(--color-muted)]" />}
            value={form.time} onChange={set('time')} type="time" placeholder="" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <Field label="Item Description" icon={<Package size={15} className="text-[var(--color-muted)]" />}
            value={form.description} onChange={set('description')} placeholder="Describe your items" />
        </motion.div>
        <motion.div variants={fadeUp}>
          <Field label="Quantity" icon={<Hash size={15} className="text-[var(--color-muted)]" />}
            value={form.quantity} onChange={set('quantity')} type="number" placeholder="No. of items" />
        </motion.div>
        <motion.div variants={fadeUp} className="lg:col-span-2">
          <Field label="Special Instructions" icon={<FileText size={15} className="text-[var(--color-muted)]" />}
            value={form.notes} onChange={set('notes')} placeholder="Fragile, keep upright, etc." />
        </motion.div>
      </motion.div>

      {/* Nav */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.46 }}
        className="flex justify-between mt-6 lg:mt-8"
      >
        <WizBtn onClick={onBack} variant="back"><ArrowLeft size={16} /> BACK</WizBtn>
        <WizBtn onClick={() => valid && onNext()} variant="next" disabled={!valid}>
          NEXT <ArrowRight size={16} />
        </WizBtn>
      </motion.div>
    </div>
  )
}

// Inputs
function Field({
  label, icon, value, onChange, placeholder, type = 'text',
}: {
  label: string; icon: React.ReactNode; value: string
  onChange: (v: string) => void; placeholder: string; type?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 font-body text-[var(--color-muted)] text-xs lg:text-sm">
        {icon} {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full glass-surface rounded-xl px-4 py-3
                   font-body text-white text-sm lg:text-base
                   placeholder-white/20 border border-white/[0.07]
                   focus:outline-none focus:border-[var(--color-cyan)]/40
                   focus:ring-1 focus:ring-[var(--color-cyan)]/20
                   transition-all duration-200 [color-scheme:dark]"
      />
    </div>
  )
}

// Nav Button
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