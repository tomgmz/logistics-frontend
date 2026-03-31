'use client'

import { motion, Variants, AnimatePresence } from 'framer-motion'
import { useEffect, useCallback, useRef } from 'react'
import {
  ArrowRight, ArrowLeft,
  CalendarDays, Clock, MapPin, Package,
  Truck, Plus, X, Check,
} from 'lucide-react'
import { useSessionState } from '../../hooks/UseSessionState'
import PlacesInput from './PlacesInput'
import './BookingDetails.css'

import TextField from '@mui/material/TextField'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import { SxProps, Theme } from '@mui/material/styles'

interface Props {
  onNext: () => void
  onBack: () => void
}

type CargoMode = 'loose' | 'palletized'

interface ItemGroup {
  id: string
  // loose fields
  pieces: string
  looseLength: string
  looseWidth: string
  looseHeight: string
  weight: string
  weightUnit: 'kg' | 'lbs'
  perItem: 'Per Item' | 'Total'
  nonTiltable: boolean
  nonStackable: boolean
  // palletized fields
  numPallets: string
  palletType: 'Standard' | 'Euro' | 'Half' | 'Custom'
  palletLength: string
  palletWidth: string
  palletHeight: string
  palletWeightUnit: 'kg' | 'lbs'
  grossWeightPerPallet: string
  netWeightPerPallet: string
  stackable: boolean
  oversize: boolean
  commodity: string
  product: string
  shc: string
  additionalShc: string
}

interface DropoffSection {
  dropoffIndex: number
  groups: ItemGroup[]
}

const PALLET_DIMENSIONS: Record<
  ItemGroup['palletType'],
  { palletLength: string; palletWidth: string; palletHeight: string }
> = {
  Standard: { palletLength: '120', palletWidth: '100', palletHeight: '' },
  Euro:     { palletLength: '120', palletWidth: '80',  palletHeight: '' },
  Half:     { palletLength: '60',  palletWidth: '80',  palletHeight: '' },
  Custom:   { palletLength: '',    palletWidth: '',    palletHeight: '' },
}

// MUI DESIGN
const INPUT_BG_CARD  = '#424242'
const INPUT_BG_PANEL = '#2A2828'
const BORDER_CARD    = '#333333'
const BORDER_PANEL   = 'rgba(255,255,255,0.12)'
const CYAN           = '#4DF9ED'
const RADIUS         = '8px'

function fieldSx(bg: string, borderColor: string): SxProps<Theme> {
  return {
    '& .MuiInputBase-root': {
      height: 36,
      borderRadius: RADIUS,
      backgroundColor: bg,
      color: '#fff',
      fontSize: '0.875rem',
      fontFamily: 'inherit',
    },
    '& .MuiInputBase-input': {
      padding: '0 12px',
      height: 36,
      boxSizing: 'border-box',
      '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor,
      borderRadius: RADIUS,
    },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66` },
    '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: `${CYAN}66`,
      borderWidth: 1,
    },
    '& .MuiInputLabel-root': { display: 'none' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

function selectSx(bg: string, borderColor: string): SxProps<Theme> {
  return {
    height: 36,
    borderRadius: RADIUS,
    backgroundColor: bg,
    color: '#fff',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    '& .MuiSelect-select': {
      padding: '0 32px 0 10px !important',
      height: '36px !important',
      display: 'flex',
      alignItems: 'center',
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor,
      borderRadius: RADIUS,
    },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66` },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: `${CYAN}66`,
      borderWidth: 1,
    },
    '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

const MENU_PROPS = {
  PaperProps: {
    sx: {
      bgcolor: '#2A2828',
      color: '#fff',
      border: `1px solid ${BORDER_CARD}`,
      borderRadius: RADIUS,
      '& .MuiMenuItem-root': {
        fontSize: '0.875rem',
        fontFamily: 'inherit',
        '&:hover':              { bgcolor: 'rgba(77,249,237,0.08)' },
        '&.Mui-selected':       { bgcolor: 'rgba(77,249,237,0.14)' },
        '&.Mui-selected:hover': { bgcolor: 'rgba(77,249,237,0.20)' },
      },
    },
  },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38 } },
}
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
}

