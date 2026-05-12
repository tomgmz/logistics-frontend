'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, PanelLeftClose, PanelLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { logout } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/store/auth.store'
import ReusableModal from '@/components/layout/ReusableModal'

const SIDEBAR_COLLAPSED = 56
const SIDEBAR_EXPANDED = 260

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface ReusableSidebarProps {
  navItems: NavItem[]
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  onNavigate?: () => void
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

export default function ReusableSidebar({
  navItems,
  sidebarOpen,
  setSidebarOpen,
  onNavigate,
}: ReusableSidebarProps) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const user = useAuthStore((state) => state.user)
  const clearUser = useAuthStore((state) => state.clearUser)
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
    } finally {
      const userId = useAuthStore.getState().user?.user_id
      clearUser()
      if (userId) {
        const ch = new BroadcastChannel(`auth_sync_${userId}`)
        ch.postMessage({ type: 'LOGOUT' })
        ch.close()
      }
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth-user')
        window.location.href = '/'
      }
    }
  }

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [pathname, isMobile, setSidebarOpen])

  return (
    <>
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

      <div className="relative shrink-0 z-40 max-lg:fixed max-lg:left-0 max-lg:top-[70px] max-lg:h-[calc(100vh-70px)]">
        <motion.aside
          initial={false}
          animate={{ width: sidebarOpen ? SIDEBAR_EXPANDED : isMobile ? 0 : SIDEBAR_COLLAPSED }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
          // ↓ overflow-x-hidden keeps the slide animation clean; overflow-y visible lets scroll work
          className="h-full border-r border-white/[0.07] bg-[var(--color-bg)] overflow-x-hidden overflow-y-hidden"
        >
          {/* Fixed-width inner column — min-h-0 is critical so flex children can shrink */}
          <div style={{ width: SIDEBAR_EXPANDED }} className="h-full flex flex-col py-5 min-h-0">

            {/* User row — never shrinks */}
            <div className="flex items-center gap-3 px-4 mb-7 overflow-hidden shrink-0">
              <div className="w-8 h-8 rounded-full bg-[var(--color-cyan)] glow-cyan flex items-center justify-center shrink-0">
                <span className="font-card sm:!text-[0.8rem] md:!text-[0.9rem] lg:!text-[1.1rem] text-[var(--color-bg)] text-xs font-bold">
                  {user?.first_name?.[0]?.toUpperCase() ?? 'A'}
                </span>
              </div>
              <motion.div
                animate={{ opacity: sidebarOpen ? 1 : 0, x: sidebarOpen ? 0 : -8 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <p className="font-body sm:!text-[0.8rem] md:!text-[0.9rem] lg:!text-[1.1rem] text-white whitespace-nowrap">
                  {user?.first_name && user?.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : user?.email ?? 'User'}
                </p>
                <p className="font-body sm:!text-[0.8rem] md:!text-[0.9rem] lg:!text-[1.1rem] text-white/40 whitespace-nowrap capitalize">
                  {user?.role?.replace(/_/g, ' ') ?? ''}
                </p>
              </motion.div>
            </div>

            {/* Divider — never shrinks */}
            <div className="sep-x-cyan mx-4 mb-4 shrink-0" />

            {/*
              Nav — flex-1 + min-h-0 lets it fill available space;
              overflow-y-auto makes it scroll when items overflow.
              Custom scrollbar keeps it subtle.
            */}
            <nav
              className={`
                flex-1 min-h-0 px-2 space-y-0.5
                overflow-y-auto overflow-x-hidden
                [&::-webkit-scrollbar]:w-[3px]
                [&::-webkit-scrollbar-track]:bg-transparent
                [&::-webkit-scrollbar-thumb]:bg-white/10
                [&::-webkit-scrollbar-thumb]:rounded-full
                hover:[&::-webkit-scrollbar-thumb]:bg-white/20
              `}
            >
              {navItems.map((item, i) => (
                <NavItem
                  key={item.href}
                  item={item}
                  isActive={
                    item.href.endsWith('/') && item.href !== '/'
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + '/')
                  }
                  index={i}
                  expanded={sidebarOpen}
                  onNavigate={() => {
                    if (isMobile) setSidebarOpen(false)
                    onNavigate?.()
                  }}
                />
              ))}
            </nav>

            {/* Sign-out footer — never shrinks */}
            <div className="px-2 space-y-0.5 pt-4 border-t border-white/[0.07] shrink-0">
              <motion.button
                onClick={() => setLogoutModalOpen(true)}
                whileHover={{ x: sidebarOpen ? 2 : 0 }}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center gap-3 rounded-xl hover:text-red-400 transition-colors group py-3 px-2"
              >
                <span className="shrink-0 flex items-center justify-center" style={{ width: SIDEBAR_COLLAPSED - 32 }}>
                  <LogOut size={17} className="group-hover:text-red-400 transition-colors" />
                </span>
                <motion.span
                  animate={{ opacity: sidebarOpen ? 1 : 0, width: sidebarOpen ? 'auto' : 0 }}
                  transition={{ duration: 0.2 }}
                  className="font-body booking-text text-[15px] whitespace-nowrap overflow-hidden"
                >
                  Sign out
                </motion.span>
              </motion.button>
            </div>
          </div>
        </motion.aside>

        {!isMobile && (
          <motion.button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.9 }}
            className="absolute top-17 -right-3.5 items-center justify-center
                       w-7 h-7 rounded-full glass border border-white/10
                       hover:border-[var(--color-cyan)]/40 transition-colors hidden sm:flex"
          >
            {sidebarOpen ? <PanelLeftClose size={12} /> : <PanelLeft size={12} />}
          </motion.button>
        )}
      </div>

      <ReusableModal
        open={logoutModalOpen}
        title="Sign Out"
        description="Are you sure you want to sign out of your account?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={handleLogout}
        onCancel={() => setLogoutModalOpen(false)}
      />
    </>
  )
}

interface NavItemProps {
  item: NavItem
  isActive: boolean
  index: number
  expanded: boolean
  onNavigate: () => void
}

function NavItem({ item, isActive, index, expanded, onNavigate }: NavItemProps) {
  return (
    <Link href={item.href} onClick={onNavigate} prefetch={false}>
      <motion.div
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.06, duration: 0.3 }}
        whileHover={{ x: expanded ? 3 : 0 }}
        whileTap={{ scale: 0.97 }}
        title={!expanded ? item.label : undefined}
        className={`relative w-full flex items-center gap-3 rounded-xl text-left
                    transition-colors group py-3 px-2 cursor-pointer
                    ${isActive ? 'text-[var(--color-cyan)]' : 'hover:[var(--color-cyan)]'}`}
      >
        {isActive && (
          <motion.div
            layoutId="activeNav"
            className="absolute inset-0 rounded-xl glass-surface border border-[var(--color-cyan)]/20"
            transition={{ type: 'spring' as const, stiffness: 320, damping: 32 }}
          />
        )}
        <span className="relative z-10 shrink-0 flex items-center justify-center" style={{ width: 56 - 32 }}>
          {item.icon}
        </span>
        <motion.span
          animate={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0 }}
          transition={{ duration: 0.2 }}
          className="relative z-10 font-body booking-text text-[15px] whitespace-nowrap overflow-hidden"
        >
          {item.label}
        </motion.span>
      </motion.div>
    </Link>
  )
}