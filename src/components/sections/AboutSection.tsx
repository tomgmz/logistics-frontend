'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import { ASSETS } from '@/lib/data';

export default function AboutSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref} id="about" className="relative w-full bg-[#1b1b1b] overflow-hidden">

      {/* One screen tall: the two vehicle cards share whatever height the text
          leaves, up to their usual 16:9-ish shape. */}
      <div className="md:hidden flex flex-col justify-center px-5 pt-24 pb-24 short:pt-20 short:pb-20
        gap-[clamp(12px,3svh,32px)] h-svh min-h-[520px]">

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="ff-sc text-white leading-relaxed tracking-wide"
        >
          Discover powerful tools for fast, transparent, and reliable logistics.
          Manage every step with ease and confidence.
        </motion.p>

        <div className="relative w-full flex-1 min-h-[90px] max-h-[56vw]">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="absolute inset-0 bg-white rounded-[20px] shadow-[0_4px_40px_rgba(0,0,0,0.4)]"
          />
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 w-full h-full"
          >
            <div className="relative w-full h-full" style={{ transform: 'scaleX(-1)' }}>
              <Image
                src={ASSETS.l300Van}
                alt="L300 Delivery Van"
                fill
                className="object-contain drop-shadow-xl"
                sizes="90vw"
              />
            </div>
          </motion.div>
        </div>

        <div className="relative w-full flex-1 min-h-[90px] max-h-[56vw]">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="absolute inset-0 bg-white rounded-[20px] shadow-[0_4px_40px_rgba(0,0,0,0.4)]"
          />
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 w-full h-full"
          >
            <div className="relative w-full h-full">
              <Image
                src={ASSETS.cargoTruck}
                alt="Cargo Truck"
                fill
                className="object-contain drop-shadow-xl"
                sizes="90vw"
              />
            </div>
          </motion.div>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="font-display-italic text-white leading-[0.92] tracking-tight text-center sm:text-start"
        >
          EFFORTLESS LOGISTICS, REAL RESULT
        </motion.h2>
      </div>

      {/* Exactly one screen tall; the vehicles are capped by the screen height
          too, so a short laptop never pushes them past the section. */}
      <div className="hidden md:block relative w-full max-w-[1600px] mx-auto h-svh min-h-[560px]">

        {/* The artwork sits on a stage that is centred in the screen below the
            76px fixed navbar (hence +38px), so the section reads as centred. */}
        <div className="absolute inset-x-0 top-[calc(50%+38px)] -translate-y-1/2 h-[72%]">

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.7 }}
          className="absolute left-[28%] top-[3%] w-[44%] h-[89.5%] bg-white rounded-[30px] shadow-[0_4px_60px_rgba(0,0,0,0.5)] z-0"
        />

        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.85, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-[10%] top-[1.5%] w-[min(46%,70svh)] max-w-[800px] z-10 animate-float"
        >
          <div className="relative w-full aspect-[16/9]" style={{ transform: 'scaleX(-1)' }}>
            <Image
              src={ASSETS.l300Van}
              alt="L300 Delivery Van"
              fill
              className="object-contain drop-shadow-2xl"
              sizes="46vw"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -100 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.85, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-[2%] bottom-0 w-[min(54%,80svh)] max-w-[920px] z-20"
        >
          <div className="relative w-full aspect-[16/9]">
            <Image
              src={ASSETS.cargoTruck}
              alt="Cargo Truck"
              fill
              className="object-contain drop-shadow-2xl"
              sizes="54vw"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-[2%] xl:right-[-7.5%] 2xl:right-[-9%] bottom-[12%] w-[48%] z-30"
          style={{ mixBlendMode: 'difference' }}
        >
          <h2 className="font-display-italic text-white leading-[0.92] tracking-tight text-center sm:text-start max-w-6">
            EFFORTLESS LOGISTICS, REAL RESULT
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.18 }}
          className="absolute left-12 lg:left-16 top-0 z-30 max-w-[calc(28%-5rem)] lg:max-w-[calc(28%-6rem)] min-w-[240px]"
        >
          <p className="ff-sc text-white leading-relaxed tracking-wide">
            Discover powerful tools for fast, transparent, and reliable logistics.
            Manage every step with ease and confidence.
          </p>
        </motion.div>
        </div>
      </div>

    </section>
  );
}