'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

export default function ContactSection() {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const [role, setRole] = useState('fmcg');

  return (
    <>
      <section id="contact" className="relative w-full bg-[#0a0a0a] py-16 sm:py-20 md:py-28 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />

        <div ref={ref} className="relative z-10 max-w-[1100px] mx-auto px-5 sm:px-8 md:px-12">

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-4 sm:mb-5"
          >
            <h2 className="font-display-italic text-white leading-[1.0]">
              CONTACT OUR
              <br />
              <span className="font-display-italic text-[#4df9ed]">LOGISTICS EXPERTS</span>
            </h2>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-'Alegreysa Sans SC, sans-serif' text-[#818181]
              text-center tracking-widest uppercase mb-10 sm:mb-14 max-w-2xl mx-auto leading-relaxed"
          >
            Be our partner by sending us a message. Our team is here to assist you with any logistics
            inquiries or service requests. Fast, direct, and reliable.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.18 }}
            className="rounded-[20px] border border-white/[0.10] bg-[#111]
              grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-0 overflow-hidden"
          >

            <div className="p-6 sm:p-8 md:p-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="font-'Alegreysa Sans SC, sans-serif' text-white/60 text-[0.65rem] tracking-widest uppercase mb-1.5 block">
                    First Name
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#1a1a1a] border border-white/[0.10] rounded-[8px]
                      px-3 py-2.5 text-white text-sm font-'Alegreysa Sans SC, sans-serif'
                      focus:outline-none focus:border-[#4df9ed]/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="font-'Alegreysa Sans SC, sans-serif' text-white/60 text-[0.65rem] tracking-widest uppercase mb-1.5 block">
                    Last Name
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#1a1a1a] border border-white/[0.10] rounded-[8px]
                      px-3 py-2.5 text-white text-sm font-'Alegreysa Sans SC, sans-serif'
                      focus:outline-none focus:border-[#4df9ed]/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="font-'Alegreysa Sans SC, sans-serif' text-white/60 text-[0.65rem] tracking-widest uppercase mb-1.5 block">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full bg-[#1a1a1a] border border-white/[0.10] rounded-[8px]
                      px-3 py-2.5 text-white text-sm font-'Alegreysa Sans SC, sans-serif'
                      focus:outline-none focus:border-[#4df9ed]/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="font-'Alegreysa Sans SC, sans-serif' text-white/60 text-[0.65rem] tracking-widest uppercase mb-1.5 block">
                    Phone
                  </label>
                  <input
                    type="tel"
                    className="w-full bg-[#1a1a1a] border border-white/[0.10] rounded-[8px]
                      px-3 py-2.5 text-white text-sm font-'Alegreysa Sans SC, sans-serif'
                      focus:outline-none focus:border-[#4df9ed]/40 transition-colors"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="font-'Alegreysa Sans SC, sans-serif' text-white/60 text-[0.65rem] tracking-widest uppercase mb-2 block">
                  Your Role or Company
                </label>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {['fmcg', 'shipper', 'other'].map((r) => (
                    <label key={r} className="flex items-center gap-2 cursor-pointer group">
                      <div
                        onClick={() => setRole(r)}
                        className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 cursor-pointer
                          ${role === r
                            ? 'border-[#4df9ed] bg-[#4df9ed]'
                            : 'border-white/30 group-hover:border-white/60'
                          }`}
                      />
                      <span className="font-'Alegreysa Sans SC, sans-serif' text-white/70 text-xs tracking-wider uppercase">
                        {r}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="font-'Alegreysa Sans SC, sans-serif' text-white/60 text-[0.65rem] tracking-widest uppercase mb-1.5 block">
                  Message
                </label>
                <textarea
                  rows={4}
                  className="w-full bg-[#1a1a1a] border border-white/[0.10] rounded-[8px]
                    px-3 py-2.5 text-white text-sm font-'Alegreysa Sans SC, sans-serif' resize-none
                    focus:outline-none focus:border-[#4df9ed]/40 transition-colors"
                />
              </div>

              <button
                className="font-'Alegreysa Sans SC, sans-serif' bg-white text-[#0a0a0a] px-7 py-2.5 rounded-[8px]
                  text-sm tracking-wider font-semibold
                  hover:bg-white/90 transition-all duration-300 cursor-pointer w-full sm:w-auto"
              >
                Submit
              </button>
            </div>

            <div className="border-t lg:border-t-0 lg:border-l border-white/[0.08]
              p-6 sm:p-8 md:p-10 bg-[#0f0f0f]">
              <h3 className="font-'Alegreysa Sans SC, sans-serif' text-white text-sm tracking-widest uppercase mb-1">
                Contact Details
              </h3>
              <p className="font-'Alegreysa Sans SC, sans-serif' text-white/40 text-xs tracking-wide mb-8 leading-relaxed">
                For direct support or partnership inquiries.
              </p>

              <div className="flex flex-col gap-5">
                <div className="flex items-start gap-3">
                  <span className="text-[#4df9ed] text-base mt-0.5">📞</span>
                  <span className="font-'Alegreysa Sans SC, sans-serif' text-white/70 text-sm leading-relaxed">
                    +63 9685 536 8975
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-[#4df9ed] text-base mt-0.5">✉️</span>
                  <span className="font-'Alegreysa Sans SC, sans-serif' text-white/70 text-sm leading-relaxed break-all">
                    8338LogisticsServices@gmail.com
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-[#4df9ed] text-base mt-0.5">📍</span>
                  <span className="font-'Alegreysa Sans SC, sans-serif' text-white/70 text-sm leading-relaxed">
                    Blk. 6 Lot 8 Lynville Enclave,
                    Mamatid, City of Cabuyao, Laguna
                  </span>
                </div>
              </div>
            </div>

          </motion.div>
        </div>
      </section>

      <footer className="w-full bg-[#0a0a0a] border-t border-white/[0.07]">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 md:px-12 py-5
          flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-'Alegreysa Sans SC, sans-serif' text-white/30 text-xs tracking-widest uppercase">
            8338 Logistic Services
          </span>
          <span className="font-'Alegreysa Sans SC, sans-serif' text-white/30 text-xs tracking-widest uppercase text-center">
            © 2026 Logistics Services. All Rights Reserved.
          </span>
        </div>
      </footer>
    </>
  );
}