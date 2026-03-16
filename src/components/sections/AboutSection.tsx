'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import { ASSETS } from '@/app/lib/data';

export default function AboutSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="about" className="relative w-full min-h-screen bg-[#1b1b1b] overflow-hidden">
      <div ref={ref} className="relative w-full max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16 py-28 min-h-screen">

        {/* White rounded card — centered, sits behind trucks */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.7 }}
          className="absolute left-[28%] top-[15%] w-[44%] h-[60%] bg-white rounded-[30px] shadow-[0_4px_60px_rgba(0,0,0,0.5)] z-0"
        />

      {/* L300 Van — top right, overlapping card */}
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
            sizes="(max-width: 768px) 90vw, 46vw"
          />
        </div>
      </motion.div>

        {/* Cargo Truck — bottom left, overlapping card */}
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
              sizes="(max-width: 768px) 90vw, 54vw"
            />
          </div>
        </motion.div>

        {/* Headline — bottom right, large, mix-blend-difference */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-[-4%] bottom-[28%] w-[48%] z-30"
          style={{ mixBlendMode: 'difference' }}
        >
          <h2 className="font-display-italic text-white text-[3rem] md:text-[4rem] lg:text-[5rem] leading-[0.92] tracking-tight">
            EFFORTLESS LOGISTICS, REAL RESULT
          </h2>
        </motion.div>

        {/* Body text — top left */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.18 }}
          className="relative z-30 max-w-[26%] min-w-[240px] pt-4"
        >
          <p className="font-body text-white text-lg md:text-xl lg:text-[1.6rem] leading-relaxed tracking-wide">
            Discover powerful tools for fast, transparent, and reliable logistics.
            Manage every step with ease and confidence.
          </p>
        </motion.div>

        {/* Spacer */}
        <div className="h-[500px] md:h-[620px]" />
      </div>
    </section>
  );
}