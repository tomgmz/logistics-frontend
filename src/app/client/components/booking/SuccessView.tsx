import  { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'

export default function SuccessView({
  bookingReference,
  onNewBooking,
}: {
  bookingReference: string | null
  onNewBooking: () => void
}) {
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

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <h2 className="font-body booking-text text-white text-3xl lg:text-5xl font-bold mb-3 uppercase tracking-widest">
          Booking Confirmed!
        </h2>
        <p className="font-body booking-text text-[var(--color-muted)] text-base lg:text-xl">
          Your shipment has been scheduled successfully.
        </p>
        {bookingReference && (
          <p className="font-body booking-text text-[var(--color-cyan)] text-sm lg:text-lg mt-2">
            Reference Number: {bookingReference}
          </p>
        )}
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onNewBooking}
        className="mt-2 px-8 py-3 rounded-xl font-body booking-text font-bold uppercase tracking-widest
                   text-base lg:text-lg text-[var(--color-bg)] bg-[var(--color-cyan)]
                   cursor-pointer hover:opacity-90 transition-opacity"
      >
        New Booking
      </motion.button>
    </motion.div>
  )
}