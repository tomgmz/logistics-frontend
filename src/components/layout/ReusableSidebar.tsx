'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ASSETS } from '@/lib/data'
import { logout } from '@/lib/api/auth.api'
import { unregisterWebPush } from '@/lib/push/web-push'
import { useAuthStore } from '@/lib/store/auth.store'
import ReusableModal from '@/components/layout/ReusableModal'
import SigningOutOverlay from '@/components/layout/SigningOutOverlay'
import { roleLabel } from '@/lib/roles'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

// Figma 3215:1196 (collapsed) and 3215:1485 (open); the rail is slimmer than
// the Figma's 73px (the user's call, 2026-10-29).
const SIDEBAR_COLLAPSED = 60
const SIDEBAR_EXPANDED = 290
// The aside's border, inside its width.
const SIDEBAR_BORDER = 1.5
// The open layout (Figma) centres the icons, logo arrows, Sign out and avatar
// on x=36 of the content. On the slim rail the contents slide left so that line
// is the middle of the space inside the border, equal room either side; open,
// they sit where the Figma has them.
const RAIL_SHIFT = (SIDEBAR_COLLAPSED - SIDEBAR_BORDER * 2) / 2 - 36
// The floating sidebar's gap from the page edges.
const SIDEBAR_GAP = 6

