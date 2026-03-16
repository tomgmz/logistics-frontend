'use client';

import { useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/* ─── Constants ────────────────────────────────────────────────────────────── */
const ROLES = ['E-Commerce', 'FMCG', 'Shipper', 'Other'] as const;

const CONTACT_INFO = [
  {
    icon: '📞',
    label: 'Phone',
    value: '+63 9465 536 8975',
    href: 'tel:+639465536875',
  },
  {
    icon: '✉️',
    label: 'Email',
    value: '3883LogisticsServices\n@gmail.com',
    href: 'mailto:3883LogisticsServices@gmail.com',
  },
  {
    icon: '📍',
    label: 'Address',
    value: 'Blk. 8 Lot 8 Lynville Enclave,\nMamatid, City of Cabuyao, Laguna',
    href: undefined,
  },
] as const;

const HOURS = [
  { day: 'Mon – Fri', time: '8:00 AM – 6:00 PM' },
  { day: 'Saturday',  time: '8:00 AM – 12:00 PM' },
  { day: 'Sunday',    time: 'Emergency only'      },
] as const;

/* ─── Styled input field ───────────────────────────────────────────────────── */
function Field({
  label, type = 'text', placeholder,
}: {
  label: string; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="font-body text-white/35 text-[0.65rem]
        tracking-[0.22em] uppercase mb-2.5 block">
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full bg-[#141414] border border-white/[0.08] rounded-[10px]
          px-4 py-[14px] font-body text-white text-sm placeholder:text-white/20
          tracking-wide focus:outline-none focus:border-[#4df9ed]/35
          focus:bg-[#181818] transition-all duration-200"
      />
    </div>
  );
}

/* ─── Section + Footer ─────────────────────────────────────────────────────── */
export default function ContactSection() {
  const [selected, setSelected] = useState<string>('E-Commerce');
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-80px' });

  return (
    <>
      {/* ══════════════════════════════════════════════ Contact section ══ */}
      <section id="contact" className="relative w-full bg-[#111111] py-28 overflow-hidden">

        {/* Top hairline */}
        <div className="absolute top-0 inset-x-0 sep-x" />

        {/* Ambient glow — top center */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-24
          w-[800px] h-[500px] pointer-events-none">
          <div className="w-full h-full rounded-full bg-[#4df9ed]/[0.025] blur-[150px]" />
        </div>

        <div
          ref={ref}
          className="max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16 relative z-10"
        >

          {/* ── Section header ── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            {/* Eyebrow */}
            <div className="pill-cyan mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4df9ed] animate-pulse" />
              Get In Touch
            </div>

            {/* Big headline */}
            <h2 className="font-display text-white leading-[0.96]
              text-[2.8rem] md:text-[4.5rem] lg:text-[5.5rem] max-w-4xl mb-6">
              CONTACT OUR
              <br />
              LOGISTICS EXPERTS
            </h2>

            <p className="font-body text-[#818181] text-base md:text-xl
              max-w-3xl leading-relaxed tracking-wide">
              Be our partner by sending us a message. Our team is ready to assist
              with any logistics inquiry or service request.
              <span className="text-[#4df9ed]"> Fast, direct, and reliable.</span>
            </p>
          </motion.div>

          {/* ── Body grid ── */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.18 }}
            className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5"
          >

            {/* ════════════════════════════════════════ Form card ══ */}
            <div className="bg-[#0a0a0a] rounded-[20px] p-8 md:p-10
              border border-white/[0.07]">

              {/* Name row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <Field label="First Name" placeholder="Juan" />
                <Field label="Last Name"  placeholder="Dela Cruz" />
              </div>

              {/* Email + Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <Field label="Email" type="email" placeholder="juan@company.com" />
                <Field label="Phone" type="tel"   placeholder="+63 9XX XXX XXXX" />
              </div>

              {/* Role selector */}
              <div className="mb-5">
                <label className="font-body text-white/35 text-[0.65rem]
                  tracking-[0.22em] uppercase mb-3 block">
                  Your Role or Company Type
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {ROLES.map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelected(role)}
                      className={`inline-flex items-center gap-2 font-body text-sm
                        tracking-wide px-4 py-2.5 rounded-full border
                        transition-all duration-200 cursor-pointer
                        ${selected === role
                          ? 'border-[#4df9ed]/60 text-[#4df9ed] bg-[#4df9ed]/[0.08]'
                          : 'border-white/[0.1] text-white/40 hover:border-white/25 hover:text-white/65 bg-transparent'
                        }`}
                    >
                      {/* Radio circle */}
                      <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0
                        flex items-center justify-center transition-colors duration-200
                        ${selected === role ? 'border-[#4df9ed]' : 'border-white/25'}`}>
                        {selected === role && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4df9ed] block" />
                        )}
                      </span>
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message textarea */}
              <div className="mb-8">
                <label className="font-body text-white/35 text-[0.65rem]
                  tracking-[0.22em] uppercase mb-2.5 block">
                  Message
                </label>
                <textarea
                  rows={5}
                  placeholder="Tell us about your logistics needs, volumes, routes, or any questions…"
                  className="w-full bg-[#141414] border border-white/[0.08] rounded-[10px]
                    px-4 py-[14px] font-body text-white text-sm
                    placeholder:text-white/20 tracking-wide
                    focus:outline-none focus:border-[#4df9ed]/35 focus:bg-[#181818]
                    transition-all duration-200 resize-none"
                />
              </div>

              {/* Submit */}
              <button
                type="button"
                className="group relative inline-flex items-center gap-3
                  font-body text-[0.9rem] tracking-[0.12em]
                  border border-white/20 text-white
                  px-10 py-4 rounded-[15px] overflow-hidden
                  hover:border-[#4df9ed]/50 hover:text-[#4df9ed]
                  transition-all duration-300 cursor-pointer"
              >
                {/* Hover fill */}
                <span className="absolute inset-0 opacity-0 group-hover:opacity-100
                  transition-opacity duration-300 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at 50% 130%, rgba(77,249,237,0.07) 0%, transparent 65%)' }}
                />
                <span className="relative z-10">Submit Message</span>
                <span className="relative z-10 transition-transform duration-300
                  group-hover:translate-x-1 text-base">
                  →
                </span>
              </button>
            </div>

            {/* ══════════════════════════════════ Info card ══ */}
            <div className="bg-[#0a0a0a] rounded-[20px] border border-white/[0.07]
              flex flex-col overflow-hidden">

              {/* Card top band */}
              <div className="p-8 pb-7 border-b border-white/[0.07]">
                <div className="w-10 h-10 rounded-[10px] bg-[#4df9ed]/[0.07]
                  border border-[#4df9ed]/15 flex items-center justify-center
                  text-lg mb-4">
                  💬
                </div>
                <h3 className="font-body text-white text-xl font-bold tracking-wider mb-1.5">
                  Contact Details
                </h3>
                <p className="font-body text-[#818181] text-sm tracking-wide leading-relaxed">
                  For direct support or partnership inquiries.
                </p>
              </div>

              {/* Contact info rows */}
              <div className="p-8 flex flex-col gap-6 border-b border-white/[0.07]">
                {CONTACT_INFO.map(item => (
                  <div key={item.label} className="flex items-start gap-4 group">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-[9px] bg-[#4df9ed]/[0.06]
                      border border-[#4df9ed]/12 flex items-center justify-center
                      text-sm shrink-0 mt-0.5
                      group-hover:bg-[#4df9ed]/[0.11] group-hover:border-[#4df9ed]/25
                      transition-all duration-200">
                      {item.icon}
                    </div>

                    <div>
                      <p className="font-body text-white/30 text-[0.58rem]
                        tracking-[0.24em] uppercase mb-1">
                        {item.label}
                      </p>
                      {item.href ? (
                        <a
                          href={item.href}
                          className="font-body text-white text-sm tracking-wide
                            leading-relaxed whitespace-pre-line break-all
                            hover:text-[#4df9ed] transition-colors duration-200
                            no-underline"
                        >
                          {item.value}
                        </a>
                      ) : (
                        <p className="font-body text-white text-sm tracking-wide
                          leading-relaxed whitespace-pre-line">
                          {item.value}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Business hours */}
              <div className="p-8 flex flex-col gap-3">
                <p className="font-body text-white/25 text-[0.58rem]
                  tracking-[0.24em] uppercase mb-1">
                  Business Hours
                </p>
                {HOURS.map(({ day, time }) => (
                  <div key={day} className="flex justify-between items-center">
                    <span className="font-body text-[#818181] text-xs tracking-wide">
                      {day}
                    </span>
                    <span className="font-body text-white/55 text-xs tracking-wide">
                      {time}
                    </span>
                  </div>
                ))}
              </div>

              {/* Live status indicator */}
              <div className="px-8 pb-8 mt-auto">
                <div className="flex items-center gap-2.5 px-4 py-3
                  rounded-[10px] bg-[#1b1b1b] border border-white/[0.06]">
                  <span className="w-2 h-2 rounded-full bg-[#3af626] shrink-0 animate-pulse" />
                  <span className="font-body text-[#818181] text-xs tracking-wide">
                    Team online · avg. 15 min response
                  </span>
                </div>
              </div>
            </div>

          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════ Footer ══ */}
      <footer className="w-full bg-[#0a0a0a] border-t border-white/[0.06]">
        {/* Top footer content */}
        <div className="max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16 py-12">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-8 items-start">

            {/* Brand blurb */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-white/[0.07] border border-white/[0.1]
                  flex items-center justify-center text-sm">
                  📦
                </div>
                <span className="font-body text-white text-sm tracking-[0.12em]
                  uppercase font-bold">
                  8338 Logistics
                </span>
              </div>
              <p className="font-body text-[#818181] text-sm tracking-wide
                leading-relaxed max-w-[260px]">
                Premium logistics. Industrial precision.<br />
                Serving nationwide Philippines.
              </p>
            </div>

            {/* Links col */}
            <div>
              <p className="font-body text-white/25 text-[0.6rem] tracking-[0.22em]
                uppercase mb-4">
                Company
              </p>
              <div className="flex flex-col gap-2.5">
                {['Home', 'About', 'Services', 'Metrics', 'FAQ', 'Contact'].map(item => (
                  <a
                    key={item}
                    href={`#${item.toLowerCase()}`}
                    className="font-body text-[#818181] text-sm tracking-wide
                      hover:text-white transition-colors duration-200 no-underline"
                  >
                    {item}
                  </a>
                ))}
              </div>
            </div>

            {/* Legal col */}
            <div>
              <p className="font-body text-white/25 text-[0.6rem] tracking-[0.22em]
                uppercase mb-4">
                Legal
              </p>
              <div className="flex flex-col gap-2.5">
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map(item => (
                  <a
                    key={item}
                    href="#"
                    className="font-body text-[#818181] text-sm tracking-wide
                      hover:text-white transition-colors duration-200 no-underline"
                  >
                    {item}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.05]">
          <div className="max-w-[1600px] mx-auto px-6 md:px-12 lg:px-16 py-5
            flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="font-body text-[#818181]/60 text-xs tracking-wider">
              © 2026 8338 Logistics Services. All rights reserved.
            </p>
            <p className="font-body text-[#818181]/40 text-xs tracking-wider">
              Mamatid, City of Cabuyao, Laguna, Philippines
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
