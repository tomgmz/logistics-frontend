'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { ASSETS } from '@/lib/data'

/**
 * Where a vendor driver's passkey setup link lands.
 *
 * This page is a doorway, not a form. A passkey has to be created by the phone's
 * own credential manager from inside the app, so there is nothing to fill in
 * here and — unlike the password reset page — no "continue here" fallback,
 * because there is no web equivalent of the thing being set up.
 *
 * The email points at this page rather than straight at
 * logistics-mobile://driver-setup for two reasons that the reset flow already
 * ran into: mail clients will not reliably follow a custom scheme, and the link
 * may well be opened on a phone that has not installed the app yet, or on a
 * desktop. Both of those end in a dead link without a real web page in between.
 *
 * Public by necessity — whoever opens this has no account session yet, which is
 * the whole point, so '/driver-setup' is in PUBLIC_PATHS in src/proxy.ts. The
 * one-time token in the query string is the only credential involved, and it is
 * never validated here: it is handed to the app, which validates it against the
 * API. Doing it here would mean burning an attempt on every stray page load.
 */

function appLink(token: string): string {
  return `logistics-mobile://driver-setup?token=${encodeURIComponent(token)}`
}

function IconKey() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4df9ed" strokeWidth="1.6">
      <circle cx="8" cy="15" r="4" />
      <line x1="10.85" y1="12.15" x2="19" y2="4" strokeLinecap="round" />
      <line x1="18" y1="5" x2="20" y2="7" strokeLinecap="round" />
      <line x1="15" y1="8" x2="17" y2="10" strokeLinecap="round" />
    </svg>
  )
}

export default function DriverSetupPage() {
  const params = useSearchParams()
  const token  = params.get('token') ?? ''

  const [attempted, setAttempted] = useState(false)

  // Try the handoff once, automatically. A driver who opened this on the right
  // phone should not have to read a page and press a second button; one who did
  // not will see nothing happen and still has the instructions below.
  useEffect(() => {
    if (!token || attempted) return
    setAttempted(true)
    window.location.href = appLink(token)
  }, [token, attempted])

  return (
    <div className="bg-[#0a0a0a] flex flex-col items-center justify-center px-5 py-10" style={{ minHeight: '100dvh' }}>
      <div className="mb-8">
        <Image src={ASSETS.logo} alt="8338 Logistics" width={140} height={40} priority />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[400px] sm:max-w-[460px] mx-auto"
      >
        <div
          className="glass rounded-3xl px-6 sm:px-9 py-8 flex flex-col items-center gap-5 text-center"
          style={{ boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(77,249,237,0.1)', border: '1px solid rgba(77,249,237,0.2)' }}
          >
            <IconKey />
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-spartan text-white text-lg sm:text-xl tracking-[0.15em] uppercase">
              Set up in the app
            </h1>
            <p className="text-white/40 text-[0.8rem] leading-relaxed">
              Your sign-in is set up in the 8338 Logistics app on your phone.
              There is no password — you will unlock the app with your
              fingerprint, face, or phone PIN.
            </p>
          </div>

          {token ? (
            <a
              href={appLink(token)}
              className="w-full rounded-xl py-3 font-spartan text-[0.8rem] tracking-[0.12em] uppercase text-[#062b28] transition-opacity hover:opacity-85"
              style={{ background: '#4df9ed' }}
            >
              Open the app
            </a>
          ) : (
            <p className="text-[#ef4444]/80 text-[0.78rem] leading-relaxed">
              This link is missing its setup code. Ask your dispatcher to send a
              new one.
            </p>
          )}

          <div className="w-full pt-4 mt-1 border-t border-white/8 flex flex-col gap-2 text-left">
            <p className="text-white/30 text-[0.72rem] leading-relaxed">
              <span className="text-white/50">Nothing happened?</span> The app may
              not be installed on this device yet. Install 8338 Logistics first,
              then open this link again on the phone you will use for deliveries.
            </p>
            <p className="text-white/25 text-[0.7rem] leading-relaxed">
              This link works once and expires in 72 hours. If it has expired,
              your dispatcher can send a new one.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
