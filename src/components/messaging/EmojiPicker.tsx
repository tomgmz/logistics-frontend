'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
// @emoji-mart/data — install with: npm install @emoji-mart/data
// Pure JSON, no API, no images. Emojis render via the OS native font.
import emojiData from '@emoji-mart/data/sets/15/native.json'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmojiSkin {
  unified: string
  native: string
}

interface EmojiEntry {
  id: string
  name: string
  keywords: string[]
  emoticons?: string[]
  skins: EmojiSkin[]
}

interface EmojiDataShape {
  categories: { id: string; emojis: string[] }[]
  emojis: Record<string, EmojiEntry>
}

const data = emojiData as EmojiDataShape

// ─── Category display config ──────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  people:   { label: 'Smileys & People', icon: '😀' },
  nature:   { label: 'Animals & Nature', icon: '🐵' },
  foods:    { label: 'Food & Drink',     icon: '🍕' },
  activity: { label: 'Activities',       icon: '⚽' },
  places:   { label: 'Travel & Places',  icon: '✈️' },
  objects:  { label: 'Objects',          icon: '💡' },
  symbols:  { label: 'Symbols',          icon: '❤️' },
  flags:    { label: 'Flags',            icon: '🏁' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve an emoji ID → its default native character */
function getNative(id: string): string {
  return data.emojis[id]?.skins[0]?.native ?? ''
}

/** Resolve an emoji ID → searchable text (name + keywords + emoticons) */
function getSearchText(id: string): string {
  const e = data.emojis[id]
  if (!e) return ''
  return [e.name, ...(e.keywords ?? []), ...(e.emoticons ?? [])].join(' ').toLowerCase()
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡']

// ─── EmojiPicker ─────────────────────────────────────────────────────────────

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  position?: 'top' | 'bottom'
}

export default function EmojiPicker({ onSelect, onClose, position = 'top' }: EmojiPickerProps) {
  const [search, setSearch] = useState('')
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Auto-focus search
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [])

  const categories = data.categories

  // Derive emoji list — search across all, or show active category
  const displayEmojis = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) {
      return categories[activeCategoryIndex]?.emojis ?? []
    }
    // Search all categories by name, keywords, emoticons
    return Object.keys(data.emojis).filter(id => getSearchText(id).includes(q))
  }, [search, activeCategoryIndex, categories])

  const activeCategory = categories[activeCategoryIndex]
  const activeMeta = activeCategory ? CATEGORY_META[activeCategory.id] : null

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.92, y: position === 'top' ? 8 : -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: position === 'top' ? 8 : -8 }}
      transition={{ duration: 0.15 }}
      className={`
        absolute z-50 w-[300px]
        bg-[var(--color-bg)] border border-white/[0.10]
        rounded-2xl shadow-2xl overflow-hidden
        ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
      `}
    >
      {/* Search */}
      <div className="p-2 border-b border-white/[0.06]">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search emoji…"
            className="
              w-full bg-white/[0.05] border border-white/[0.07] rounded-xl
              pl-7 pr-2 py-1.5 ff-body text-xs text-white
              placeholder:text-white/25 focus:outline-none
            "
          />
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="
          flex items-center gap-0.5 px-2 py-1.5
          border-b border-white/[0.06]
          overflow-x-auto [&::-webkit-scrollbar]:hidden
        ">
          {categories.map((cat, i) => {
            const meta = CATEGORY_META[cat.id]
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryIndex(i)}
                title={meta?.label ?? cat.id}
                className={`
                  shrink-0 w-7 h-7 flex items-center justify-center
                  rounded-lg text-base transition-all
                  ${activeCategoryIndex === i ? 'bg-white/10' : 'hover:bg-white/[0.05]'}
                `}
              >
                <span className="text-[16px] leading-none">{meta?.icon ?? '🔷'}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Emoji grid */}
      <div className="
        h-52 overflow-y-auto p-2
        [&::-webkit-scrollbar]:w-[3px]
        [&::-webkit-scrollbar-thumb]:bg-white/10
        [&::-webkit-scrollbar-thumb]:rounded-full
      ">
        {!search && activeMeta && (
          <p className="ff-body text-[9px] text-white/25 uppercase tracking-widest px-1 pb-1">
            {activeMeta.label}
          </p>
        )}

        {displayEmojis.length === 0 ? (
          <p className="ff-body text-white/20 text-xs text-center py-10">No emoji found</p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {displayEmojis.map(id => {
              const native = getNative(id)
              if (!native) return null
              return (
                <motion.button
                  key={id}
                  type="button"
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  title={data.emojis[id]?.name}
                  onClick={() => { onSelect(native); onClose() }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                >
                  <span className="text-[20px] leading-none select-none">{native}</span>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Quick react bar ──────────────────────────────────────────────────────────

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
      className={`
        absolute -top-9 ${isMine ? 'right-0' : 'left-0'}
        flex items-center gap-0.5
        bg-[var(--color-bg)] border border-white/10
        rounded-full px-1.5 py-1 shadow-lg z-10
      `}
    >
      {QUICK_REACTIONS.map(emoji => (
        <motion.button
          key={emoji}
          type="button"
          whileHover={{ scale: 1.3 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onReact(emoji)}
          className={`
            w-7 h-7 flex items-center justify-center rounded-full transition-all
            ${currentUserReaction === emoji ? 'bg-[var(--color-cyan)]/20' : 'hover:bg-white/10'}
          `}
        >
          <span className="text-[18px] leading-none select-none">{emoji}</span>
        </motion.button>
      ))}
    </motion.div>
  )
}