'use client'

import { motion, Variants, AnimatePresence } from 'framer-motion'
import { useMemo, useCallback } from 'react'
import {
  ArrowRight, ArrowLeft,
  CalendarDays, MapPin, Package,
  Truck, Plus, X, Check,
} from 'lucide-react'
import { useSessionState } from '../../hooks/UseSessionState'
import PlacesInput from './PlacesInput'
import './BookingDetails.css'

interface Props {
  onNext: () => void
  onBack: () => void
}

type CargoMode = 'loose' | 'palletized'

interface ItemGroup {
  id: number
  pieces: string
  length: string
  width: string
  height: string
  weight: string
  weightUnit: 'kg' | 'lbs'
  perItem: 'Per Item' | 'Total'
  nonTiltable: boolean
  nonStackable: boolean
}

interface SHCTag { label: string }

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38 } },
}
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
}

let nextId = 2
function makeGroup(): ItemGroup {
  return {
    id: nextId++,
    pieces: '', length: '', width: '', height: '',
    weight: '', weightUnit: 'kg', perItem: 'Per Item',
    nonTiltable: false, nonStackable: false,
  }
}

function calcSummary(groups: ItemGroup[]) {
  let totalPieces = 0
  let grossWeight = 0
  let volume = 0

  for (const g of groups) {
    const pieces = Number(g.pieces)
    const length = Number(g.length)
    const width  = Number(g.width)
    const height = Number(g.height)
    const weight = Number(g.weight)

    if (!Number.isFinite(pieces) || pieces <= 0) continue
    if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) continue
    if (!Number.isFinite(weight) || weight < 0) continue

    totalPieces += pieces

    // normalize weight → KG
    const weightKG = g.weightUnit === 'lbs'
      ? weight * 0.453592
      : weight

    // respect perItem vs total
    if (g.perItem === 'Per Item') {
      grossWeight += pieces * weightKG
    } else {
      grossWeight += weightKG
    }

    // cm³ → m³
    const volumePerItem = (length * width * height) / 1_000_000
    volume += pieces * volumePerItem
  }

  const density = volume > 0 ? grossWeight / volume : 0

  return {
    totalPieces,
    grossWeight,
    volume,
    density,
  }
}

