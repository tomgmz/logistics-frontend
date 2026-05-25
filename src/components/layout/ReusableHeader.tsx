'use client'

import { motion } from 'framer-motion'
import { MessageCircle, Menu, ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { ASSETS } from '@/lib/data'
import NotificationIcon from '@/components/ui/NotificationIcon'
import { useMessengerStore } from '@/lib/store/messenger.store'
import { MOCK_CONVERSATIONS } from '@/lib/data/messaging.mock'
import { useAuthStore } from '@/lib/store/auth.store'
import { ROLE_ROUTES } from '@/constants/roles'

interface ReusableHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export default function ReusableHeader({ sidebarOpen, onToggleSidebar }: ReusableHeaderProps) {
  const { togglePanel, isPanelOpen } = useMessengerStore()
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore(s => s.user)

  const totalUnread = MOCK_CONVERSATIONS.reduce((sum, c) => sum + c.unread_count, 0)
  const isMessagesPage = pathname === '/messages'
  const backHref = ROLE_ROUTES[user?.role ?? ''] ?? '/'

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="h-[70px] lg:h-[80px] shrink-0 z-50 flex items-center justify-between
                 px-4 lg:px-6 border-b border-white/[0.07] bg-[var(--color-bg)]"
    >
      <div className="flex items-center gap-3">
        {isMessagesPage ? (
          <button
            onClick={() => router.push(backHref)}
            className="p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-white transition-colors"
          >
            <Menu size={20} />
          </button>
        )}
        <LogoMark />
      </div>

      <div className="flex items-center gap-2 lg:gap-3">
        {!isMessagesPage && (
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            onClick={togglePanel}
            className={`
              relative w-9 h-9 lg:w-10 lg:h-10 rounded-full glass
              flex items-center justify-center transition-colors
              ${isPanelOpen
                ? 'border-[var(--color-cyan)]/40 text-[var(--color-cyan)]'
                : 'hover:border-[var(--color-cyan)]/30'
              }
            `}
          >
            <MessageCircle size={16} />
            {totalUnread > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-[var(--color-cyan)] flex items-center justify-center px-0.5"
              >
                <span className="ff-sc text-[9px] font-bold text-[var(--color-bg)] leading-none">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              </motion.span>
            )}
          </motion.button>
        )}

        <NotificationIcon />
      </div>
    </motion.header>
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