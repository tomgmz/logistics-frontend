'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView, animate } from 'framer-motion';
import { METRICS } from '@/app/lib/data';

/* ─── Animated number counter ─────────────────────────────────────────────── */
function AnimatedValue({ raw }: { raw: string }) {
  // Default to `raw` so non-numeric strings (e.g. "24/7") render immediately
  // without needing a setState call inside the effect.
  const [display, setDisplay] = useState(raw);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-40px' });

  useEffect(() => {
    if (!inView) return;

    const numMatch = raw.match(/^([\d.]+)(.*)/);
    // Non-numeric (e.g. "24/7") — already shown via initial state, nothing to animate.
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

/* ─── Stat card ────────────────────────────────────────────────────────────── */
function StatCard({ value, label, index }: { value: string; label: string; index: number }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-40px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.55, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="group relative rounded-[15px] border border-white/[0.07] p-8
        flex flex-col justify-end bg-[#0f0f0f]
        hover:border-[#4df9ed]/30 hover:bg-[#121212]
        transition-all duration-300 cursor-default overflow-hidden"
    >
      {/* Hover radial glow */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100
        transition-opacity duration-500 rounded-[15px]"
        style={{ background: 'radial-gradient(ellipse at 25% 75%, rgba(77,249,237,0.06) 0%, transparent 60%)' }}
      />

      {/* Top-right accent dot */}
      <div className="absolute top-5 right-5 w-1.5 h-1.5 rounded-full bg-[#4df9ed]
        opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Value */}
      <span className="font-display text-white text-5xl md:text-6xl leading-none mb-3
        relative z-10 group-hover:text-[#4df9ed] transition-colors duration-300">
        <AnimatedValue raw={value} />
      </span>

      {/* Label */}
      <span className="font-body text-[#818181] text-sm md:text-[0.9rem]
        tracking-wider leading-snug relative z-10">
        {label}
      </span>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-[15px]
        opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'linear-gradient(90deg, transparent, #4df9ed55, transparent)' }}
      />
    </motion.div>
  );
}

/* ─── Section ──────────────────────────────────────────────────────────────── */
export default function MetricsSection() {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-80px' });

  return (
    <section id="metrics" className="relative w-full bg-[#0a0a0a] py-28 overflow-hidden">

      {/* Subtle grid lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[1]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      {/* Central ambient glow */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none
        w-[700px] h-[700px]">
        <div className="w-full h-full rounded-full bg-[#4df9ed]/[0.03] blur-[160px]" />
      </div>

      {/* Top hairline */}
      <div className="absolute top-0 inset-x-0 sep-x" />

      <div className="max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16 relative z-10">

        {/* ── Header row ── */}
        <div className="flex flex-col lg:flex-row lg:items-end
          justify-between gap-6 mb-16">

          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            {/* Eyebrow */}
            <div className="pill-cyan mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4df9ed] animate-pulse" />
              Our Performance
            </div>

            <h2 className="font-display text-white leading-[1.0]
              text-[2.6rem] md:text-[4rem] lg:text-[5rem]">
              METRICS THAT MOVE
              <br />
              YOUR BUSINESS
            </h2>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="font-body text-[#818181] text-base md:text-lg
              max-w-sm tracking-wide leading-relaxed lg:text-right lg:pb-2 shrink-0"
          >
            Speed, reliability, satisfaction —<br />
            every number is earned, not estimated.
          </motion.p>
        </div>

        {/* ── Bento grid: featured card + 6 stat cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4
          gap-4 auto-rows-[200px]">

          {/* Featured "hero" card — spans 2 rows on desktop */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.06 }}
            className="group relative rounded-[15px] border border-white/[0.07] p-9
              flex flex-col justify-end bg-[#1b1b1b]
              hover:border-[#4df9ed]/20 transition-all duration-300
              md:row-span-2 col-span-1 overflow-hidden cursor-default"
          >
            {/* Glow */}
            <div className="absolute inset-0 rounded-[15px] pointer-events-none
              opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: 'radial-gradient(ellipse at 20% 80%, rgba(77,249,237,0.05) 0%, transparent 60%)' }}
            />

            {/* Corner icon */}
            <div className="absolute top-7 right-7 w-11 h-11 rounded-[10px]
              bg-[#4df9ed]/[0.07] border border-[#4df9ed]/15
              flex items-center justify-center text-xl
              group-hover:bg-[#4df9ed]/[0.12] group-hover:border-[#4df9ed]/30
              transition-all duration-300">
              📊
            </div>

            {/* Tag */}
            <p className="font-body text-[#818181] text-[0.65rem]
              tracking-[0.22em] uppercase mb-4 relative z-10">
              Our Performance
            </p>

            {/* Headline */}
            <h3 className="font-display text-white text-2xl md:text-3xl
              leading-tight mb-4 relative z-10">
              NUMBERS THAT SPEAK FOR THEMSELVES
            </h3>

            {/* Body */}
            <p className="font-body text-[#818181] text-sm leading-relaxed relative z-10">
              From on-time delivery to client satisfaction —
              every metric reflects our commitment to excellence.
            </p>

            {/* Bottom accent */}
            <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-[15px]
              opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{ background: 'linear-gradient(90deg, transparent, #4df9ed66, transparent)' }}
            />
          </motion.div>

          {/* 6 stat cards */}
          {METRICS.map((m, i) => (
            <StatCard key={m.label} value={m.value} label={m.label} index={i + 1} />
          ))}

        </div>
      </div>
    </section>
  );
}
