'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import { BRANDS } from '@/lib/data';

function LogoCard({ brand }: { brand: typeof BRANDS[number] }) {
  return (
    <div
      className="flex items-center justify-center shrink-0 mx-5
        px-7 py-4 rounded-[14px] border border-white/[0.07]
        bg-white/[0.025] hover:bg-white/[0.07] hover:border-[#4df9ed]/25
        transition-all duration-300 group cursor-default"
      style={{ minWidth: 140 }}
    >
      <div className={`relative ${brand.className}`}>
        <Image
          src={brand.src}
          alt={brand.alt}
          width={140}
          height={80}
          className="object-contain transition-all duration-400"
          sizes="140px"
        />
      </div>
    </div>
  );
}

function MarqueeRow({ reverse = false }: { reverse?: boolean }) {
  // 4× duplication ensures seamless infinite loop at any screen width
  const items = [...BRANDS, ...BRANDS, ...BRANDS, ...BRANDS];
  return (
    <div className="overflow-hidden w-full py-1.5">
      <div className={reverse ? 'marquee-track-reverse' : 'marquee-track'}>
        {items.map((brand, i) => (
          <LogoCard key={`${brand.alt}-${i}`} brand={brand} />
        ))}
      </div>
    </div>
  );
}

export default function BrandsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden flex flex-col items-center justify-center">

      <div className="absolute top-0    inset-x-0 sep-x" />
      <div className="absolute bottom-0 inset-x-0 sep-x" />

      <div className="absolute right-[-100px] top-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none">
        <div className="w-full h-full rounded-full bg-[#4df9ed]/[0.04] blur-[130px]" />
      </div>

      <div ref={ref} className="max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-14 lg:gap-20 items-center">

          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className='text-center sm:text-start'
          >
            <h2 className="font-display-italic text-white leading-[1.0] mb-6">
              BRANDS THAT{' '}
              <span className="text-[#3af626]">MOVE</span>
              <br />
              WITH US
            </h2>

            <p className="font-body text-[#818181] leading-relaxed
              tracking-wide max-w-[340px] mb-10">
              Move nationwide with unmatched precision
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden"
          >
            <div className="absolute left-0 top-0 bottom-0 w-20 z-10 pointer-events-none
              bg-gradient-to-r from-[#0a0a0a] to-transparent" />
            <div className="absolute right-0 top-0 bottom-0 w-20 z-10 pointer-events-none
              bg-gradient-to-l from-[#0a0a0a] to-transparent" />

            <div className="flex flex-col gap-4">
              <MarqueeRow />
              <MarqueeRow reverse />
              <MarqueeRow />
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}