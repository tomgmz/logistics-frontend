'use client'

import Image from 'next/image'
import { motion, Variants } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { ServiceType } from './BookingWizard'

const IMG_ECOMMERCE = 'https://www.figma.com/api/mcp/asset/9022a322-6a21-484f-8326-c1c634eead08'
const IMG_FMCG      = 'https://www.figma.com/api/mcp/asset/bf1359c1-5d25-4185-9f76-e3cb79e7d5ff'

interface Props {
  selected: ServiceType
  setSelected: (s: ServiceType) => void
  onNext: () => void
}

const SERVICES: {
  id: ServiceType
  title: string
  description: string
  sub: string
  image: string
}[] = [
  {
    id: 'ecommerce',
    title: 'ECOMMERCE',
    description: 'One pick-up point with multiple delivery addresses',
    sub: '',
    image: IMG_ECOMMERCE,
  },
  {
    id: 'fmcg',
    title: 'FMCG',
    description: 'Pick-up point only, for fast-moving consumer goods',
    sub: '',
    image: IMG_FMCG,
  },
]

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
  const canProceed = !!selected

  return (
    <div className="flex flex-col h-full p-5 lg:p-10 items-center">

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="mb-7 lg:mb-10 self-start"
      >
        <motion.h2
          variants={fadeUp}
          className="font-body text-white text-2xl lg:text-4xl mb-1 lg:mb-2"
        >
          SELECT SERVICE TYPE
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="font-['Alegreya Sans,sans-serif'] sm:!text-lg text-[var(--color-muted)]"
        >
          Choose the delivery method for this booking
        </motion.p>
      </motion.div>

      <div className="flex-1 flex items-center justify-center w-full">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 gap-7 lg:gap-20 w-full max-w-6xl"
        >
          {SERVICES.map((svc) => {
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
                  <Image
                    src={svc.image}
                    alt={svc.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>

                {/* Body */}
                <div className="flex-1 p-4 lg:p-5 flex flex-col justify-between">
                  <div>
                    <h3
                      className={`font-body text-xl lg:text-2xl mb-1.5
                        ${isSelected ? 'text-[var(--color-bg)]' : 'text-white'}`}
                    >
                      {svc.title}
                    </h3>
                    <p className="font-body sm:!text-lg text-[var(--color-muted)] leading-snug text-sm lg:text-base">
                      {svc.description}
                    </p>
                  </div>

                  {/* Check */}
                  <div className="flex justify-end mt-4">
                    <motion.div
                      animate={{
                        backgroundColor: isSelected ? '#4df9ed' : 'rgba(255,255,255,0.12)',
                        scale: isSelected ? 1.1 : 1,
                      }}
                      transition={{ duration: 0.25 }}
                      className="w-9 h-9 lg:w-10 lg:h-10 rounded-full flex items-center justify-center"
                    >
                      <Check
                        size={16}
                        strokeWidth={3}
                        className={isSelected ? 'text-[var(--color-bg)]' : 'text-white'}
                      />
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>

      {/*  NEXT button  */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
        className="flex justify-end mt-7 lg:mt-10 self-end"
      >
        <NextBtn disabled={!canProceed} onClick={() => canProceed && onNext()}>
          NEXT <ArrowRight size={17} />
        </NextBtn>
      </motion.div>
    </div>
  )
}

function NextBtn({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={!disabled ? { scale: 1.04 } : {}}
      whileTap={!disabled ? { scale: 0.96 } : {}}
      className={`flex items-center gap-2 px-7 py-3 rounded-xl font-body
                  transition-all duration-300 text-base lg:text-lg
                  ${disabled
                    ? 'glass text-white/20 border border-white/[0.06] cursor-not-allowed'
                    : 'glass text-white border border-white/20 hover:border-[var(--color-cyan)]/40 cursor-pointer'
                  }`}
    >
      {children}
    </motion.button>
  )
}