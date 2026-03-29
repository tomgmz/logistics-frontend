'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { ASSETS } from '@/app/lib/data';

export default function HeroSection() {
  return (
    <section id="hero" className="relative w-full min-h-screen bg-[#0a0a0a] overflow-hidden flex items-center">

      <div className="absolute inset-0 z-0">
        <Image
          src={ASSETS.heroContainers}
          alt=""
          fill
          className="object-cover opacity-50 pointer-events-none select-none"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/90 via-[#0a0a0a]/60 to-[#0a0a0a]/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-[1600px] mx-auto px-5 sm:px-8 md:px-12 lg:px-[60px] pt-28 sm:pt-32 pb-16 sm:pb-24 text-center sm:text-left">

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-body text-[#9f9c9c] mb-2 tracking-wide justify-center sm:justify-start"
        >
          Premium logistics. Industrial precision.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-baseline gap-2 sm:gap-3 md:gap-5 justify-center sm:justify-start"
        >
          <span className="font-display-italic text-white leading-none">
            MINIMIZE
          </span>
          <span className="font-display-italic text-stroke leading-none [color:#1b1b1b]">
            COSTS.
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-baseline gap-2 sm:gap-3 md:gap-5 mb-5 sm:mb-7 justify-center sm:justify-start"
        >
          <span className="font-display-italic text-white leading-none">
            TRANSPORT
          </span>
          <span className="font-display-italic text-[#4df9ed] leading-none">
            GOODS.
          </span>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="font-body text-white max-w-[90%] sm:max-w-xl md:max-w-2xl lg:max-w-3xl leading-relaxed mb-8 sm:mb-10 tracking-wide justify-self-center sm:justify-self-start"
        >
          Book, track, and manage deliveries in one place. Real-time updates,
          seamless booking, and efficient support for all your logistics needs.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.65 }}
          className="flex flex-wrap gap-3 sm:gap-4 justify-center sm:justify-start"
        >
          <a
            href="#contact"
            className="font-body glass border border-white/30 text-white px-5 sm:px-8 py-3 sm:py-4 rounded-[12px] sm:rounded-[15px]
             text-sm sm:text-sm md:text-base lg:text-xl tracking-wider
              hover:bg-white/[0.15] hover:border-white/60 transition-all duration-300 no-underline inline-block"
          >
            Be our partner
          </a>
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent z-0 pointer-events-none" />
    </section>
  );
}