'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import { ASSETS } from '@/app/lib/data';

export default function AboutSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref} id="about" className="relative w-full bg-[#1b1b1b] overflow-hidden">

      <div className="md:hidden flex flex-col px-5 pt-16 pb-12 gap-8">

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="font-body text-white leading-relaxed tracking-wide"
        >
          Discover powerful tools for fast, transparent, and reliable logistics.
          Manage every step with ease and confidence.
        </motion.p>

        <div className="relative w-full">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="w-full bg-white rounded-[20px] shadow-[0_4px_40px_rgba(0,0,0,0.4)]"
            style={{ paddingBottom: '56%' }}
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

        <div className="relative w-full">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="w-full bg-white rounded-[20px] shadow-[0_4px_40px_rgba(0,0,0,0.4)]"
            style={{ paddingBottom: '56%' }}
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

      <div className="hidden md:block relative w-full max-w-[1600px] mx-auto px-12 lg:px-16 py-28 min-h-screen">

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.7 }}
          className="absolute left-[28%] top-[15%] w-[44%] h-[60%] bg-white rounded-[30px] shadow-[0_4px_60px_rgba(0,0,0,0.5)] z-0"
        />

        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.85, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-[10%] top-[14%] w-[46%] max-w-[800px] z-10 animate-float"
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
          className="absolute left-[2%] bottom-[20%] w-[54%] max-w-[920px] z-20"
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
          className="absolute right-[2%] bottom-[28%] w-[45%] max-w-[700px] z-30 pr-4"
          style={{ mixBlendMode: 'difference' }}
        >
          <h2 className="font-display-italic text-white leading-[0.92] tracking-tight text-left">
            EFFORTLESS LOGISTICS,
          </h2>
          <h2 className="font-display-italic text-white leading-[0.92] tracking-tight text-left">
            REAL RESULT
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.18 }}
          className="relative z-30 max-w-[26%] min-w-[240px] pt-4"
        >
          <p className="font-body text-white leading-relaxed tracking-wide">
            Discover powerful tools for fast, transparent, and reliable logistics.
            Manage every step with ease and confidence.
          </p>
        </motion.div>

        <div className="h-[500px] md:h-[620px]" />
      </div>

    </section>
  );
}