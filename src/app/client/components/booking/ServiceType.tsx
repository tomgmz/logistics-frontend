'use client'

import Image from 'next/image'
import { motion, Variants } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { ServiceType } from '@/app/lib/store/bookingSlice'
import { SERVICE_TYPES } from '../../../../constants/client/serviceTypeData'

interface Props {
  selected: ServiceType
  setSelected: (s: ServiceType) => void
  onNext: () => void
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
    },
  },
}

export default function StepServiceType({ selected, setSelected, onNext }: Props) {
  return (
    <div className="flex flex-col h-full overflow-auto p-5 lg:p-10 items-center">

      {/* Heading */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="mb-7 lg:mb-10 self-start">
        <motion.h2 variants={fadeUp} className="font-body text-white text-2xl lg:text-4xl mb-1 lg:mb-2">
          SELECT SERVICE TYPE
        </motion.h2>
        <motion.p variants={fadeUp} className="font-body sm:!text-lg text-[var(--color-muted)]">
          Choose the delivery method for this booking
        </motion.p>
      </motion.div>

      {/* Cards */}
      <div className="flex-1 flex items-center justify-center w-full">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 gap-7 lg:gap-20 w-full max-w-6xl"
        >
          {SERVICE_TYPES.map((svc) => {
            const isSelected = selected === svc.id
            return (
              <motion.div
                key={svc.id}
                variants={fadeUp}
                onClick={() => setSelected(svc.id)}
                whileHover={{ scale: 1.02, y: -5 }}
                whileTap={{ scale: 0.98 }}
                className={`relative rounded-[24px] overflow-hidden cursor-pointer
                            flex flex-col transition-all duration-300
                            ${isSelected
                              ? 'bg-white border-2 border-[var(--color-cyan)] shadow-[0_0_40px_rgba(77,249,237,0.18)]'
                              : 'bg-white/[0.07] border-2 border-white/[0.07] hover:border-white/20 card-hover'
                            }`}
              >
                <div
                  className={`relative mx-4 lg:mx-5 mt-4 lg:mt-5 h-40 lg:h-48 overflow-hidden rounded-[16px] shrink-0
                               ${isSelected ? 'ring-2 ring-[var(--color-cyan)]' : ''}`}
                >
                  <Image src={svc.image} alt={svc.title} fill className="object-cover" />
                </div>

                {/* Body */}
                <div className="flex-1 p-4 lg:p-5 flex flex-col justify-between">
                  <div>
                    <h3 className={`font-body text-xl lg:text-2xl mb-1.5 ${isSelected ? 'text-[var(--color-bg)]' : 'text-white'}`}>
                      {svc.title}
                    </h3>
                    <p className="font-body sm:!text-lg text-[var(--color-muted)] leading-snug text-sm lg:text-base">
                      {svc.description}
                    </p>
                  </div>

                  <div className="flex justify-end mt-4">
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isSelected) onNext()
                      }}
                      animate={{
                        opacity: isSelected ? 1 : 0,
                        y: isSelected ? 0 : 6,
                        pointerEvents: isSelected ? 'auto' : 'none',
                      }}
                      transition={{ duration: 0.25 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl
                                 bg-[var(--color-cyan)] text-[var(--color-bg)]
                                 font-body text-sm lg:text-base font-semibold
                                 shadow-[0_0_16px_rgba(77,249,237,0.35)] cursor-pointer"
                    >
                      Proceed <ArrowRight size={15} strokeWidth={2.5} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </div>
  )
}