'use client';

import { useState, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { FAQS } from '@/app/lib/data';

function FaqItem({ 
  q, 
  a, 
  index, 
  isOpen, 
  onToggle 
}: { 
  q: string; 
  a: string; 
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-40px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.48, delay: index * 0.08 }}
      className={`rounded-[14px] border transition-all duration-300 overflow-hidden
        ${isOpen
          ? 'border-white/20 bg-[#1a1a1a]'
          : 'border-white/[0.10] bg-[#141414] hover:border-white/20'
        }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-5 sm:px-7 py-5 sm:py-6 text-left
          cursor-pointer bg-transparent border-0 group"
      >
        <span
          className={`font-'Alegreysa Sans SC, sans-serif'flex-1 text-sm sm:text-base md:text-lg lg:text-[1.1rem]
            tracking-wide transition-colors duration-200
            ${isOpen ? 'text-white' : 'text-white/80 group-hover:text-white'}`}
        >
          {q}
        </span>

        <span
          className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full border
            flex items-center justify-center text-xl leading-none
            transition-all duration-300
            ${isOpen
              ? 'rotate-45 border-white/40 text-white'
              : 'border-white/20 text-white/50 group-hover:border-white/40 group-hover:text-white/80'
            }`}
        >
          +
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mx-5 sm:mx-7 h-px bg-white/[0.07] mb-4" />
            <p className="font-'Alegreysa Sans SC, sans-serif' text-[#818181] text-sm sm:text-base
              leading-relaxed tracking-wide px-5 sm:px-7 pb-5 sm:pb-6">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-80px' });

  return (
    <section id="faq" className="relative w-full bg-[#0a0a0a] py-16 sm:py-20 md:py-28 overflow-hidden">

      <div className="absolute left-1/2 -translate-x-1/2 top-[40%] -translate-y-1/2
        w-[500px] h-[500px] pointer-events-none z-0">
        <div className="w-full h-full rounded-full bg-[#f5c518]/[0.03] blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-[860px] mx-auto px-5 sm:px-8 md:px-12">

        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-4 sm:mb-5"
        >
          <h2 className="font-display-italic xs:!text-[2rem] text-white leading-[1.0]">
            FREQUENTLY ASKED
            <br />
            <span className="font-eurostile xs:!text-[2rem] text-[#f5c518]">QUESTIONS</span>
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-'Alegreysa Sans SC, sans-serif' text-[#818181] text-sm sm:text-sm md:text-base lg:text-2xl
            text-center tracking-widest uppercase mb-10 sm:mb-14"
        >
          Find quick answers to common question about our efficient logistics
        </motion.p>

        <div className="flex flex-col gap-3">
          {FAQS.map((faq, i) => (
            <FaqItem 
              key={i} 
              q={faq.q} 
              a={faq.a} 
              index={i}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>

      </div>
    </section>
  );
}