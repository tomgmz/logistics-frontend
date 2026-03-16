'use client';

import { useState, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { FAQS } from '@/app/lib/data';

/* ─── Accordion item ───────────────────────────────────────────────────────── */
function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-40px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.48, delay: index * 0.08 }}
      className={`rounded-[14px] border transition-all duration-300 overflow-hidden
        ${open
          ? 'border-[#4df9ed]/20 bg-[#0f0f0f] shadow-[0_0_30px_rgba(77,249,237,0.04)]'
          : 'border-white/[0.07] bg-transparent hover:border-white/[0.13] hover:bg-white/[0.01]'
        }`}
    >
      {/* Question row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-5 px-7 py-6 text-left
          cursor-pointer bg-transparent border-0 group"
      >
        {/* Index */}
        <span
          className={`font-body text-xs tracking-[0.18em] shrink-0 w-6 transition-colors duration-200
            ${open ? 'text-[#4df9ed]' : 'text-white/20 group-hover:text-white/35'}`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>

        {/* Question */}
        <span
          className={`font-body flex-1 text-lg md:text-xl lg:text-[1.375rem]
            tracking-wide transition-colors duration-200
            ${open ? 'text-white' : 'text-white/80 group-hover:text-white'}`}
        >
          {q}
        </span>

        {/* Toggle button */}
        <span
          className={`ml-4 shrink-0 w-9 h-9 rounded-full border
            flex items-center justify-center text-2xl leading-none
            transition-all duration-300
            ${open
              ? 'rotate-45 border-[#4df9ed]/60 text-[#4df9ed] bg-[#4df9ed]/[0.08]'
              : 'border-white/[0.15] text-white/25 group-hover:border-white/35 group-hover:text-white/55'
            }`}
        >
          +
        </span>
      </button>

      {/* Answer panel */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {/* Thin cyan rule */}
            <div className="mx-7 h-px bg-gradient-to-r from-transparent via-[#4df9ed]/15 to-transparent mb-5" />
            <p className="font-body text-[#818181] text-base md:text-lg
              leading-relaxed tracking-wide
              px-7 pb-7 pl-[4.75rem]">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Section ──────────────────────────────────────────────────────────────── */
export default function FaqSection() {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-80px' });

  return (
    <section id="faq" className="relative w-full bg-[#0a0a0a] py-28 overflow-hidden">

      {/* Background glow */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[48%] -translate-y-1/2
        w-[500px] h-[500px] pointer-events-none z-0">
        <div className="w-full h-full rounded-full bg-[#4df9ed]/[0.04] blur-[110px]" />
      </div>

      {/* Hairlines */}
      <div className="absolute top-0    inset-x-0 sep-x" />
      <div className="absolute bottom-0 inset-x-0 sep-x" />

      <div className="relative z-10 max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-16 lg:gap-28 items-start">

          {/* ── Left sticky sidebar ── */}
          <motion.div
            ref={ref}
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="lg:sticky lg:top-[108px]"
          >
            {/* Eyebrow */}
            <div className="pill-cyan mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4df9ed] animate-pulse" />
              Got Questions?
            </div>

            {/* Headline */}
            <h2 className="font-display text-white leading-[1.05] mb-6
              text-[2.6rem] md:text-[3.25rem] lg:text-[3.75rem]">
              FREQUENTLY
              <br />
              ASKED
              <br />
              QUESTIONS
            </h2>

            {/* Sub-copy */}
            <p className="font-body text-[#818181] text-base md:text-lg
              tracking-wide leading-relaxed mb-10 max-w-[280px]">
              Quick answers about our logistics services, coverage, and operations.
            </p>

            {/* FAQ count badge */}
            <div className="inline-flex items-center gap-3 mb-10
              px-5 py-3 rounded-[12px] bg-[#1b1b1b] border border-white/[0.07]">
              <span className="font-display text-[#4df9ed] text-2xl leading-none"
                style={{ fontStyle: 'normal' }}>
                {FAQS.length}
              </span>
              <span className="font-body text-[#818181] text-xs tracking-widest uppercase">
                Questions covered
              </span>
            </div>

            {/* CTA */}
            <div>
              <a
                href="#contact"
                className="inline-flex items-center gap-3 font-body text-sm tracking-widest
                  border border-white/[0.15] text-white/60 px-6 py-3.5 rounded-[12px]
                  hover:border-[#4df9ed]/40 hover:text-[#4df9ed]
                  transition-all duration-300 no-underline group"
              >
                Still have questions?
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </a>
            </div>
          </motion.div>

          {/* ── Right: accordion list ── */}
          <div className="flex flex-col gap-3">
            {FAQS.map((faq, i) => (
              <FaqItem key={i} q={faq.q} a={faq.a} index={i} />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
