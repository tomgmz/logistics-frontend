'use client'

import { motion } from 'framer-motion'
import { Bell, MessageCircle, Menu } from 'lucide-react'
import Image from 'next/image'
import { ASSETS } from '@/app/lib/data'

interface HeaderProps {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

export default function Header({ sidebarOpen, setSidebarOpen }: HeaderProps) {

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="h-[70px] lg:h-[80px] shrink-0 z-50 flex items-center justify-between
                 px-4 lg:px-6 border-b border-white/[0.07] bg-[var(--color-bg)]"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-white transition-colors"
        >
          <Menu size={20} />
        </button>
        <LogoMark />
      </div>

      <div className="flex items-center gap-2 lg:gap-3">

        {/* Chat */}
        <IconBtn>
          <MessageCircle size={16} className="text-[var(--color-muted)]" />
        </IconBtn>

        {/* Notifications */}
        <IconBtn>
          <Bell size={16} className="text-[var(--color-muted)]" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)]" />
        </IconBtn>

        {/* Avatar */}
        <motion.div
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-[var(--color-cyan)]
                     flex items-center justify-center cursor-pointer glow-cyan shrink-0"
        >
          <span className="font-card text-[var(--color-bg)] text-sm font-bold tracking-widest">C</span>
        </motion.div>
      </div>
    </motion.header>
  )
}

function IconBtn({ children }: { children: React.ReactNode }) {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      className="relative w-9 h-9 lg:w-10 lg:h-10 rounded-full glass
                 flex items-center justify-center
                 hover:border-[var(--color-cyan)]/30 transition-colors"
    >
      {children}
    </motion.button>
  )
}

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
        <Image
          src={ASSETS.logo}
          alt="8338 Logistics"
          width={140}
          height={40}
          className="object-contain w-24 sm:w-28 lg:w-[140px]"
         />
    </div>
  )
}