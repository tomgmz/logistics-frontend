'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { ASSETS } from '@/app/lib/data';

export default function HeroSection() {
  return (
    <section id="hero" className="relative w-full min-h-screen bg-[#0a0a0a] overflow-hidden flex items-center">

      {/* BG: shipping containers photo */}
      <div className="absolute inset-0 z-0">
        <Image 
          src={ASSETS.heroContainers} 
          alt="" 
          fill
          className="object-cover opacity-50 pointer-events-none select-none" 
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/80 via-[#0a0a0a]/40 to-[#0a0a0a]/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
      </div>

      {/* Glowing ellipse */}
      <div className="absolute left-[39%] top-[18%] w-[340px] h-[340px] z-0 pointer-events-none hidden lg:block">
        <Image 
          src={ASSETS.heroEllipse} 
          alt="" 
          fill
          className="object-contain opacity-55" 
        />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-[1600px] mx-auto px-6 md:px-12 lg:px-[60px] pt-36 pb-24">

        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-body text-[#9f9c9c] text-lg md:text-2xl lg:text-[2.375rem] mb-2 tracking-wide"
        >
          Premium logistics. Industrial precision.
        </motion.p>

        {/* Headline row 1 */}
        <motion.div
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-baseline gap-3 md:gap-5"
        >
          <span className="font-display-italic text-white text-[3.2rem] sm:text-[5rem] md:text-[6rem] lg:text-[6.25rem] leading-none">
            MINIMIZE
          </span>
          <span className="font-display-italic text-stroke text-[3.2rem] sm:text-[5rem] md:text-[6rem] lg:text-[6.25rem] leading-none [color:#1b1b1b]">
            COSTS.
          </span>
        </motion.div>

        {/* Headline row 2 */}
        <motion.div
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-baseline gap-3 md:gap-5 mb-7"
        >
          <span className="font-display-italic text-white text-[3.2rem] sm:text-[5rem] md:text-[6rem] lg:text-[6.25rem] leading-none">
            TRANSPORT
          </span>
          <span className="font-display-italic text-[#4df9ed] text-[3.2rem] sm:text-[5rem] md:text-[6rem] lg:text-[6.25rem] leading-none">
            GOODS.
          </span>
        </motion.div>

        {/* Body copy */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="font-body text-white text-base md:text-xl lg:text-[2.375rem] max-w-3xl leading-relaxed mb-10 tracking-wide"
        >
          Book, track, and manage deliveries in one place. Real-time updates,
          seamless booking, and efficient support for all your logistics needs.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.65 }}
          className="flex flex-wrap gap-4"
        >
          <a
            href="#contact"
            className="font-body glass border border-white/30 text-white px-8 py-4 rounded-[15px]
              text-base md:text-xl lg:text-[2rem] tracking-wider
              hover:bg-white/[0.15] hover:border-white/60 transition-all duration-300 no-underline inline-block"
          >
            Be our partner
          </a>
          <button
            className="font-body bg-white text-[#0a0a0a] px-8 py-4 rounded-[15px]
              text-base md:text-xl lg:text-[2rem] tracking-wider font-semibold
              hover:bg-white/90 transition-all duration-300 cursor-pointer"
          >
            sign in
          </button>
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent z-0 pointer-events-none" />
    </section>
  );
}