function calcSummary(sections: DropoffSection[], mode: CargoMode) {
  let totalPieces = 0
  let grossWeight = 0
  let netWeight   = 0
  let volume      = 0

  for (const section of sections) {
    for (const g of section.groups) {
      if (mode === 'palletized') {
        const pallets = Number(g.numPallets)           || 0
        const gross   = Number(g.grossWeightPerPallet) || 0
        const net     = Number(g.netWeightPerPallet)   || 0
        totalPieces += pallets
        grossWeight += pallets * gross
        netWeight   += pallets * net
      } else {
        const pieces = Number(g.pieces)
        const length = Number(g.looseLength)
        const width  = Number(g.looseWidth)
        const height = Number(g.looseHeight)
        const weight = Number(g.weight)

        if (!Number.isFinite(pieces) || pieces <= 0) continue
        if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) continue
        if (!Number.isFinite(weight) || weight < 0) continue
        totalPieces += pieces
        const weightKG = g.weightUnit === 'lbs' ? weight * 0.453592 : weight
        grossWeight += g.perItem === 'Per Item' ? pieces * weightKG : weightKG
        volume += pieces * (length * width * height) / 1_000_000
      }
    }
  }
  const density = volume > 0 ? grossWeight / volume : 0
  return { totalPieces, grossWeight, netWeight, volume, density }
}