export default function StepBookingDetails({ onNext, onBack }: Props) {
  const [date,           setDate]           = useSessionState('booking:date', '')
  const [time,           setTime]           = useSessionState('booking:time', '')
  const [pickup,         setPickup]         = useSessionState('booking:pickup', '')
  const [dropoffs,       setDropoffs]       = useSessionState<string[]>('booking:dropoffs', [''])
  const [commodity,      setCommodity]      = useSessionState('booking:commodity', '')
  const [product,        setProduct]        = useSessionState('booking:product', '')
  const [shc,            setShc]            = useSessionState('booking:shc', '')
  const [addShc,         setAddShc]         = useSessionState('booking:addShc', '')
  const [dangerous,      setDangerous]      = useSessionState('booking:dangerous', false)
  const [shcTags,        setShcTags]        = useSessionState<SHCTag[]>('booking:shcTags', [])
  const [mode,           setMode]           = useSessionState<CargoMode>('booking:mode', 'loose')
  const [allNonTiltable, setAllNonTiltable] = useSessionState('booking:allNonTiltable', false)
  const [allNonStackable,setAllNonStackable]= useSessionState('booking:allNonStackable', false)
  const [groups,         setGroups]         = useSessionState<ItemGroup[]>('booking:groups', [
    { id: 1, pieces: '', length: '', width: '', height: '', weight: '', weightUnit: 'kg', perItem: 'Per Item', nonTiltable: false, nonStackable: false },
  ])

  const summary = useMemo(() => calcSummary(groups), [groups])

  const updateGroup  = (id: number, patch: Partial<ItemGroup>) =>
    setGroups(groups.map((g) => g.id === id ? { ...g, ...patch } : g))
  const removeGroup  = (id: number) =>
    setGroups(groups.filter((g) => g.id !== id))
  const addGroup     = () => setGroups([...groups, makeGroup()])
  const removeTag    = (label: string) =>
    setShcTags(shcTags.filter((x) => x.label !== label))

  const makeDropoffSetter = useCallback(
    (index: number) => (val: string) => {
      setDropoffs((prevDropoffs) =>
        prevDropoffs.map((x, j) => (j === index ? val : x))
      )
    },
    [setDropoffs]
  )

  const isValid = pickup.trim() !== '' && dropoffs[0]?.trim() !== '' && date.trim() !== ''

  return (
    <div className="flex flex-col h-full p-4 lg:p-6 gap-3 sm:gap-6 overflow-auto">

      {/* Row 1: Transit / Pickup / Dropoff */}
      <motion.div variants={stagger} initial="hidden" animate="show"
        className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6"
      >
        {/* Transit Schedule */}
        <motion.div variants={fadeUp}
          className="bg-[#2A2828] rounded-2xl border border-white/[0.07] p-4 flex flex-col gap-3"
        >
          <SectionHeader icon={<CalendarDays size={16} />} title="Transit Schedule" />
          <div className="flex flex-col gap-1">
            <span className="font-body booking-text text-xs">Date</span>
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="MM/DD/YYYY"
                className="bg-transparent font-body booking-text text-white text-sm lg:text-base
                           focus:outline-none w-full placeholder-white/20"
              />
              <CalendarDays size={18} className="shrink-0" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-body booking-text text-xs">Time</span>
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="HH:MM AM"
              className="bg-transparent font-body booking-text text-white text-sm lg:text-base
                         focus:outline-none w-full placeholder-white/20"
            />
          </div>
        </motion.div>

        {/* PICKUP LOCATION */}
        <motion.div variants={fadeUp}
          className="bg-[#2A2828] rounded-2xl border border-white/[0.07] p-4 flex flex-col gap-3"
        >
          <SectionHeader icon={<Truck size={16} />} title="Pick Up Point" />
          <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2">
            <PlacesInput
              value={pickup}
              onChange={setPickup}
              placeholder="Enter pickup location"
              showIcon={false}
            />
            <MapPin size={15} className=" shrink-0" />
          </div>
        </motion.div>

        {/* Drop Off Point */}
        <motion.div variants={fadeUp}
          className="bg-[#2A2828] rounded-2xl border border-white/[0.07] p-4 flex flex-col gap-2"
        >
          <SectionHeader icon={<MapPin size={16} />} title="Drop Off Point" />
          <div className="flex flex-col gap-2 mt-1">
            {dropoffs.map((d, i) => (
              <div key={i}
                className="flex items-center gap-2 border-b border-white/[0.07] pb-2 last:border-0 last:pb-0"
              >
                <PlacesInput
                  value={d}
                  onChange={makeDropoffSetter(i)}
                  placeholder="Enter drop-off location"
                  showIcon={false}
                />
                {i > 0 && (
                  <button
                    onClick={() => setDropoffs(dropoffs.filter((_, j) => j !== i))}
                    className=" hover:text-red-400 transition-colors cursor-pointer shrink-0"
                  >
                    <X size={13} />
                  </button>
                )}
                <MapPin size={15} className="shrink-0" />
              </div>
            ))}
            {dropoffs.length < 3 && (
              <button
                onClick={() => setDropoffs([...dropoffs, ''])}
                className="flex items-center gap-1 text-[var(--color-cyan)] font-body booking-text
                           text-xs mt-1 hover:opacity-80 transition-opacity cursor-pointer w-fit"
              >
                <Plus size={13} /> Add drop-off
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Product */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="bg-[#2A2828] rounded-2xl border border-white/[0.07] p-4"
      >
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon={<Package size={16} />} title="Product" />
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setDangerous(!dangerous)}
              className={`w-4 h-4 rounded flex items-center justify-center border transition-all
                ${dangerous
                  ? 'bg-[var(--color-cyan)] border-[var(--color-cyan)]'
                  : 'bg-transparent border-white/30'
                }`}
            >
              {dangerous && <Check size={11} strokeWidth={3} className="text-[var(--color-bg)]" />}
            </div>
            <span className="font-body booking-text text-xs lg:text-sm">
              Dangerous Goods
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="font-body booking-text text-xs">Commodity</label>
            <input value={commodity} onChange={(e) => setCommodity(e.target.value)}
              placeholder="e.g. Accessories"
              className="bg-[#2A2828] rounded-sm px-3 py-2.5 font-body booking-text text-white text-sm
                         border border-white/[0.07] focus:outline-none focus:border-[var(--color-cyan)]/40
                         transition-all placeholder-white/20" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-body booking-text text-xs">Product</label>
            <input value={product} onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g. General Cargo"
              className="bg-[#2A2828] rounded-sm px-3 py-2.5 font-body booking-text text-white text-sm
                         border border-white/[0.07] focus:outline-none focus:border-[var(--color-cyan)]/40
                         transition-all placeholder-white/20" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-body booking-text text-xs">SHC</label>
            <div className="relative">
              <select value={shc} onChange={(e) => setShc(e.target.value)}
                className="w-full bg-[#2A2828] rounded-sm px-3 py-2.5 font-body booking-text text-white text-sm
                           border border-white/[0.07] focus:outline-none focus:border-[var(--color-cyan)]/40
                           transition-all appearance-none [color-scheme:dark] cursor-pointer">
                <option value="">Select SHC</option>
                <option value="GEN">GEN</option>
                <option value="PER">PER</option>
                <option value="EAT">EAT</option>
                <option value="HEA">HEA</option>
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs">▼</div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-body text-xs">Additional SHC</label>
            <div className="relative">
              <select value={addShc} onChange={(e) => setAddShc(e.target.value)}
                className="w-full bg-[#2A2828] rounded-sm px-3 py-2.5 font-body booking-text text-white text-sm
                           border border-white/[0.07] focus:outline-none focus:border-[var(--color-cyan)]/40
                           transition-all appearance-none [color-scheme:dark] cursor-pointer">
                <option value="">Select additional SHC</option>
                <option value="FRAGILE">FRAGILE</option>
                <option value="PERISHABLE">PERISHABLE</option>
                <option value="HAZMAT">HAZMAT</option>
              </select>
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs">▼</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <AnimatePresence>
            {shcTags.map((tag) => (
              <motion.span key={tag.label}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full
                           border border-[var(--color-cyan)]/40 bg-[var(--color-cyan)]/10
                           font-body booking-text text-[var(--color-cyan)] text-xs"
              >
                {tag.label}
                <button onClick={() => removeTag(tag.label)} className="cursor-pointer hover:opacity-70">
                  <X size={11} strokeWidth={3} />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Row 3 */}
      <motion.div variants={stagger} initial="hidden" animate="show"
        className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 sm:gap-6 items-start"
      >
        <motion.div variants={fadeUp}
          className="bg-[#2A2828] rounded-2xl border border-white/[0.07] p-4 flex flex-col gap-4"
        >
          <SectionHeader icon={<Truck size={16} />} title="Cargo Capacity" />

          <div className="flex items-center gap-6 border-b border-white/[0.07]">
            {(['loose', 'palletized'] as CargoMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`pb-2 font-body booking-text text-sm capitalize transition-colors cursor-pointer
                  ${mode === m ? 'text-white border-b-2 border-white -mb-px' : 'text-[var(--color-muted)] hover:text-white'}`}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-6 justify-end">
            <CheckRow checked={allNonTiltable}  onChange={setAllNonTiltable}  label="All Non-tiltable"  />
            <CheckRow checked={allNonStackable} onChange={setAllNonStackable} label="All Non-stackable" />
          </div>

          <div className="flex flex-col gap-3">
            <AnimatePresence>
              {groups.map((g, idx) => (
                <motion.div key={g.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                  className="bg-[#424242] rounded-xl p-3 lg:p-4 border border-white/[0.07]"
                >
                  <div className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-3 lg:flex lg:items-end lg:gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="font-body booking-text text-xs whitespace-nowrap">Pieces</label>
                      <input value={g.pieces} onChange={(e) => updateGroup(g.id, { pieces: e.target.value })}
                        placeholder="0"
                        className="bg-[#424242] rounded-lg px-3 py-2 font-body booking-text text-white text-sm
                                   border border-[#333333] focus:outline-none focus:border-[var(--color-cyan)]/40
                                   w-full placeholder-white/20" />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <label className="font-body booking-text text-xs whitespace-nowrap">
                        Dimensions <span className="text-white/20">(cm)</span>
                      </label>
                      <div className="flex gap-1.5">
                        {(['length', 'width', 'height'] as const).map((dim) => (
                          <input key={dim} value={g[dim]}
                            onChange={(e) => updateGroup(g.id, { [dim]: e.target.value })}
                            placeholder={dim.charAt(0).toUpperCase()}
                            className="bg-[#424242] rounded-lg px-2 py-2 font-body booking-text text-white text-sm
                                       border border-[#333333] focus:outline-none focus:border-[var(--color-cyan)]/40
                                       w-full placeholder-white/20 min-w-0" />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 col-span-2 lg:col-span-1 lg:shrink-0">
                      <label className="font-body booking-text text-xs whitespace-nowrap">Weight</label>
                      <div className="flex gap-1.5">
                        <input value={g.weight} onChange={(e) => updateGroup(g.id, { weight: e.target.value })}
                          placeholder="0"
                          className="bg-[#424242] rounded-lg px-2 py-2 font-body booking-text text-white text-sm
                                     border border-[#333333] focus:outline-none focus:border-[var(--color-cyan)]/40
                                     w-14 placeholder-white/20" />
                        <select value={g.weightUnit}
                          onChange={(e) => updateGroup(g.id, { weightUnit: e.target.value as 'kg'|'lbs' })}
                          className="bg-[#424242] rounded-lg px-2 py-2 font-body booking-text text-white text-sm
                                     border border-[#333333] focus:outline-none appearance-none [color-scheme:dark] cursor-pointer w-14">
                          <option value="kg">kg</option>
                          <option value="lbs">lbs</option>
                        </select>
                        <select value={g.perItem}
                          onChange={(e) => updateGroup(g.id, { perItem: e.target.value as 'Per Item'|'Total' })}
                          className="bg-[#424242] rounded-lg px-2 py-2 font-body booking-text text-white text-sm
                                     border border-[#333333] focus:outline-none appearance-none [color-scheme:dark] cursor-pointer flex-1">
                          <option value="Per Item">Per Item</option>
                          <option value="Total">Total</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center mt-3">
                    <div className="flex items-center gap-4">
                      <CheckRow checked={g.nonTiltable}  onChange={(v) => updateGroup(g.id, { nonTiltable: v })}  label="Non-tiltable"  />
                      <CheckRow checked={g.nonStackable} onChange={(v) => updateGroup(g.id, { nonStackable: v })} label="Non-stackable" />
                    </div>
                    {idx > 0 && (
                      <button onClick={() => removeGroup(g.id)}
                        className="ml-auto flex items-center justify-center w-7 h-7 rounded-full
                                   border border-white/10
                                   hover:border-red-400/40 hover:text-red-400 transition-colors cursor-pointer">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <div className="flex justify-center">
              <motion.button onClick={addGroup} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
                className="flex items-center justify-center w-8 h-8 rounded-full
                           border border-white/20
                           hover:border-[var(--color-cyan)]/40 hover:text-[var(--color-cyan)]
                           transition-colors cursor-pointer">
                <Plus size={16} />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Cargo Summary */}
        <motion.div variants={fadeUp}
          className="rounded-2xl bg-[#2A2828] p-5 flex flex-col gap-3
                     border border-white/[0.07] border-t-[3px] border-t-[var(--color-cyan)]"
        >
          <SectionHeader icon={<Truck size={16} />} title="Cargo Summary" />
          <div className="mt-1">
            <span className="pill-cyan !rounded-sm !bg-[#4DF9ED] !text-black w-fit uppercase tracking-widest">
              {mode} Cargo
            </span>
          </div>
          <p className="font-body booking-text text-[11px] lg:!text-[0.9rem] uppercase tracking-[0.15em]">
            {summary.totalPieces > 0
              ? `${summary.totalPieces} pieces across ${groups.length} item group${groups.length !== 1 ? 's' : ''}`
              : 'No pieces added yet'}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <StatCard label="Total Piece"  value={summary.totalPieces > 0 ? String(summary.totalPieces)            : '—'} />
            <StatCard label="Gross Weight" value={summary.grossWeight > 0 ? `${summary.grossWeight.toFixed(1)} KG` : '—'} />
            <StatCard label="Volume"       value={summary.volume      > 0 ? `${summary.volume.toFixed(2)} CBM`     : '—'} />
            <StatCard label="Density"      value={summary.density     > 0 ? `${summary.density.toFixed(2)} KG/CBM` : '—'} />
          </div>
          <div className="flex flex-col gap-1 mt-2">
            {groups.some((g) => g.nonTiltable) && (
              <p className="font-body booking-text text-[11px] lg:!text-[1rem] uppercase tracking-[0.12em]">
                · Non-tiltable items present
              </p>
            )}
            {groups.some((g) => g.nonStackable) && (
              <p className="font-body booking-text text-[11px] lg:!text-[1rem] uppercase tracking-[0.12em]">
                · Non-stackable items present
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Nav buttons */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }} className="flex justify-between pt-2"
      >
        <WizBtn onClick={onBack} variant="back"><ArrowLeft size={16} /> BACK</WizBtn>
        <WizBtn onClick={() => isValid && onNext()} variant="next" disabled={!isValid}>
          NEXT <ArrowRight size={16} />
        </WizBtn>
      </motion.div>
    </div>
  )
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white">{icon}</span>
      <h3 className="font-body booking-text text-white font-bold tracking-wide">{title}</h3>
    </div>
  )
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded flex items-center justify-center border transition-all
          ${checked ? 'bg-[var(--color-cyan)] border-[var(--color-cyan)]' : 'bg-transparent border-white/30 hover:border-white/60'}`}>
        {checked && <Check size={10} strokeWidth={3} className="text-[var(--color-bg)]" />}
      </div>
      <span className="font-body booking-text text-xs lg:text-sm">{label}</span>
    </label>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#4DF9ED] bg-white p-3 lg:p-4 flex flex-col gap-2">
      <p className="font-body booking-text text-[#818181] text-[10px] lg:!text-[0.9rem] uppercase tracking-widest leading-none">
        {label}
      </p>
      <p className="font-body booking-text text-black text-2xl lg:text-3xl leading-none tracking-wide whitespace-nowrap truncate">
        {value}
      </p>
    </div>
  )
}

function WizBtn({ onClick, children, variant, disabled }: {
  onClick: () => void; children: React.ReactNode; variant: 'next' | 'back'; disabled?: boolean
}) {
  return (
    <motion.button onClick={onClick}
      whileHover={!disabled ? { scale: 1.04 } : {}}
      whileTap={!disabled  ? { scale: 0.96 } : {}}
      className={`flex items-center gap-2 px-6 lg:px-8 py-3 rounded-xl
                  font-body booking-text text-base lg:text-lg transition-all duration-300
                  ${disabled
                    ? 'glass text-white/20 border border-white/[0.06] cursor-not-allowed'
                    : variant === 'next'
                      ? 'glass text-white border border-white/20 hover:border-[var(--color-cyan)]/40 cursor-pointer'
                      : 'bg-transparent border border-white/10 hover:text-white hover:border-white/20 cursor-pointer'
                  }`}>
      {children}
    </motion.button>
  )
}