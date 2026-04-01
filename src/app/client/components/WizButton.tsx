import { motion } from 'framer-motion'

export default function WizBtn({ onClick, children, variant, disabled }: {
  onClick: () => void; children: React.ReactNode; variant: 'next' | 'back'; disabled?: boolean
}) {
  return (
    <motion.button onClick={onClick}
      whileHover={!disabled ? { scale: 1.04 } : {}}
      whileTap={!disabled  ? { scale: 0.96 } : {}}
      className={`flex items-center justify-center gap-2 px-6 lg:px-8 py-3 rounded-xl font-body booking-text text-base lg:text-lg transition-all duration-300
        flex-1 sm:flex-none
        ${disabled
          ? 'glass text-white/20 border border-white/[0.06] cursor-not-allowed pointer-events-none'
          : variant === 'next'
            ? 'glass text-white border border-white/20 hover:border-[var(--color-cyan)]/40 cursor-pointer'
            : 'bg-transparent border border-white/10 hover:text-white hover:border-white/20 cursor-pointer'
        }`}>
      {children}
    </motion.button>
  )
}