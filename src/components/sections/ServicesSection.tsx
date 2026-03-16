'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Image from 'next/image';
import { SERVICES, CYCLING_WORDS, ASSETS } from '@/app/lib/data';

// Color palette for cycling words
const WORD_COLORS = [
  '#4df9ed', // Cyan
  '#3af626', // Green
  '#a855f7', // Purple
  '#ef4444', // Red
  '#f97316', // Orange
  '#84cc16', // Yellow-green
];

function CyclingWord() {
  const [wordIndex, setWordIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  const currentWord = CYCLING_WORDS[wordIndex];
  const currentColor = WORD_COLORS[wordIndex % WORD_COLORS.length];

  useEffect(() => {
    const typeSpeed = isDeleting ? 50 : 100; // Faster when deleting
    const pauseTime = isDeleting ? 500 : 2000; // Pause before deleting

    const timer = setTimeout(() => {
      if (!isDeleting) {
        // Typing phase
        if (displayText.length < currentWord.length) {
          setDisplayText(currentWord.substring(0, displayText.length + 1));
        } else {
          // Finished typing, wait then start deleting
          setTimeout(() => setIsDeleting(true), pauseTime);
        }
      } else {
        // Deleting phase
        if (displayText.length > 0) {
          setDisplayText(displayText.substring(0, displayText.length - 1));
        } else {
          // Finished deleting, move to next word
          setIsDeleting(false);
          setWordIndex((prev) => (prev + 1) % CYCLING_WORDS.length);
        }
      }
    }, typeSpeed);

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, currentWord, wordIndex]);

  return (
    <span 
      className="inline-block align-bottom font-display-italic"
      style={{ 
        minWidth: '3ch',
        color: currentColor,
      }}
    >
      {displayText}
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
      className="group relative rounded-[15px] overflow-hidden cursor-pointer"
      style={{ height: 317 }}
    >
      <div className="absolute inset-0 h-[78%]">
        <Image
          src={img}
          alt={label}
          fill
          className="object-cover rounded-[15px]
            transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      </div>
      {/* Gradient fade */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      {/* Cyan border on hover */}
      <div className="absolute inset-0 rounded-[15px] border-2 border-transparent
        group-hover:border-[#4df9ed]/40 transition-all duration-300 pointer-events-none z-10" />
      {/* Label */}
      <p
        className="absolute bottom-4 left-3 right-3 text-white text-[1.375rem] leading-snug tracking-wide z-10 font-card"
      >
        {label}
      </p>
    </motion.div>
  );
}

export default function ServicesSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="services" className="relative w-full bg-[#1b1b1b] overflow-hidden py-24">

      {/* Ellipse glow */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[28%] w-[340px] h-[340px] pointer-events-none z-0">
        <Image 
          src={ASSETS.sectionEllipse} 
          alt="" 
          fill
          className="object-contain opacity-35" 
        />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16">

        {/* Headline */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display-italic text-white text-[3.2rem] md:text-[5rem] lg:text-[6.25rem] leading-[1.05]">
            LOGISTICS
            <br />
            BUILT FOR
            <br />
            <CyclingWord />
          </h2>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {SERVICES.map((svc, i) => (
            <ServiceCard key={`${svc.label}-${i}`} img={svc.img} label={svc.label} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}