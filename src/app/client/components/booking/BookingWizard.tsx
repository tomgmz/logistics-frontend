'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import StepServiceType from './ServiceType'
import StepBookingDetails from './BookingDetails'
import StepVehicle from './ChooseVehicle'
import StepReview from './ReviewBooking'
import { useSessionState } from '../../hooks/UseSessionState'
import './BookingDetails.css'

export type ServiceType = 'ecommerce' | 'fmcg' | null

const STEPS = [
  { id: 1, label: 'Service Type'    },
  { id: 2, label: 'Booking Details' },
  { id: 3, label: 'Vehicle'         },
  { id: 4, label: 'Review'          },
]

const slideVariants = {
  enter:  (dir: number) => ({ x: dir > 0 ?  56 : -56, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir: number) => ({ x: dir > 0 ? -56 :  56, opacity: 0 }),
}

export default function BookingWizard() {
  const [step,    setStep]    = useSessionState<number>('wizard:step',    1)
  const [service, setService] = useSessionState<ServiceType>('wizard:service', null)

  const [dir, setDir] = useState(1)

  const goNext = () => { setDir(1);  setStep((s) => Math.min(s + 1, 4)) }
  const goBack = () => { setDir(-1); setStep((s) => Math.max(s - 1, 1)) }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Stepper bar */}
      <div className="relative shrink-0 bg-[var(--color-bg)] border-b border-white/[0.07]
                      px-4 lg:px-6 h-auto py-3 lg:py-0 lg:h-[62px] flex items-center">

        <h1 className="font-body booking-text text-white text-base lg:text-xl tracking-wider whitespace-nowrap">
          New Booking
          {service && (
            <>
              <span className="text-white/30 mx-1.5">/</span>
              <span className="uppercase">{service}</span>
            </>
          )}
        </h1>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="hidden sm:flex items-center gap-12 pointer-events-auto">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <StepPip
                  step={s}
                  isActive={step === s.id}
                  isDone={step > s.id}
                  onClick={() => {
                    if (s.id < step) { setDir(-1); setStep(s.id) }
                  }}
                />
                {i < STEPS.length - 1 && (
                  <div className={`w-10 lg:w-16 h-px mx-1 transition-colors duration-500
                    ${step > s.id ? 'bg-[var(--color-cyan)]' : 'bg-white/10'}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <span className="sm:hidden ml-auto font-body text-sm whitespace-nowrap text-white">
          {STEPS.find((s) => s.id === step)?.label}
        </span>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            className="absolute inset-0"
          >
            {step === 1 && (
              <StepServiceType selected={service} setSelected={setService} onNext={goNext} />
            )}
            {step === 2 && <StepBookingDetails onNext={goNext} onBack={goBack} />}
            {step === 3 && <StepVehicle        onNext={goNext} onBack={goBack} />}
            {step === 4 && <StepReview selectedService={service} onBack={goBack} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* Step pip */
function StepPip({
  step, isActive, isDone, onClick,
}: {
  step: { id: number; label: string }
  isActive: boolean
  isDone: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 group">
      <motion.div
        animate={{
          backgroundColor: isDone
            ? '#3AF626'
            : isActive
            ? '#4DF9ED'
            : 'rgba(255,255,255,0.08)',
          scale: isActive ? 1.1 : 1,
        }}
        transition={{ duration: 0.3 }}
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0"
      >
        {isDone ? (
          <Check size={11} strokeWidth={3} className="text-[var(--color-bg)]" />
        ) : (
          <span className={`text-[9px] font-bold leading-none
            ${isActive ? 'text-[var(--color-bg)]' : 'text-[var(--color-muted)]'}`}>
            {step.id}
          </span>
        )}
      </motion.div>
      <span className={`font-body booking-text sm:!text-[0.7rem] lg:text-sm transition-colors whitespace-nowrap
        ${isActive ? 'text-white' : isDone ? 'text-[var(--color-cyan)]' : 'text-[var(--color-muted)]'}`}>
        {step.label}
      </span>
    </button>
  )
}