export default function StepBookingDetails({ onNext, onBack }: Props) {
  const [date,     setDate]     = useSessionState('booking:date', '')
  const [time,     setTime]     = useSessionState('booking:time', '')
  const [pickup,   setPickup]   = useSessionState('booking:pickup', '')
  const [dropoffs, setDropoffs] = useSessionState<string[]>('booking:dropoffs', [''])
  const [mode,     setMode]     = useSessionState<CargoMode>('booking:mode', 'loose')
  const [allNonTiltable,  setAllNonTiltable]  = useSessionState('booking:allNonTiltable', false)
  const [allNonStackable, setAllNonStackable] = useSessionState('booking:allNonStackable', false)
  const [allStackable,    setAllStackable]    = useSessionState('booking:allStackable', false)
  const [allOversize,     setAllOversize]     = useSessionState('booking:allOversize', false)

  const makeGroup = useCallback((): ItemGroup => ({
    id: crypto.randomUUID(),
    pieces: '', looseLength: '', looseWidth: '', looseHeight: '',
    weight: '', weightUnit: 'kg', perItem: 'Per Item',
    nonTiltable: false, nonStackable: false,
    numPallets: '', palletType: 'Standard',
    ...PALLET_DIMENSIONS['Standard'],
    palletWeightUnit: 'kg',
    grossWeightPerPallet: '', netWeightPerPallet: '',
    stackable: false, oversize: false,
    commodity: '', product: '', shc: '', additionalShc: '',
  }), [])

  const [sections, setSections] = useSessionState<DropoffSection[]>(
    'booking:sections',
    [{ dropoffIndex: 0, groups: [makeGroup()] }],
  )

  const syncedSections: DropoffSection[] = dropoffs.map((_, i) => {
    const existing = sections.find((s) => s.dropoffIndex === i)
    return existing ?? { dropoffIndex: i, groups: [makeGroup()] }
  })

  useEffect(() => {
    setSections((prev) =>
      dropoffs.map((_, i) => {
        const existing = prev.find((s) => s.dropoffIndex === i)
        return existing ?? { dropoffIndex: i, groups: [makeGroup()] }
      })
    )
  }, [dropoffs, setSections, makeGroup])

  useEffect(() => {
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        groups: section.groups.map((g) => ({ ...g, nonTiltable: allNonTiltable })),
      }))
    )
  }, [allNonTiltable, setSections])

  useEffect(() => {
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        groups: section.groups.map((g) => ({ ...g, nonStackable: allNonStackable })),
      }))
    )
  }, [allNonStackable, setSections])

  useEffect(() => {
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        groups: section.groups.map((g) => ({ ...g, stackable: allStackable })),
      }))
    )
  }, [allStackable, setSections])

  useEffect(() => {
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        groups: section.groups.map((g) => ({ ...g, oversize: allOversize })),
      }))
    )
  }, [allOversize, setSections])

  const updateSection = (dropoffIndex: number, groups: ItemGroup[]) => {
    setSections(syncedSections.map((s) =>
      s.dropoffIndex === dropoffIndex ? { ...s, groups } : s,
    ))
  }

  const updateGroup = (dropoffIndex: number, groupId: string, patch: Partial<ItemGroup>) => {
    const section = syncedSections.find((s) => s.dropoffIndex === dropoffIndex)
    if (!section) return
    updateSection(dropoffIndex, section.groups.map((g) =>
      g.id === groupId ? { ...g, ...patch } : g,
    ))
  }

  const removeGroup = (dropoffIndex: number, groupId: string) => {
    const section = syncedSections.find((s) => s.dropoffIndex === dropoffIndex)
    if (!section) return
    updateSection(dropoffIndex, section.groups.filter((g) => g.id !== groupId))
  }

  const addGroup = (dropoffIndex: number) => {
    const section = syncedSections.find((s) => s.dropoffIndex === dropoffIndex)
    if (!section) return
    updateSection(dropoffIndex, [...section.groups, makeGroup()])
  }

  const makeDropoffSetter = useCallback(
    (index: number) => (val: string) =>
      setDropoffs((prev) => prev.map((x, j) => (j === index ? val : x))),
    [setDropoffs],
  )

  const addDropoff = () => {
    const newIndex = dropoffs.length
    setDropoffs([...dropoffs, ''])
    setSections([...syncedSections, { dropoffIndex: newIndex, groups: [makeGroup()] }])
  }

  const removeDropoff = (index: number) => {
    setDropoffs(dropoffs.filter((_, j) => j !== index))
    setSections(
      syncedSections
        .filter((s) => s.dropoffIndex !== index)
        .map((s, newIndex) => ({ ...s, dropoffIndex: newIndex })),
    )
  }

  const summary = calcSummary(syncedSections, mode)

  const allGroups = syncedSections.flatMap((s) => s.groups)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const timeInputRef = useRef<HTMLInputElement>(null)

  const isValid = pickup.trim() !== '' && dropoffs[0]?.trim() !== '' && date.trim() !== ''

  return (
    <div className="flex flex-col h-full p-4 lg:p-6 gap-3 sm:gap-6 overflow-auto">

      {/* Row 1*/}
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
            <TextField
              fullWidth
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              variant="outlined"
              inputRef={dateInputRef}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <CalendarDays
                      size={16}
                      className="cursor-pointer text-white/40 hover:text-white transition-colors"
                      onClick={() => dateInputRef.current?.showPicker()}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{
                ...fieldSx(INPUT_BG_PANEL, BORDER_PANEL),
                '& input[type="date"]::-webkit-calendar-picker-indicator': { display: 'none' },
                '& .MuiInputBase-input': { padding: '0 0 0 12px', height: 36, boxSizing: 'border-box', colorScheme: 'dark' },
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-body booking-text text-xs">Time</span>
            <TextField
              fullWidth
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              variant="outlined"
              inputRef={timeInputRef}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Clock
                      size={16}
                      className="cursor-pointer text-white/40 hover:text-white transition-colors"
                      onClick={() => timeInputRef.current?.showPicker()}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{
                ...fieldSx(INPUT_BG_PANEL, BORDER_PANEL),
                '& input[type="time"]::-webkit-calendar-picker-indicator': { display: 'none' },
                '& .MuiInputBase-input': { padding: '0 0 0 12px', height: 36, boxSizing: 'border-box', colorScheme: 'dark' },
              }}
            />
          </div>
        </motion.div>

        {/* Pickup */}
        <motion.div variants={fadeUp}
          className="bg-[#2A2828] rounded-2xl border border-white/[0.07] p-4 flex flex-col gap-3"
        >
          <SectionHeader icon={<Truck size={16} />} title="Pick Up Point" />
          <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2">
            <PlacesInput value={pickup} onChange={setPickup} placeholder="Enter pickup location" showIcon={false} />
            <MapPin size={15} className="shrink-0" />
          </div>
        </motion.div>

        {/* Dropoff */}
        <motion.div variants={fadeUp}
          className="bg-[#2A2828] rounded-2xl border border-white/[0.07] p-4 flex flex-col gap-2"
        >
          <SectionHeader icon={<MapPin size={16} />} title="Drop Off Point" />
          <div className="flex flex-col gap-2 mt-1">
            {dropoffs.map((d, i) => (
              <div key={i}
                className="flex items-center gap-2 border-b border-white/[0.07] pb-2 last:border-0 last:pb-0"
              >
                <PlacesInput value={d} onChange={makeDropoffSetter(i)} placeholder="Enter drop-off location" showIcon={false} />
                {i > 0 && (
                  <button onClick={() => removeDropoff(i)}
                    className="hover:text-red-400 transition-colors cursor-pointer shrink-0">
                    <X size={13} />
                  </button>
                )}
                <MapPin size={15} className="shrink-0" />
              </div>
            ))}
            {dropoffs.length < 3 && (
              <button onClick={addDropoff}
                className="flex items-center gap-1 text-[var(--color-cyan)] font-body booking-text
                           text-xs mt-1 hover:opacity-80 transition-opacity cursor-pointer w-fit">
                <Plus size={13} /> Add drop-off
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Product & Cargo Capacity */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="bg-[#2A2828] rounded-2xl border border-white/[0.07] p-4 flex flex-col gap-4"
      >
        {/* Header row */}
        <div className="flex items-center justify-between">
          <SectionHeader icon={<Package size={16} />} title="Product & Cargo Capacity" />
        </div>

        {/* Mode tabs */}
        <div className="flex items-center gap-6 border-b border-white/[0.07]">
          {(['loose', 'palletized'] as CargoMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`pb-2 font-body booking-text text-sm capitalize transition-colors cursor-pointer
                ${mode === m ? 'text-white border-b-2 border-white -mb-px' : 'text-[var(--color-muted)] hover:text-white'}`}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-6">
            {mode === 'loose' ? (
              <>
                <CheckRow checked={allNonTiltable}  onChange={setAllNonTiltable}  label="All Non-tiltable"  />
                <CheckRow checked={allNonStackable} onChange={setAllNonStackable} label="All Non-stackable" />
              </>
            ) : (
              <>
                <CheckRow checked={allStackable} onChange={setAllStackable} label="All Stackable" />
                <CheckRow checked={allOversize}  onChange={setAllOversize}  label="All Oversize"  />
              </>
            )}
          </div>
        </div>

        {/* Per-dropoff sections */}
        <div className="flex flex-col gap-6">
          <AnimatePresence>
            {syncedSections.map((section) => {
              const dropoffLabel = dropoffs[section.dropoffIndex]?.trim() || `Drop-off ${section.dropoffIndex + 1}`

              return (
                <motion.div key={section.dropoffIndex}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col gap-3"
                >
                  {/* Dropoff location label with underline */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className="text-white/40 shrink-0" />
                      <span className="font-body booking-text text-sm text-white/80 truncate">
                        {dropoffLabel}
                      </span>
                    </div>
                    <div className="border-b border-white/[0.12] w-full" />
                  </div>

                  {/* Item groups for this dropoff */}
                  <div className="flex flex-col gap-3">
                    <AnimatePresence>
                      {section.groups.map((g, idx) => (
                        <motion.div key={g.id}
                          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                          className="bg-[#424242] rounded-xl p-3 lg:p-4 border border-white/[0.07]"
                        >
                          {/* Product label */}
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-body booking-text text-sm font-bold text-[var(--color-cyan)]">
                              Product #{idx + 1}
                            </span>
                            {idx > 0 && (
                              <button onClick={() => removeGroup(section.dropoffIndex, g.id)}
                                className="flex items-center justify-center w-6 h-6 rounded-full
                                           border border-white/10 hover:border-red-400/40 hover:text-red-400
                                           transition-colors cursor-pointer">
                                <X size={12} />
                              </button>
                            )}
                          </div>

                          <ProductFieldsRow
                            group={g}
                            onUpdate={(patch) => updateGroup(section.dropoffIndex, g.id, patch)}
                          />

                          {/* Divider */}
                          <div className="border-t border-white/[0.07] my-3" />

                          {/* LOOSE */}
                          {mode === 'loose' && (
                            <div className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-3 lg:flex lg:items-end lg:gap-2">
                              {/* Pieces */}
                              <div className="flex flex-col gap-1">
                                <label className="font-body booking-text text-xs whitespace-nowrap">Pieces</label>
                                <TextField value={g.pieces}
                                  onChange={(e) => updateGroup(section.dropoffIndex, g.id, { pieces: e.target.value })}
                                  placeholder="0" variant="outlined"
                                  sx={{ ...fieldSx(INPUT_BG_CARD, BORDER_CARD), width: 90 }} />
                              </div>
                              {/* Dimensions */}
                              <div className="flex flex-col gap-1 min-w-0">
                                <label className="font-body booking-text text-xs whitespace-nowrap">
                                  Dimensions <span className="text-white/20">(cm)</span>
                                </label>
                                <div className="flex gap-1.5">
                                  {(['looseLength', 'looseWidth', 'looseHeight'] as const).map((dim) => (
                                    <TextField key={dim} value={g[dim]}
                                      onChange={(e) => updateGroup(section.dropoffIndex, g.id, { [dim]: e.target.value })}
                                      placeholder={dim === 'looseLength' ? 'L' : dim === 'looseWidth' ? 'W' : 'H'}
                                      variant="outlined"
                                      sx={{ ...fieldSx(INPUT_BG_CARD, BORDER_CARD), flex: 1, minWidth: 0 }} />
                                  ))}
                                </div>
                              </div>
                              {/* Weight */}
                              <div className="flex flex-col gap-1 col-span-2 lg:col-span-1 lg:shrink-0">
                                <label className="font-body booking-text text-xs whitespace-nowrap">Weight</label>
                                <div className="flex gap-1.5">
                                  <TextField value={g.weight}
                                    onChange={(e) => updateGroup(section.dropoffIndex, g.id, { weight: e.target.value })}
                                    placeholder="0" variant="outlined"
                                    sx={{ ...fieldSx(INPUT_BG_CARD, BORDER_CARD), width: 64 }} />
                                  <Select value={g.weightUnit}
                                    onChange={(e: SelectChangeEvent) =>
                                      updateGroup(section.dropoffIndex, g.id, { weightUnit: e.target.value as 'kg' | 'lbs' })}
                                    sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: 64 }} MenuProps={MENU_PROPS}>
                                    <MenuItem value="kg">kg</MenuItem>
                                    <MenuItem value="lbs">lbs</MenuItem>
                                  </Select>
                                  <Select value={g.perItem}
                                    onChange={(e: SelectChangeEvent) =>
                                      updateGroup(section.dropoffIndex, g.id, { perItem: e.target.value as 'Per Item' | 'Total' })}
                                    sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), flex: 1 }} MenuProps={MENU_PROPS}>
                                    <MenuItem value="Per Item">Per Item</MenuItem>
                                    <MenuItem value="Total">Total</MenuItem>
                                  </Select>
                                </div>
                              </div>
                              <div className="hidden lg:flex flex-row items-end gap-4 pb-0.5 ml-2 shrink-0">
                                <CheckRow checked={g.nonTiltable}
                                  onChange={(v) => updateGroup(section.dropoffIndex, g.id, { nonTiltable: v })}
                                  label="Non-tiltable" />
                                <CheckRow checked={g.nonStackable}
                                  onChange={(v) => updateGroup(section.dropoffIndex, g.id, { nonStackable: v })}
                                  label="Non-stackable" />
                              </div>
                            </div>
                          )}

                          {/* PALLETIZED */}
                          {mode === 'palletized' && (
                            <div className="flex flex-wrap items-end gap-2">
                              {/* No. of Pallets */}
                              <div className="flex flex-col gap-1 w-full sm:w-[140px]">
                                <label className="font-body booking-text text-xs whitespace-nowrap">No. of Pallets</label>
                                <TextField fullWidth value={g.numPallets}
                                  onChange={(e) => updateGroup(section.dropoffIndex, g.id, { numPallets: e.target.value })}
                                  placeholder="0" variant="outlined" sx={fieldSx(INPUT_BG_CARD, BORDER_CARD)} />
                              </div>
                              {/* Pallet Type */}
                              <div className="flex flex-col gap-1 w-full sm:w-[180px]">
                                <label className="font-body booking-text text-xs whitespace-nowrap">Pallet Type</label>
                                <Select value={g.palletType}
                                  onChange={(e: SelectChangeEvent) => {
                                    const type = e.target.value as ItemGroup['palletType']
                                    updateGroup(section.dropoffIndex, g.id, { palletType: type, ...PALLET_DIMENSIONS[type] })
                                  }}
                                  sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: '100%' }} MenuProps={MENU_PROPS}>
                                  <MenuItem value="Standard">Standard (120×100)</MenuItem>
                                  <MenuItem value="Euro">Euro (120×80)</MenuItem>
                                  <MenuItem value="Half">Half (60×80)</MenuItem>
                                  <MenuItem value="Custom">Custom</MenuItem>
                                </Select>
                              </div>
                              {/* Dimensions */}
                              <div className="flex flex-col gap-1 w-full min-w-[220px] flex-1">
                                <label className="font-body booking-text text-xs whitespace-nowrap">
                                  Dimensions <span className="text-white/20">(cm)</span>
                                </label>
                                <div className="flex gap-1.5 items-center">
                                  {(['palletLength', 'palletWidth', 'palletHeight'] as const).map((dim) => (
                                    <TextField key={dim} value={g[dim]}
                                      onChange={(e) => updateGroup(section.dropoffIndex, g.id, { [dim]: e.target.value })}
                                      placeholder={dim === 'palletLength' ? 'L' : dim === 'palletWidth' ? 'W' : 'H'}
                                      variant="outlined"
                                      sx={{ ...fieldSx(INPUT_BG_CARD, BORDER_CARD), flex: 1, minWidth: 0 }} />
                                  ))}
                                  <Select value={g.palletWeightUnit}
                                    onChange={(e: SelectChangeEvent) =>
                                      updateGroup(section.dropoffIndex, g.id, { palletWeightUnit: e.target.value as 'kg' | 'lbs' })}
                                    sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: 64, flexShrink: 0 }} MenuProps={MENU_PROPS}>
                                    <MenuItem value="kg">kg</MenuItem>
                                    <MenuItem value="lbs">lbs</MenuItem>
                                  </Select>
                                </div>
                              </div>
                              {/* Gross weight per pallet */}
                              <div className="flex flex-col gap-1 w-full sm:w-[180px]">
                                <label className="font-body booking-text text-xs whitespace-nowrap">Gross weight per pallet</label>
                                <div className="relative inline-flex">
                                  <TextField fullWidth value={g.grossWeightPerPallet}
                                    onChange={(e) => updateGroup(section.dropoffIndex, g.id, { grossWeightPerPallet: e.target.value })}
                                    placeholder="0" variant="outlined"
                                    sx={{
                                      ...fieldSx(INPUT_BG_CARD, BORDER_CARD),
                                      '& .MuiInputBase-input': {
                                        padding: '0 36px 0 12px', height: 36, boxSizing: 'border-box',
                                        '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
                                      },
                                    }} />
                                  <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[#333333]">
                                    <button onClick={() => updateGroup(section.dropoffIndex, g.id, { grossWeightPerPallet: String((Number(g.grossWeightPerPallet) || 0) + 1) })}
                                      className="flex-1 px-1.5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-tr-lg transition-colors cursor-pointer text-[9px] leading-none">▲</button>
                                    <button onClick={() => updateGroup(section.dropoffIndex, g.id, { grossWeightPerPallet: String(Math.max(0, (Number(g.grossWeightPerPallet) || 0) - 1)) })}
                                      className="flex-1 px-1.5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-br-lg border-t border-[#333333] transition-colors cursor-pointer text-[9px] leading-none">▼</button>
                                  </div>
                                </div>
                              </div>
                              {/* Net weight per pallet */}
                              <div className="flex flex-col gap-1 w-full sm:w-[180px]">
                                <label className="font-body booking-text text-xs whitespace-nowrap">Net weight per pallet</label>
                                <div className="relative inline-flex">
                                  <TextField fullWidth value={g.netWeightPerPallet}
                                    onChange={(e) => updateGroup(section.dropoffIndex, g.id, { netWeightPerPallet: e.target.value })}
                                    placeholder="0" variant="outlined"
                                    sx={{
                                      ...fieldSx(INPUT_BG_CARD, BORDER_CARD),
                                      '& .MuiInputBase-input': {
                                        padding: '0 36px 0 12px', height: 36, boxSizing: 'border-box',
                                        '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
                                      },
                                    }} />
                                  <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[#333333]">
                                    <button onClick={() => updateGroup(section.dropoffIndex, g.id, { netWeightPerPallet: String((Number(g.netWeightPerPallet) || 0) + 1) })}
                                      className="flex-1 px-1.5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-tr-lg transition-colors cursor-pointer text-[9px] leading-none">▲</button>
                                    <button onClick={() => updateGroup(section.dropoffIndex, g.id, { netWeightPerPallet: String(Math.max(0, (Number(g.netWeightPerPallet) || 0) - 1)) })}
                                      className="flex-1 px-1.5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-br-lg border-t border-[#333333] transition-colors cursor-pointer text-[9px] leading-none">▼</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center mt-3">
                            <div className="flex items-center gap-4">
                              {mode === 'loose' ? (
                                <div className="flex items-center gap-4 lg:hidden">
                                  <CheckRow checked={g.nonTiltable}
                                    onChange={(v) => updateGroup(section.dropoffIndex, g.id, { nonTiltable: v })}
                                    label="Non-tiltable" />
                                  <CheckRow checked={g.nonStackable}
                                    onChange={(v) => updateGroup(section.dropoffIndex, g.id, { nonStackable: v })}
                                    label="Non-stackable" />
                                </div>
                              ) : (
                                <>
                                  <CheckRow checked={g.stackable}
                                    onChange={(v) => updateGroup(section.dropoffIndex, g.id, { stackable: v })}
                                    label="Stackable" />
                                  <CheckRow checked={g.oversize}
                                    onChange={(v) => updateGroup(section.dropoffIndex, g.id, { oversize: v })}
                                    label="Oversize" />
                                  {g.oversize && (
                                    <span className="font-body booking-text text-xs text-[var(--color-cyan)]">
                                      Oversize may incur extra charges
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <motion.button onClick={() => addGroup(section.dropoffIndex)}
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-white/10
                                 font-body booking-text text-sm text-white/50 hover:border-white/20 hover:text-white/80
                                 transition-all cursor-pointer">
                      <Plus size={15} /> Add another product
                    </motion.button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Cargo Summary */}
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        className="rounded-2xl bg-[#2A2828] p-5 flex flex-col gap-3
                   border border-white/[0.07] border-t-[3px] border-t-[var(--color-cyan)]"
      >
        <SectionHeader icon={<Truck size={16} />} title="Cargo Summary" />
        <div className="flex items-center gap-3 mt-1">
          <span className="pill-cyan !rounded-sm !bg-[#4DF9ED] !text-black w-fit uppercase tracking-widest">
            {mode} Cargo
          </span>
          <p className="font-body booking-text text-[11px] lg:!text-[0.9rem] uppercase tracking-[0.15em]">
            {summary.totalPieces > 0
              ? mode === 'palletized'
                ? `${summary.totalPieces} pallet${summary.totalPieces !== 1 ? 's' : ''} across ${allGroups.length} group${allGroups.length !== 1 ? 's' : ''}`
                : `${summary.totalPieces} pieces across ${allGroups.length} item group${allGroups.length !== 1 ? 's' : ''}`
              : 'No pieces added yet'}
          </p>
        </div>

        {/* Stat cards row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-1">
          <StatCard label={mode === 'palletized' ? 'Total Pallets' : 'Total Pieces'}
            value={summary.totalPieces > 0 ? String(summary.totalPieces) : '—'} />
          <StatCard label="Gross Weight"
            value={summary.grossWeight > 0 ? `${summary.grossWeight.toFixed(1)} KG` : '—'} />
          <StatCard label="Volume"
            value={summary.volume > 0 ? `${summary.volume.toFixed(2)} CBM` : '—'} />
          {mode === 'palletized'
            ? <StatCard label="Net Weight" value={summary.netWeight > 0 ? `${summary.netWeight.toFixed(1)} KG` : '—'} />
            : <StatCard label="Density"    value={summary.density > 0 ? `${summary.density.toFixed(2)} KG/CBM` : '—'} />}
        </div>

        {/* Flags */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1">
          {mode === 'loose' ? (
            <>
              {allGroups.some((g) => g.nonTiltable) && (
                <p className="font-body booking-text text-[11px] lg:!text-[1rem] uppercase tracking-[0.12em]">· Non-tiltable items present</p>
              )}
              {allGroups.some((g) => g.nonStackable) && (
                <p className="font-body booking-text text-[11px] lg:!text-[1rem] uppercase tracking-[0.12em]">· Non-stackable items present</p>
              )}
            </>
          ) : (
            <>
              {allGroups.some((g) => g.stackable) && (
                <p className="font-body booking-text text-[11px] lg:!text-[1rem] uppercase tracking-[0.12em]">· Stackable pallets</p>
              )}
              {allGroups.some((g) => g.oversize) && (
                <p className="font-body booking-text text-[11px] lg:!text-[1rem] uppercase tracking-[0.12em]">· Oversize pallets</p>
              )}
            </>
          )}
        </div>
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

function ProductFieldsRow({
  group,
  onUpdate,
}: {
  group: ItemGroup
  onUpdate: (patch: Partial<ItemGroup>) => void
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">Commodity</label>
        <TextField
          fullWidth
          placeholder="e.g. Accessories"
          variant="outlined"
          value={group.commodity}
          onChange={(e) => onUpdate({ commodity: e.target.value })}
          sx={fieldSx(INPUT_BG_CARD, BORDER_CARD)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">Product</label>
        <TextField
          fullWidth
          placeholder="e.g. General Cargo"
          variant="outlined"
          value={group.product}
          onChange={(e) => onUpdate({ product: e.target.value })}
          sx={fieldSx(INPUT_BG_CARD, BORDER_CARD)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">SHC</label>
        <Select
          value={group.shc}
          onChange={(e: SelectChangeEvent) => onUpdate({ shc: e.target.value })}
          displayEmpty
          sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: '100%' }}
          MenuProps={MENU_PROPS}
        >
          <MenuItem value=""><em style={{ opacity: 0.4, fontStyle: 'normal' }}>Select SHC</em></MenuItem>
          <MenuItem value="GEN">GEN</MenuItem>
          <MenuItem value="PER">PER</MenuItem>
          <MenuItem value="EAT">EAT</MenuItem>
          <MenuItem value="HEA">HEA</MenuItem>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">Additional SHC</label>
        <Select
          value={group.additionalShc}
          onChange={(e: SelectChangeEvent) => onUpdate({ additionalShc: e.target.value })}
          displayEmpty
          sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: '100%' }}
          MenuProps={MENU_PROPS}
        >
          <MenuItem value=""><em style={{ opacity: 0.4, fontStyle: 'normal' }}>Select additional SHC</em></MenuItem>
          <MenuItem value="FRAGILE">FRAGILE</MenuItem>
          <MenuItem value="PERISHABLE">PERISHABLE</MenuItem>
          <MenuItem value="HAZMAT">HAZMAT</MenuItem>
        </Select>
      </div>
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
      <p className="font-body booking-text text-[#818181] text-[10px] lg:!text-[0.9rem] uppercase tracking-widest leading-none">{label}</p>
      <p className="font-body booking-text text-black text-2xl lg:text-3xl leading-none tracking-wide whitespace-nowrap truncate">{value}</p>
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
      className={`flex items-center gap-2 px-6 lg:px-8 py-3 rounded-xl font-body booking-text text-base lg:text-lg transition-all duration-300
        ${disabled
          ? 'glass text-white/20 border border-white/[0.06] cursor-not-allowed pointer-events-none'
          : variant === 'next'
            ? 'glass text-white border border-white/20 hover:border-[var(--color-cyan)]/40 cursor-pointer'
            : 'bg-transparent border border-white/10 hover:text-white hover:border-white/20 cursor-pointer'
        }`}>
      {children}
    </motion.button>
  )
}