'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useScroll, useSpring } from 'framer-motion';
import { ASSETS } from '@/lib/data';
import Image from 'next/image';
import SignInModal from '../SignInModal';

const NAV_LINKS = [
  { label: 'Home',     href: '#hero' },
  { label: 'About',    href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'Metrics',  href: '#metrics' },
  { label: 'FAQ',      href: '#faq' },
  { label: 'Contact',  href: '#contact' },
];

export default function Navbar() {
  const [scrolled,    setScrolled]    = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(0);
  const [signInOpen,  setSignInOpen]  = useState(false);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    const ids = NAV_LINKS.map(l => l.href.slice(1));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const idx = ids.indexOf(e.target.id);
            if (idx !== -1) setActiveIdx(idx);
          }
        });
      },
      { threshold: 0.35 }
    );
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <motion.div
        style={{ scaleX, transformOrigin: '0%' }}
        className="fixed top-0 left-0 right-0 h-[2px] z-[100] bg-[#4df9ed]"
      />

      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500
          ${scrolled ? 'glass-dark shadow-[0_1px_0_rgba(255,255,255,0.05)]' : 'bg-transparent'}`}
      >
        <div className="max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16
          h-[76px] flex items-center relative">

          {/* Logo — left-anchored */}
          <a href="#hero" className="flex items-center no-underline shrink-0">
            <Image
              src={ASSETS.logo}
              alt="8338 Logistics"
              width={140}
              height={40}
              className="object-contain"
            />
          </a>

          {/* Nav links — absolutely centered */}
          <ul className="hidden md:flex items-center gap-1 list-none m-0 p-0
            absolute left-1/2 -translate-x-1/2">
            {NAV_LINKS.map((item, i) => (
              <motion.li
                key={item.label}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.055, duration: 0.4 }}
              >
                <a
                  href={item.href}
                  className={`text-[0.84rem] tracking-wider px-4 py-2.5 rounded-xl
                    no-underline transition-all duration-200 block relative
                    ${activeIdx === i
                      ? 'text-[#4df9ed] bg-[#4df9ed]/[0.07]'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                    }`}
                >
                  {item.label}
                  {activeIdx === i && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-xl bg-[#4df9ed]/[0.07] -z-10"
                      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                    />
                  )}
                </a>
              </motion.li>
            ))}
          </ul>

          {/* Right side — Sign In button + mobile hamburger */}
          <div className="ml-auto flex items-center gap-3">
            {/* Sign In button — desktop */}
            <motion.button
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              onClick={() => setSignInOpen(true)}
              className="hidden md:flex items-center gap-2 text-[0.84rem] tracking-wider
                px-4 py-2 rounded-xl border border-[#4df9ed]/30 text-[#4df9ed]
                hover:bg-[#4df9ed]/[0.08] hover:border-[#4df9ed]/60
                transition-all duration-200 cursor-pointer bg-transparent"
            >
              Sign In
            </motion.button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden flex flex-col gap-[5px] items-end w-10 h-10 justify-center
                hover:opacity-70 transition-opacity"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <span className="w-6 h-[2px] bg-white block rounded-full" />
              <span className="w-4 h-[2px] bg-white block rounded-full" />
              <span className="w-6 h-[2px] bg-white block rounded-full" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
              onClick={closeMenu}
            />

            <motion.div
              key="drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed top-0 right-0 bottom-0 z-[70] w-[300px]
                bg-[#0a0a0a] border-l border-white/[0.07] flex flex-col"
            >
              <div className="flex justify-between items-center p-6 pb-5
                border-b border-white/[0.07]">
                <a href="#hero" className="flex items-center no-underline shrink-0">
                  <Image
                    src={ASSETS.logo}
                    alt="8338 Logistics"
                    width={140}
                    height={40}
                    className="object-contain"
                  />
                </a>
                <button
                  onClick={closeMenu}
                  className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center
                    text-white/50 hover:text-white hover:border-white/25
                    transition-all duration-200 text-lg leading-none"
                  aria-label="Close menu"
                >
                  ✕
                </button>
              </div>

              <ul className="list-none m-0 p-4 flex flex-col gap-1 flex-1 overflow-y-auto">
                {NAV_LINKS.map((item, i) => (
                  <motion.li
                    key={item.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 + 0.1 }}
                  >
                    <a
                      href={item.href}
                      onClick={closeMenu}
                      className={`text-[1rem] py-3 px-4 rounded-xl
                        transition-colors tracking-wider no-underline block
                        ${activeIdx === i
                          ? 'bg-[#4df9ed]/[0.08] text-[#4df9ed]'
                          : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
                        }`}
                    >
                      <span className="text-white/20 text-xs mr-3" style={{ fontFamily: 'monospace' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {item.label}
                    </a>
                  </motion.li>
                ))}
              </ul>

              {/* Sign In inside mobile drawer */}
              <div className="p-4 border-t border-white/[0.07]">
                <button
                  onClick={() => { closeMenu(); setTimeout(() => setSignInOpen(true), 300); }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                    border border-[#4df9ed]/30 text-[#4df9ed] text-[0.9rem] tracking-wider
                    hover:bg-[#4df9ed]/[0.08] transition-all duration-200 cursor-pointer bg-transparent"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  Sign In
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Sign In Modal */}
      <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}