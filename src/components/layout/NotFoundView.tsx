'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ASSETS } from '@/lib/data'
import { ROLE_ROUTES } from '@/constants/roles'
import { useAuthStore } from '@/lib/store/auth.store'
import SiteFooter from './SiteFooter'

/**
 * The app-wide 404, rendered by src/app/not-found.tsx for any URL that matches
 * no page — including unknown paths inside a portal.
 *
 * A signed-in user is offered their own dashboard rather than the marketing
 * page, since that is almost always where they meant to be.
 */
export default function NotFoundView() {
  const router      = useRouter()
  const user        = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  const portal = hasHydrated && user ? ROLE_ROUTES[user.role] : undefined
  const home   = portal ?? '/'

  const goBack = () => {
    // Opened in a fresh tab there is nothing to go back to.
    if (window.history.length > 1) router.back()
    else router.replace(home)
  }

  return (
    <div
      className="bg-[#0a0a0a] flex flex-col"
      style={{
        minHeight: '100dvh',
        backgroundImage: `
          radial-gradient(ellipse 60% 50% at 20% 10%, rgba(77,249,237,0.04) 0%, transparent 60%),
          radial-gradient(ellipse 40% 40% at 80% 80%, rgba(77,249,237,0.03) 0%, transparent 50%)
        `,
      }}
    >
      <div className="sep-x-cyan" />

      <header className="px-4 sm:px-10 md:px-16 py-4 sm:py-5 flex items-center justify-between">
        <Link href={home} aria-label={portal ? 'Dashboard' : 'Home'}>
          <Image
            src={ASSETS.logo}
            alt="8338 Logistics"
            width={140}
            height={40}
            className="object-contain w-24 sm:w-28 lg:w-[140px]"
          />
        </Link>
        <span className="font-spartan text-[0.6rem] sm:text-[0.68rem] tracking-[0.2em] uppercase text-white/20">
          Error 404
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-8 sm:py-12">
        <div className="w-full max-w-[520px] mx-auto flex flex-col items-center text-center gap-7">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative w-full flex flex-col items-center"
          >
            <span
              aria-hidden
              className="ff-sc leading-none select-none text-transparent text-[6.5rem] sm:text-[9rem] tracking-[0.08em]"
              style={{ WebkitTextStroke: '1px rgba(77,249,237,0.35)' }}
            >
              404
            </span>

            {/* A truck that drives off the end of the road. */}
            <div className="relative w-full max-w-[360px] h-10 mt-1 overflow-hidden">
              <div
                className="absolute left-0 right-0 bottom-2 h-px"
                style={{
                  background:
                    'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 14px, transparent 14px 26px)',
                }}
              />
              <motion.div
                className="absolute bottom-2.5 text-[#4df9ed]"
                initial={{ left: '-15%' }}
                animate={{ left: '110%' }}
                transition={{ duration: 4.5, ease: 'linear', repeat: Infinity, repeatDelay: 0.8 }}
              >
                <IconTruck />
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.45 }}
            className="flex flex-col gap-2"
          >
            <h1 className="ff-sc text-white text-[1.15rem] sm:text-[1.35rem] tracking-[0.12em] uppercase leading-tight">
              Wrong Turn
            </h1>
            <p className="font-spartan text-white/45 text-[0.82rem] sm:text-[0.88rem] leading-relaxed max-w-[420px]">
              We couldn&apos;t find the page you were looking for. The link may be
              mistyped, or the page may have moved or been removed.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.45 }}
            className="w-full max-w-[360px] flex flex-col sm:flex-row gap-3"
          >
            <Link
              href={home}
              className="font-spartan flex-1 py-3 tracking-[0.18em] uppercase text-[0.76rem] rounded-xl
                         transition-all duration-200 hover:bg-[#e0e0e0] no-underline text-center"
              style={{ background: '#ffffff', color: '#0a0a0a' }}
            >
              {portal ? 'Go To Dashboard' : 'Go To Home Page'}
            </Link>
            <button
              type="button"
              onClick={goBack}
              className="glass-surface font-spartan flex-1 py-3 tracking-[0.18em] uppercase text-[0.72rem] rounded-xl
                         text-white/60 hover:text-white transition-colors duration-200"
            >
              Go Back
            </button>
          </motion.div>
        </div>
      </main>

      <SiteFooter variant="compact" />
    </div>
  )
}

function IconTruck() {
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="1" y="2" width="20" height="13" rx="1.5" />
      <path d="M21 6h6.5l4.5 5v4h-11z" />
      <circle cx="7" cy="17.5" r="2.5" fill="#0a0a0a" />
      <circle cx="26" cy="17.5" r="2.5" fill="#0a0a0a" />
    </svg>
  )
}
