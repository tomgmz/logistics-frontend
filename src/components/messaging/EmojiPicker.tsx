'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search } from 'lucide-react'
// @emoji-mart/data — install with: npm install @emoji-mart/data
import emojiData from '@emoji-mart/data/sets/15/native.json'

// ─── Types ─────────────────────────────────────────────────────────────────────

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

// ─── Category config ───────────────────────────────────────────────────────────

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

// ─── Skin tones ────────────────────────────────────────────────────────────────

const SKIN_TONES: { label: string; index: number }[] = [
  { label: 'Default',      index: 0 },
  { label: 'Light',        index: 1 },
  { label: 'Medium-Light', index: 2 },
  { label: 'Medium',       index: 3 },
  { label: 'Medium-Dark',  index: 4 },
  { label: 'Dark',         index: 5 },
]

// ─── Search index (built once at module load, not per-render) ──────────────────

const searchIndex: Record<string, string> = {}
for (const id of Object.keys(data.emojis)) {
  const e = data.emojis[id]
  searchIndex[id] = [e.name, ...(e.keywords ?? []), ...(e.emoticons ?? [])].join(' ').toLowerCase()
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getNative(id: string, skinIndex = 0): string {
  const e = data.emojis[id]
  if (!e) return ''
  return (e.skins[skinIndex] ?? e.skins[0])?.native ?? ''
}

function hasSkins(id: string): boolean {
  return (data.emojis[id]?.skins.length ?? 1) > 1
}

// ─── Virtual grid ──────────────────────────────────────────────────────────────
// Only renders rows that are visible in the scroll viewport + a small buffer.
// This keeps DOM nodes ~50 instead of ~3000, eliminating the main lag source.

const COLS = 8
const ROW_H = 32  // px — matches h-8
const CONTAINER_H = 208 // px — matches h-52
const BUFFER = 3  // extra rows above/below viewport

function useVirtualGrid(items: string[]) {
  const [scrollTop, setScrollTop] = useState(0)

  const totalRows = Math.ceil(items.length / COLS)
  const startRow  = Math.max(0, Math.floor(scrollTop / ROW_H) - BUFFER)
  const endRow    = Math.min(totalRows, Math.ceil((scrollTop + CONTAINER_H) / ROW_H) + BUFFER)

  const paddingTop    = startRow * ROW_H
  const paddingBottom = Math.max(0, (totalRows - endRow) * ROW_H)
  const visibleItems  = items.slice(startRow * COLS, endRow * COLS)
  const totalHeight   = totalRows * ROW_H

  return { visibleItems, paddingTop, paddingBottom, totalHeight, setScrollTop }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡']

// ─── EmojiPicker ───────────────────────────────────────────────────────────────

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
  position?: 'top' | 'bottom'
}

export default function EmojiPicker({ onSelect, onClose, position = 'top' }: EmojiPickerProps) {
  const [search, setSearch]                 = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeCatIndex, setActiveCatIndex] = useState(0)
  const [skinTone, setSkinTone]             = useState(0)
  const [skinBarOpen, setSkinBarOpen]       = useState(false)
  const [emojiSkins, setEmojiSkins]         = useState<{
    id: string; skins: EmojiSkin[]; x: number; y: number
  } | null>(null)

  const ref       = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const gridRef   = useRef<HTMLDivElement>(null)

  // ── Debounce search input (120ms) — prevents running filter on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 120)
    return () => clearTimeout(t)
  }, [search])

  // ── Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // ── Auto-focus search
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  const categories = data.categories

  // ── Derive emoji list — uses pre-built searchIndex, not inline recompute
  const displayEmojis = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return categories[activeCatIndex]?.emojis ?? []
    return Object.keys(data.emojis).filter(id => searchIndex[id].includes(q))
  }, [debouncedSearch, activeCatIndex, categories])

  const { visibleItems, paddingTop, paddingBottom, totalHeight, setScrollTop } =
    useVirtualGrid(displayEmojis)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [setScrollTop])

  // Reset scroll when category or search changes
  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [activeCatIndex, debouncedSearch, setScrollTop])

  const handleSelect = useCallback((id: string) => {
    onSelect(getNative(id, skinTone))
    onClose()
  }, [onSelect, onClose, skinTone])

  // Right-click (or long-press) → show per-emoji skin picker
  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    if (!hasSkins(id)) return
    e.preventDefault()
    const btnRect    = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const pickerRect = ref.current?.getBoundingClientRect()
    if (!pickerRect) return
    setEmojiSkins({
      id,
      skins: data.emojis[id].skins,
      x: btnRect.left - pickerRect.left,
      y: btnRect.top  - pickerRect.top,
    })
  }, [])

  const activeMeta = CATEGORY_META[categories[activeCatIndex]?.id ?? '']

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
      {/* ── Search + Global skin tone ───────────────────────────────────────── */}
      <div className="p-2 border-b border-white/[0.06] flex gap-1.5 items-center">
        <div className="relative flex-1">
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

        {/* Skin tone button */}
        <div className="relative">
          <button
            type="button"
            title="Skin tone"
            onClick={() => setSkinBarOpen(o => !o)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
          >
            <span className="text-[18px] leading-none">{getNative('raised_hand', skinTone)}</span>
          </button>

          <AnimatePresence>
            {skinBarOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.88, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute right-0 top-full mt-1 flex gap-0.5 bg-[var(--color-bg)] border border-white/10 rounded-xl p-1 shadow-xl z-20"
              >
                {SKIN_TONES.map(({ label, index }) => (
                  <button
                    key={index}
                    type="button"
                    title={label}
                    onClick={() => { setSkinTone(index); setSkinBarOpen(false) }}
                    className={`
                      w-7 h-7 flex items-center justify-center rounded-lg transition-all
                      ${skinTone === index ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/[0.05]'}
                    `}
                  >
                    <span className="text-[18px] leading-none">{getNative('raised_hand', index)}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Category tabs ───────────────────────────────────────────────────── */}
      {!debouncedSearch && (
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
                onClick={() => setActiveCatIndex(i)}
                title={meta?.label ?? cat.id}
                className={`
                  shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all
                  ${activeCatIndex === i ? 'bg-white/10' : 'hover:bg-white/[0.05]'}
                `}
              >
                <span className="text-[16px] leading-none">{meta?.icon ?? '🔷'}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Category label (outside scroll area to keep totalHeight clean) ──── */}
      {!debouncedSearch && activeMeta && (
        <p className="ff-body text-[9px] text-white/25 uppercase tracking-widest px-3 pt-2 pb-0.5">
          {activeMeta.label}
        </p>
      )}

      {/* ── Virtualized emoji grid ──────────────────────────────────────────── */}
      {/*
        KEY PERF FIX: Instead of rendering all N emojis (often 1500–3000),
        we only render the ~50 that are visible in the 208px viewport.
        paddingTop/paddingBottom trick maintains correct scroll height without
        needing any extra DOM nodes.
      */}
      <div
        ref={gridRef}
        onScroll={handleScroll}
        className="
          h-52 overflow-y-auto px-2 pb-2
          [&::-webkit-scrollbar]:w-[3px]
          [&::-webkit-scrollbar-thumb]:bg-white/10
          [&::-webkit-scrollbar-thumb]:rounded-full
        "
      >
        {displayEmojis.length === 0 ? (
          <p className="ff-body text-white/20 text-xs text-center py-10">No emoji found</p>
        ) : (
          /* Outer div maintains full scroll height */
          <div style={{ height: totalHeight }}>
            {/* Inner div offsets to the visible window */}
            <div style={{ paddingTop, paddingBottom }}>
              {/*
                KEY PERF FIX: No motion.button per emoji.
                Hover/tap effects are pure CSS (transform + transition).
                Going from ~1500 Framer Motion subscribers to 0 is a huge win.
              */}
              <div className="grid grid-cols-8 gap-0.5">
                {visibleItems.map(id => {
                  const native = getNative(id, skinTone)
                  if (!native) return null
                  return (
                    <button
                      key={id}
                      type="button"
                      title={data.emojis[id]?.name}
                      onClick={() => handleSelect(id)}
                      onContextMenu={e => handleContextMenu(e, id)}
                      className="
                        w-8 h-8 flex items-center justify-center rounded-lg
                        hover:bg-white/10 hover:scale-125 active:scale-90
                        transition-[transform,background-color] duration-75
                      "
                    >
                      <span className="text-[20px] leading-none select-none">{native}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Per-emoji skin tone picker (right-click on any skinnable emoji) ─── */}
      <AnimatePresence>
        {emojiSkins && (
          <>
            {/* backdrop to dismiss */}
            <div
              className="absolute inset-0 z-20"
              onClick={() => setEmojiSkins(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ duration: 0.1 }}
              style={{
                position: 'absolute',
                left: Math.min(emojiSkins.x, 220), // clamp so it doesn't overflow right edge
                top: Math.max(0, emojiSkins.y - 44),
              }}
              className="
                flex gap-0.5 z-30
                bg-[var(--color-bg)] border border-white/10
                rounded-xl p-1 shadow-xl
              "
            >
              {emojiSkins.skins.map((skin, i) => (
                <button
                  key={i}
                  type="button"
                  title={SKIN_TONES[i]?.label ?? `Skin ${i}`}
                  onClick={() => {
                    onSelect(skin.native)
                    onClose()
                  }}
                  className="
                    w-8 h-8 flex items-center justify-center rounded-lg
                    hover:bg-white/10 hover:scale-125 active:scale-90
                    transition-[transform,background-color] duration-75
                  "
                >
                  <span className="text-[20px] leading-none select-none">{skin.native}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── QuickReactBar ─────────────────────────────────────────────────────────────

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
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className={`
            w-7 h-7 flex items-center justify-center rounded-full
            hover:scale-125 active:scale-90
            transition-[transform,background-color] duration-75
            ${currentUserReaction === emoji ? 'bg-[var(--color-cyan)]/20' : 'hover:bg-white/10'}
          `}
        >
          <span className="text-[18px] leading-none select-none">{emoji}</span>
        </button>
      ))}
    </motion.div>
  )
}