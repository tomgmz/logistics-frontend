'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView, animate } from 'framer-motion';
import { METRICS, ASSETS } from '@/app/lib/data';
import Image from 'next/image';

function AnimatedValue({ raw }: { raw: string }) {
  const [display, setDisplay] = useState(raw);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-40px' });

  useEffect(() => {
    if (!inView) return;
    const numMatch = raw.match(/^([\d.]+)(.*)/);
    if (!numMatch) return;

    const num        = parseFloat(numMatch[1]);
    const suffix     = numMatch[2];
    const hasDecimal = numMatch[1].includes('.');

    const ctrl = animate(0, num, {
      duration: 1.8,
      ease: 'easeOut',
      onUpdate(v) {
        const formatted = hasDecimal ? v.toFixed(1) : Math.floor(v).toString();
        setDisplay(formatted + suffix);
      },
    });
    return () => ctrl.stop();
  }, [inView, raw]);

  return <span ref={ref}>{display}</span>;
}

function StatCard({ value, label, index }: { value: string; label: string; index: number }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-40px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-[18px] border border-white/10 p-4 sm:p-6
        flex flex-col justify-center items-center text-center
        bg-white cursor-default overflow-hidden"
    >
      <span className="font-eurostile text-[2.1rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[2.5rem] text-[#0a0a0a] leading-none mb-1 sm:mb-2">
        <AnimatedValue raw={value} />
      </span>

      <span className="font-alegreya text-[#555]
        tracking-wider leading-snug uppercase">
        {label}
      </span>
    </motion.div>
  );
}

export default function MetricsSection() {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-80px' });

  return (
    <section id="metrics" className="relative w-full bg-[#0a0a0a] py-16 sm:py-20 md:py-28 overflow-hidden">

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      <div className="max-w-[1600px] mx-auto px-5 sm:px-8 md:px-12 lg:px-16 relative z-10">

        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-4 sm:mb-6"
        >
          <h2 className="font-display-italic text-white leading-[1.05]
            text-[1.5rem] xs:text-[1.5rem] sm:text-[2.4rem] md:text-[3rem] lg:text-[5rem]">
            <span className="text-[#f97316] font-display-italic">METRICS</span>{' '}
            THAT MOVE
            <br />
            YOUR BUSINESS
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.12 }}
          className="font-body text-[#818181]
            text-center max-w-2xl mx-auto mb-10 sm:mb-14 md:mb-16 tracking-wide leading-relaxed"
        >
          See how our logistics solutions deliver speed, reliability, and satisfaction for every shipment.
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4
          auto-rows-[120px] sm:auto-rows-[160px]">

          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.06 }}
            className="relative rounded-[18px] overflow-hidden
              sm:row-span-2 col-span-1 cursor-default"
          >
            <Image
              src={ASSETS.metricsBg ?? ASSETS.heroContainers}
              alt="Logistics network"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[#0a0a0a]/50" />
          </motion.div>

          {METRICS.map((m, i) => (
            <StatCard key={m.label} value={m.value} label={m.label} index={i + 1} />
          ))}

        </div>
      </div>
    </section>
  );
}