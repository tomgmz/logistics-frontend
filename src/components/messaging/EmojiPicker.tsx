'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'

const CATEGORIES = [
  { label: '😀', name: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🫣','🤗','🫡','🤔','🫠','🤭','🤫','🤥','😶','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🫥','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'] },
  { label: '👍', name: 'Gestures', emojis: ['👋','🤚','🖐','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🫶','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦵','🦶','👁','👀','🫀','🫁','🧠','🦷','🦴','👄','🫦','👅','👂','👃','🤜'] },
  { label: '❤️', name: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','☸️','🆘','💯','💢','💥','💫','💦','💨','🕳️','💬','💭','🗯️','💤','🔔'] },
  { label: '🎉', name: 'Objects', emojis: ['🎉','🎊','🎈','🎂','🎁','🎀','🎗️','🎟️','🎫','🏆','🥇','🥈','🥉','🎖️','🏅','🎯','🎲','🧩','🪅','🎭','🎨','🖼️','🎪','🤹','🎠','🎡','🎢','🎰','🚀','🛸','🌍','🌙','⭐','🌟','💫','✨','🌈','⚡','🔥','❄️','🌊'] },
  { label: '🐶', name: 'Animals', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈'] },
  { label: '🍕', name: 'Food', emojis: ['🍕','🍔','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🥣','🥗','🍿','🧈','🧀','🥓','🥩','🍗','🍖','🌭','🥪','🧇','🥞','🍩','🍪','🎂','🍰','🧁','🥧','🍮','🍭','🍬','🍫','🍿','☕','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾'] },
]

// Quick reaction emojis (shown inline on hover)
export const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','😡']

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  position?: 'top' | 'bottom'
}

export default function EmojiPicker({ onSelect, onClose, position = 'top' }: EmojiPickerProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const allEmojis = CATEGORIES.flatMap(c => c.emojis)
  const filtered = search
    ? allEmojis.filter(e => e.includes(search))
    : CATEGORIES[activeCategory].emojis

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92, y: position === 'top' ? 8 : -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: position === 'top' ? 8 : -8 }}
      transition={{ duration: 0.15 }}
      className={`absolute z-50 w-72 bg-[var(--color-bg)] border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
    >
      {/* Search */}
      <div className="p-2 border-b border-white/[0.06]">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search emoji…"
            className="w-full bg-white/[0.05] border border-white/[0.07] rounded-xl pl-7 pr-2 py-1.5 ff-body text-xs text-white placeholder:text-white/25 focus:outline-none"
          />
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/[0.06] overflow-x-auto">
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => setActiveCategory(i)}
              className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-base transition-all ${activeCategory === i ? 'bg-white/10' : 'hover:bg-white/[0.05]'}`}
              title={cat.name}
            >
              <span className="text-[16px] leading-none" style={{ fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif' }}>
                {cat.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="h-48 overflow-y-auto p-2 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
        {!search && (
          <p className="ff-body text-[9px] text-white/25 uppercase tracking-widest px-1 pb-1">
            {CATEGORIES[activeCategory].name}
          </p>
        )}
        <div className="grid grid-cols-8 gap-0.5">
          {filtered.map((emoji, i) => (
            <motion.button
              key={`${emoji}-${i}`}
              type="button"
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => { onSelect(emoji); onClose() }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
            >
              <span className="text-[18px] leading-none" style={{ fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif' }}>
                {emoji}
              </span>
            </motion.button>
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="ff-body text-white/20 text-xs text-center py-8">No emoji found</p>
        )}
      </div>
    </motion.div>
  )
}

// Inline quick-reaction bar shown on message hover
interface QuickReactBarProps {
  onReact: (emoji: string) => void
  currentUserReaction?: string | null
  isMine: boolean
}

export function QuickReactBar({ onReact, currentUserReaction, isMine }: QuickReactBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 4 }}
      transition={{ duration: 0.12 }}
      className={`absolute -top-9 ${isMine ? 'right-0' : 'left-0'} flex items-center gap-0.5 bg-[var(--color-bg)] border border-white/10 rounded-full px-1.5 py-1 shadow-lg z-10`}
    >
      {QUICK_REACTIONS.map(emoji => (
        <motion.button
          key={emoji}
          type="button"
          whileHover={{ scale: 1.3 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onReact(emoji)}
          className={`w-6 h-6 flex items-center justify-center rounded-full transition-all ${currentUserReaction === emoji ? 'bg-[var(--color-cyan)]/20' : 'hover:bg-white/10'}`}
        >
          <span className="text-[14px] leading-none" style={{ fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif' }}>
            {emoji}
          </span>
        </motion.button>
      ))}
    </motion.div>
  )
}