'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { ActivePage } from './ClientDasboard'
import { ASSETS } from '../../../constants/icon'
import Image from 'next/image'

const SIDEBAR_COLLAPSED = 56
const SIDEBAR_EXPANDED  = 260

interface SidebarProps {
  activePage: ActivePage
  setActivePage: (p: ActivePage) => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

const NAV: { id: ActivePage; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Image src={ASSETS.svcOverview} alt='overview' width={24} height={24}/>  },
  { id: 'booking',  label: 'Booking',  icon: <Image src={ASSETS.svcBooking} alt='booking' width={24} height={24}/> },
  { id: 'tracking', label: 'Tracking', icon: <Image src={ASSETS.svcTracking} alt='tracking' width={24} height={24}/> },
  { id: 'billing',  label: 'Billing',  icon: <Image src={ASSETS.svcBilling} alt='billing' width={24} height={24}/> },
  { id: 'history',  label: 'History',  icon: <Image src={ASSETS.svcHistory} alt='history' width={24} height={24}/> },
]

export default function Sidebar({
  activePage,
  setActivePage,
  sidebarOpen,
  setSidebarOpen,
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/60 z-30"
          />
        )}
      </AnimatePresence>

      <div
        className="relative shrink-0 z-40
                   max-lg:fixed max-lg:left-0 max-lg:top-[70px] max-lg:h-[calc(100vh-70px)]"
      >
        {/* Sidebar panel */}
        <motion.aside
          initial={false}
          animate={{
            width: sidebarOpen
              ? SIDEBAR_EXPANDED
              : typeof window !== 'undefined' && window.innerWidth < 1024
                ? 0
                : SIDEBAR_COLLAPSED,
          }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
          className="h-full border-r border-white/[0.07] bg-[var(--color-bg)] overflow-hidden"
        >
          <div
            style={{ width: SIDEBAR_EXPANDED }}
            className="h-full flex flex-col py-5"
          >
            {/*  Company row  */}
            <div className="flex items-center gap-3 px-4 mb-7 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-[var(--color-cyan)] glow-cyan
                              flex items-center justify-center shrink-0">
                <span className="font-card text-[var(--color-bg)] text-xs font-bold">A</span>
              </div>
              <motion.span
                animate={{ opacity: sidebarOpen ? 1 : 0, x: sidebarOpen ? 0 : -8 }}
                transition={{ duration: 0.2 }}
                className="font-body text-white text-[17px] whitespace-nowrap overflow-hidden"
              >
                Airspeed Corp.
              </motion.span>
            </div>

            <div className="sep-x-cyan mx-4 mb-4" />

            {/*  Nav items  */}
            <nav className="flex-1 px-2 space-y-0.5">
              {NAV.map((item, i) => (
                <NavItem
                  key={item.id}
                  item={item}
                  isActive={activePage === item.id}
                  index={i}
                  expanded={sidebarOpen}
                  onClick={() => {
                    setActivePage(item.id)
                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                      setSidebarOpen(false)
                    }
                  }}
                />
              ))}
            </nav>

            {/*  Bottom items  */}
            <div className="px-2 space-y-0.5 pt-4 border-t border-white/[0.07]">
              <NavItem
                item={{ id: 'settings', label: 'Settings', icon: <Settings size={17} /> }}
                isActive={activePage === 'settings'}
                index={0}
                expanded={sidebarOpen}
                onClick={() => {
                  setActivePage('settings')
                  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                    setSidebarOpen(false)
                  }
                }}
              />

              <motion.button
                whileHover={{ x: sidebarOpen ? 2 : 0 }}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center gap-3 rounded-xl
                           text-[var(--color-muted)] hover:text-red-400
                           transition-colors group py-3 px-2"
              >
                <span className="shrink-0 flex items-center justify-center"
                      style={{ width: SIDEBAR_COLLAPSED - 32 }}>
                  <LogOut
                    size={17}
                    className="group-hover:text-red-400 transition-colors"
                  />
                </span>
                <motion.span
                  animate={{ opacity: sidebarOpen ? 1 : 0, width: sidebarOpen ? 'auto' : 0 }}
                  transition={{ duration: 0.2 }}
                  className="font-body text-[15px] whitespace-nowrap overflow-hidden"
                >
                  Sign out
                </motion.span>
              </motion.button>
            </div>
          </div>
        </motion.aside>

        {/* Toggle button */}
        <motion.button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.9 }}
          className="absolute top-17 -right-3.5 items-center justify-center
           w-7 h-7 rounded-full glass border border-white/10
           hover:border-[var(--color-cyan)]/40 transition-colors
           hidden sm:flex"
        >
          {sidebarOpen
            ? <PanelLeftClose size={12} className="text-[var(--color-muted)]" />
            : <PanelLeft      size={12} className="text-[var(--color-muted)]" />}
        </motion.button>
      </div>
    </>
  )
}

interface NavItemProps {
  item: { id: string; label: string; icon: React.ReactNode }
  isActive: boolean
  index: number
  expanded: boolean
  onClick: () => void
}

function NavItem({ item, isActive, index, expanded, onClick }: NavItemProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      onClick={onClick}
      whileHover={{ x: expanded ? 3 : 0 }}
      whileTap={{ scale: 0.97 }}
      title={!expanded ? item.label : undefined}
      className={`relative w-full flex items-center gap-3 rounded-xl text-left
                  transition-colors group py-3 px-2
                  ${isActive
                    ? 'text-[var(--color-cyan)]'
                    : 'text-[var(--color-muted)] hover:text-white'
                  }`}
    >
      {isActive && (
        <motion.div
          layoutId="activeNav"
          className="absolute inset-0 rounded-xl glass-surface
                     border border-[var(--color-cyan)]/20"
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        />
      )}

      <span
        className="relative z-10 shrink-0 flex items-center justify-center"
        style={{ width: SIDEBAR_COLLAPSED - 32 }}
      >
        {item.icon}
      </span>

      <motion.span
        animate={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 font-body text-[15px] whitespace-nowrap overflow-hidden"
      >
        {item.label}
      </motion.span>

      <AnimatePresence>
        {isActive && expanded && (
          <motion.span
            key="dot"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            layoutId="activeDot"
            className="relative z-10 ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)] shrink-0"
          />
        )}
      </AnimatePresence>
    </motion.button>
  )
}