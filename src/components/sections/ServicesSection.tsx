'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Image from 'next/image';
import { ASSETS, SERVICES, CYCLING_WORDS } from '@/lib/data';

const WORD_COLORS = [
  '#4df9ed',
  '#3af626',
  '#8a38f5',
  '#f62626',
  '#ff7a30',
  '#3af626',
];

function CyclingWord() {
  const [wordIndex, setWordIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const currentWord = CYCLING_WORDS[wordIndex];
  const currentColor = WORD_COLORS[wordIndex % WORD_COLORS.length];

  useEffect(() => {
    const typeSpeed = isDeleting ? 50 : 100;
    const pauseTime = isDeleting ? 500 : 2000;

    const timer = setTimeout(() => {
      if (!isDeleting) {
        if (displayText.length < currentWord.length) {
          setDisplayText(currentWord.substring(0, displayText.length + 1));
        } else {
          setTimeout(() => setIsDeleting(true), pauseTime);
        }
      } else {
        if (displayText.length > 0) {
          setDisplayText(displayText.substring(0, displayText.length - 1));
        } else {
          setIsDeleting(false);
          setWordIndex((prev) => (prev + 1) % CYCLING_WORDS.length);
        }
      }
    }, typeSpeed);

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, currentWord, wordIndex]);

  return (
    <span
      className="inline-block align-bottom max-w-full"
      style={{ color: currentColor }}
    >
      <span className="inline-block break-words">
        {displayText}
      </span>
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        className="inline-block ml-1"
      >
        |
      </motion.span>
    </span>
  );
}

function ServiceCard({ img, label, index }: { img: string; label: string; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="group relative rounded-[15px] overflow-hidden cursor-pointer
        h-[clamp(120px,22svh,220px)] sm:h-[clamp(150px,24svh,290px)] xl:h-[clamp(180px,38svh,317px)]"
    >
      <div className="absolute inset-0 h-[78%]">
        <Image
          src={img}
          alt={label}
          fill
          className="object-cover rounded-[15px] transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute inset-0 rounded-[15px] border-2 border-transparent
        group-hover:border-[#4df9ed]/40 transition-all duration-300 pointer-events-none z-10" />
      <p className="absolute bottom-4 left-3 right-3 text-white text-[0.8rem] sm:text-lg md:text-[1.375rem] leading-snug tracking-wide z-10 font-card">
        {label}
      </p>
    </motion.div>
  );
}

export default function ServicesSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="services" className="relative w-full min-h-svh bg-[#1b1b1b] overflow-hidden pt-[clamp(5.5rem,12svh,7rem)] pb-[clamp(2rem,8svh,6rem)] flex items-center justify-center">
      {/* White background glow from the Figma, centred behind the heading and cards. */}
      <div className="absolute left-1/2 top-[46.4%] -translate-x-1/2 -translate-y-1/2 size-[340px] pointer-events-none z-0">
        <div className="absolute inset-[-205.88%]">
          <Image src={ASSETS.sectionEllipse} alt="" width={1740} height={1740} className="block max-w-none size-full" />
        </div>
      </div>
      <div className="relative z-10 max-w-[1600px] w-full mx-auto px-5 sm:px-8 md:px-12 lg:px-16">

        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-[clamp(1.5rem,5svh,4rem)]"
        >
          <h2 className="font-display-italic text-white leading-[1.05]">
            LOGISTICS
            <br />
            BUILT FOR
            <br />
            <CyclingWord />
          </h2>
        </motion.div>

        {/* Cards: two columns even on phones, so all four fit on one screen */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5 text-center sm:text-start">
          {SERVICES.map((svc, i) => (
            <ServiceCard key={`${svc.label}-${i}`} img={svc.img} label={svc.label} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}