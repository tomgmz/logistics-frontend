'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import { BRANDS } from '@/app/lib/data';

/* ─── Single logo card ─────────────────────────────────────────────────────── */
function LogoCard({ brand }: { brand: typeof BRANDS[number] }) {
  return (
    <div
      className="flex items-center justify-center shrink-0 mx-5
        px-7 py-4 rounded-[14px] border border-white/[0.07]
        bg-white/[0.025] hover:bg-white/[0.07] hover:border-[#4df9ed]/25
        transition-all duration-300 group cursor-default"
      style={{ minWidth: 140 }}
    >
      {/* Wrapper sized by brand.className; Image fills it via fill */}
      <div className={`relative ${brand.className}`}>
        <Image
          src={brand.src}
          alt={brand.alt}
          fill
          className="object-contain grayscale brightness-[1.4] opacity-55
            group-hover:grayscale-0 group-hover:opacity-100 group-hover:brightness-100
            transition-all duration-400"
          sizes="140px"
        />
      </div>
    </div>
  );
}

/* ─── Marquee row (CSS-driven, no Framer loop) ─────────────────────────────── */
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

/* ─── Section ──────────────────────────────────────────────────────────────── */
export default function BrandsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative w-full bg-[#0a0a0a] overflow-hidden py-28">

      {/* Top / bottom hairlines */}
      <div className="absolute top-0    inset-x-0 sep-x" />
      <div className="absolute bottom-0 inset-x-0 sep-x" />

      {/* Right-side ambient glow */}
      <div className="absolute right-[-100px] top-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none">
        <div className="w-full h-full rounded-full bg-[#4df9ed]/[0.04] blur-[130px]" />
      </div>

      <div ref={ref} className="max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-14 lg:gap-20 items-center">

          {/* ── Left col: headline + stats ── */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Eyebrow */}
            <div className="pill-cyan mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4df9ed] animate-pulse" />
              Trusted Partners
            </div>

            {/* Headline */}
            <h2 className="font-display-italic text-white leading-[1.0] mb-6
              text-[2.6rem] md:text-[4rem] lg:text-[5rem]">
              BRANDS THAT{' '}
              <span className="text-[#3af626]">MOVE</span>
              <br />
              WITH US
            </h2>

            {/* Sub-copy */}
            <p className="font-body text-[#818181] text-lg md:text-xl leading-relaxed
              tracking-wide max-w-[340px] mb-10">
              Trusted by the country&apos;s leading e-commerce and retail brands to
              move nationwide with unmatched precision.
            </p>

            {/* Divider + Stats row */}
            <div className="pt-8 border-t border-white/[0.07]
              grid grid-cols-3 gap-4">
              {[
                { val: '5+',   label: 'Brand Partners' },
                { val: '100%', label: 'Satisfaction'   },
                { val: '24/7', label: 'Operations'     },
              ].map(({ val, label }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.3 + i * 0.09, duration: 0.5 }}
                >
                  <p className="font-display text-white text-3xl md:text-4xl
                    leading-none mb-1 not-italic"
                    style={{ fontStyle: 'normal' }}>
                    {val}
                  </p>
                  <p className="font-body text-[#818181] text-[0.62rem]
                    tracking-[0.15em] uppercase leading-snug">
                    {label}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* ── Right col: marquee tracks ── */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden"
          >
            {/* Edge fade masks */}
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