// Where the three arrows sit inside final-logo.png, as fractions of the image
// (measured from the file: x 1445–2000 of 2000, y 28–300 of 510).
const LOGO_ARROWS = { left: 0.7225, top: 0.055, bottom: 0.59 }
const LOGO_W = 150 // the logo as drawn, px
// Open: the whole logo, 4px in so it lines up with the icons (button at 21px).
const LOGO_OPEN = { x: 4, scale: 1, clipPath: 'inset(0% 0% 0% 0%)' }
// On the rail: only the arrows, scaled to 30px wide, their left edge at 21px.
const LOGO_RAIL = {
  x: -LOGO_ARROWS.left * LOGO_W,
  scale: 30 / ((1 - LOGO_ARROWS.left) * LOGO_W),
  clipPath: `inset(0% 0% ${(1 - LOGO_ARROWS.bottom) * 100}% ${LOGO_ARROWS.left * 100}%)`,
}

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
  // Open over the page on phones: keep the page under it still (iOS).
  useBodyScrollLock(isMobile && sidebarOpen)
  const user = useAuthStore((state) => state.user)
  const clearUser = useAuthStore((state) => state.clearUser)
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)
  const [signingOut,      setSigningOut]      = useState(false)

  const handleLogout = async () => {
    // Swap the confirm modal for the full-screen loader; it stays up until the
    // navigation below replaces the page.
    setLogoutModalOpen(false)
    setSigningOut(true)
    try {
      await unregisterWebPush()
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

  // Hovering the rail opens the sidebar and leaving closes it again, with a
  // mouse only: touch has no hover, the logo stays the toggle there. A sidebar
  // opened by a click is left alone. The short delay keeps a pointer that only
  // passes over the rail from flicking it open.
  const hoverOpened = useRef(false)
  const hoverTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canHover = () => typeof window !== 'undefined'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const clearHoverTimer = () => { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null } }
  useEffect(() => clearHoverTimer, [])

  const onRailEnter = () => {
    if (isMobile || sidebarOpen || !canHover()) return
    clearHoverTimer()
    hoverTimer.current = setTimeout(() => {
      hoverOpened.current = true
      setSidebarOpen(true)
    }, 120)
  }
  const onRailLeave = () => {
    clearHoverTimer()
    if (!hoverOpened.current) return
    hoverOpened.current = false
    setSidebarOpen(false)
  }
  // Any other open or close (the logo, a link, the overlay) takes it over.
  const toggleSidebar = (open: boolean) => {
    clearHoverTimer()
    hoverOpened.current = false
    setSidebarOpen(open)
  }

  return (
    <>
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => toggleSidebar(false)}
            // Every width: the open sidebar lies over the page, and a click
            // beside it closes it. Lighter on desktop, where only the slim
            // rail's widening is covered.
            className="fixed inset-0 z-[55] bg-black/60 lg:bg-black/30"
          />
        )}
      </AnimatePresence>

      {/* Desktop keeps only the slim rail's room, so opening the sidebar
          never moves the page: it floats over it instead. */}
      <div aria-hidden className="hidden lg:block shrink-0" style={{ width: SIDEBAR_COLLAPSED + SIDEBAR_GAP * 2 }} />

      {/* Full height, from the very top (Figma 3215:1196 / 3215:1485): the
          header sits beside it, and on phones the open sidebar covers it. */}
      <div
        className="z-[60] fixed"
        onMouseEnter={onRailEnter}
        onMouseLeave={onRailLeave}
        style={{
          top: SIDEBAR_GAP, bottom: SIDEBAR_GAP, left: SIDEBAR_GAP,
          pointerEvents: isMobile && !sidebarOpen ? 'none' : undefined,
        }}
      >
        <motion.aside
          initial={false}
          animate={isMobile
            ? { width: SIDEBAR_EXPANDED, x: sidebarOpen ? 0 : -(SIDEBAR_EXPANDED + SIDEBAR_GAP * 2) }
            : { width: sidebarOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED, x: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
          style={{ borderWidth: SIDEBAR_BORDER }}
          className={`h-full rounded-xl border-white/[0.08] bg-[var(--color-bg)] overflow-hidden transition-shadow ${sidebarOpen ? 'shadow-2xl' : ''}`}
        >
          <motion.div
            initial={false}
            animate={{ x: sidebarOpen || isMobile ? 0 : RAIL_SHIFT }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            style={{ width: SIDEBAR_EXPANDED }}
            className="h-full flex flex-col min-h-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          >

            {/* The logo; on the slim rail just its three arrows. It is also the
                toggle: the arrows open the sidebar, the logo closes it.
                One image morphs between the two: closing wipes away "8338" and
                "LOGISTICS SERVICES" while the logo's own arrows shrink and slide
                onto the rail; opening plays it back. */}
            <div className="h-[80px] shrink-0 pt-[18px]">
              <button
                type="button"
                onClick={() => toggleSidebar(!sidebarOpen)}
                aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                title={sidebarOpen ? undefined : 'Open sidebar'}
                className="ml-[21px] block h-[38px] w-[150px] transition-opacity hover:opacity-80"
              >
                <motion.span
                  initial={false}
                  animate={sidebarOpen ? LOGO_OPEN : LOGO_RAIL}
                  transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  className="block h-full w-full"
                  style={{ transformOrigin: `${LOGO_ARROWS.left * 100}% ${LOGO_ARROWS.top * 100}%` }}
                >
                  <Image src={ASSETS.logo} alt="8338 Logistics" width={150} height={38} className="h-[38px] w-[150px] object-contain object-left" />
                </motion.span>
              </button>
            </div>

            <nav
              className={`
                flex-1 min-h-0
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

            <button
              type="button"
              onClick={() => setLogoutModalOpen(true)}
              title={sidebarOpen ? undefined : 'Sign out'}
              className="group flex h-[46px] w-full shrink-0 items-center gap-[18px] pl-[26px] text-left text-white transition-colors hover:text-red-400"
            >
              <LogOut size={20} className="shrink-0" />
              <span className={`ff-regular text-[16px] whitespace-nowrap transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                Sign out
              </span>
            </button>

            {/* Who is signed in: a card when open, just the avatar on the rail. */}
            <div className="mt-3 shrink-0 px-[11px]">
              <div
                className={`flex h-[70px] items-center gap-[14px] rounded-xl border pl-[9px] transition-colors ${
                  sidebarOpen ? 'border-white/[0.08] bg-white/[0.03]' : 'border-transparent'
                }`}
              >
                <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--color-cyan)]">
                  <span className="font-card !text-[0.75rem] font-bold text-[var(--color-bg)]">
                    {user?.first_name?.[0]?.toUpperCase() ?? 'A'}
                  </span>
                </div>
                <div className={`min-w-0 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                  <p className="ff-regular truncate text-[16px] leading-[22px] text-white">
                    {user?.first_name && user?.last_name
                      ? `${user.first_name} ${user.last_name}`
                      : user?.email ?? 'User'}
                  </p>
                  <p className="ff-regular truncate text-[16px] leading-[22px] text-[#818181]">
                    {roleLabel(user?.role)}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.aside>
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

      <SigningOutOverlay open={signingOut} />
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

/**
 * One 46px row (Figma): icon from 25px, label from 65px. The selected one sits
 * in a dark box with its icon and label in cyan (Figma 1490:3989 / 1490:4179).
 */
function NavItem({ item, isActive, index, expanded, onNavigate }: NavItemProps) {
  return (
    <Link href={item.href} onClick={onNavigate} prefetch={false}>
      <motion.div
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.04, duration: 0.3 }}
        title={!expanded ? item.label : undefined}
        className={`relative flex h-[46px] w-full items-center gap-[18px] pl-[25px] text-left transition-colors cursor-pointer
                    ${isActive ? 'text-[#4DF9ED]' : 'text-white [@media(hover:hover)]:hover:text-[#4DF9ED]'}`}
      >
        {/* The selected item (Figma): a dark box from 15px to the sidebar's
            right edge. On the rail the edge cuts it off, solid, with no outline
            on the right; open, its last stretch fades out into the sidebar. */}
        {isActive && (
          <motion.div
            layoutId="activeNav"
            initial={false}
            style={{
              width: SIDEBAR_EXPANDED - 15,
              maskImage: 'linear-gradient(to right, #000 88%, transparent)',
              WebkitMaskImage: 'linear-gradient(to right, #000 88%, transparent)',
            }}
            className="absolute inset-y-0 left-[15px] rounded-[10px] border border-[#1b1b1b] bg-[#0e1010]"
            transition={{ type: 'spring' as const, stiffness: 320, damping: 32 }}
          />
        )}
        <span className="relative z-10 flex w-[22px] shrink-0 items-center justify-center">
          {item.icon}
        </span>
        <span
          className={`relative z-10 ff-sc text-[16px] whitespace-nowrap transition-opacity ${expanded ? 'opacity-100' : 'opacity-0'}`}
        >
          {item.label}
        </span>
      </motion.div>
    </Link>
  )
}
