'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { ASSETS } from '@/lib/data';

/**
 * Hero background: the night expressway scene (highwayScene.ts, loaded lazily
 * so three.js stays out of the main bundle). Without WebGL the original photo
 * is shown instead. A quiet hint teaches "hold to accelerate" and goes away
 * once used.
 */
export default function HeroHighway() {
  const wrap = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'pending' | 'webgl' | 'fallback'>('pending');
  const [hint, setHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const el = wrap.current;
    const section = el?.closest('section');
    if (!el || !section) return;

    import('./highwayScene')
      .then((m) => {
        if (cancelled) return;
        if (!m.supportsWebGL()) return setMode('fallback');
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          const s = m.createHighway({
            container: el,
            eventTarget: section,
            reducedMotion: reduced,
            onAccelerate: () => setHint(false),
          });
          dispose = s.dispose;
          setMode('webgl');
          if (!reduced) hintTimer = setTimeout(() => !cancelled && setHint(true), 2600);
        } catch {
          setMode('fallback');
        }
      })
      .catch(() => !cancelled && setMode('fallback'));

    return () => {
      cancelled = true;
      if (hintTimer) clearTimeout(hintTimer);
      dispose?.();
    };
  }, []);

  return (
    <div aria-hidden="true" className="absolute inset-0 select-none">
      <div
        ref={wrap}
        className={`absolute inset-0 transition-opacity duration-[1400ms] ease-out ${mode === 'webgl' ? 'opacity-100' : 'opacity-0'}`}
      />

      {mode === 'fallback' && (
        <Image src={ASSETS.heroContainers} alt="" fill className="object-cover opacity-50 pointer-events-none" priority />
      )}

      {/* Keeps the copy readable: an even dim on phones, a left-side fade from sm up. */}
      <div className="absolute inset-0 pointer-events-none bg-[#0a0a0a]/45 sm:bg-transparent sm:bg-gradient-to-r sm:from-[#0a0a0a]/90 sm:via-[#0a0a0a]/45 sm:via-45% sm:to-transparent" />
      <div className="absolute inset-x-0 top-0 h-32 pointer-events-none bg-gradient-to-b from-[#0a0a0a]/80 to-transparent" />

      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-2.5 whitespace-nowrap"
          >
            <span className="relative grid h-6 w-6 place-items-center rounded-full border border-white/25">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              <span className="absolute inset-0 rounded-full border border-white/40 motion-safe:animate-ping" />
            </span>
            <span className="ff-sc !text-[12.5px] tracking-wide text-white/55">Press and hold to accelerate</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
