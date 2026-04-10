'use client'

import { motion, Variants, AnimatePresence } from 'framer-motion'
import { useCallback, useState } from 'react'
import {
  CalendarDays, Clock, MapPin, Package,
  Truck, Plus, X, Check,
} from 'lucide-react'
import { useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/lib/store/hooks'
import {
  setDate, setTime, setPickup,
  setPickupCoords,
  updateDropoff, updateDropoffCoords, addDropoff, removeDropoff,
  setMode, setSections,
  updateGroup as updateGroupAction,
  addGroup as addGroupAction,
  removeGroup as removeGroupAction,
  setAllNonTiltable, setAllNonStackable,
  setAllStackable, setAllOversize,
} from '@/app/lib/store/slice/booking.slice'
import type { CargoMode, ItemGroup, DropoffSection } from '@/app/lib/store/slice/booking.slice'
import MapLocationPicker from './MapLocationPicker'
import './BookingDetails.css'

import TextField from '@mui/material/TextField'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import FormHelperText from '@mui/material/FormHelperText'
import { SxProps, Theme } from '@mui/material/styles'
import WizBtn from '../WizButton'

import {
  validateBooking,
  hasAnyErrors,
  getGroupErrors,
  type GroupErrors,
} from '@/app/lib/validation/bookingValidation'

import type { ResolvedPlace } from '@/app/lib/hooks/usePlacesAutoComplete'

interface Props {
  onNext: () => void
  onBack: () => void
}

type MapPickerTarget =
  | { kind: 'pickup' }
  | { kind: 'dropoff'; index: number }
  | null

const PALLET_DIMENSIONS: Record<
  ItemGroup['palletType'],
  { palletLength: string; palletWidth: string; palletHeight: string }
> = {
  Standard: { palletLength: '120', palletWidth: '100', palletHeight: '' },
  Euro:     { palletLength: '120', palletWidth: '80',  palletHeight: '' },
  Half:     { palletLength: '60',  palletWidth: '80',  palletHeight: '' },
  Custom:   { palletLength: '',    palletWidth: '',    palletHeight: '' },
}

const INPUT_BG_CARD  = '#424242'
const INPUT_BG_PANEL = '#2A2828'
const BORDER_CARD    = '#333333'
const BORDER_PANEL   = 'rgba(255,255,255,0.12)'
const CYAN           = '#4DF9ED'
const RED            = '#f87171'
const ERROR_COLOR    = '#f87171'
const RADIUS         = '8px'

function fieldSx(bg: string, borderColor: string, hasError = false): SxProps<Theme> {
  const activeBorder = hasError ? ERROR_COLOR : `${CYAN}66`
  const idleBorder   = hasError ? `${ERROR_COLOR}99` : borderColor
  return {
    '& .MuiInputBase-root': {
      height: 36, borderRadius: RADIUS, backgroundColor: bg,
      color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
    },
    '& .MuiInputBase-input': {
      padding: '0 12px', height: 36, boxSizing: 'border-box',
      '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
    },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: idleBorder, borderRadius: RADIUS },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: activeBorder },
    '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: activeBorder, borderWidth: 1 },
    '& .MuiInputLabel-root': { display: 'none' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

function selectSx(bg: string, borderColor: string, hasError = false): SxProps<Theme> {
  const activeBorder = hasError ? ERROR_COLOR : `${CYAN}66`
  const idleBorder   = hasError ? `${ERROR_COLOR}99` : borderColor
  return {
    height: 36, borderRadius: RADIUS, backgroundColor: bg,
    color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
    '& .MuiSelect-select': {
      padding: '0 32px 0 10px !important', height: '36px !important',
      display: 'flex', alignItems: 'center',
    },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: idleBorder, borderRadius: RADIUS },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: activeBorder },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: activeBorder, borderWidth: 1 },
    '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

const HELPER_SX: SxProps<Theme> = {
  color: ERROR_COLOR, fontSize: '0.7rem', marginTop: '3px',
  marginLeft: '2px', fontFamily: 'inherit', lineHeight: 1.3,
}

const MENU_PROPS = {
  PaperProps: {
    sx: {
      bgcolor: '#2A2828', color: '#fff',
      border: `1px solid ${BORDER_CARD}`, borderRadius: RADIUS,
      '& .MuiMenuItem-root': {
        fontSize: '0.875rem', fontFamily: 'inherit',
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
  let totalPieces = 0, grossWeight = 0, netWeight = 0, volume = 0
  for (const section of sections) {
    for (const g of section.groups) {
      if (mode === 'palletized') {
        const pallets = Number(g.numPallets) || 0
        const gross   = Number(g.grossWeightPerPallet) || 0
        const net     = Number(g.netWeightPerPallet)   || 0
        if (pallets <= 0) continue
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
        if (!Number.isFinite(length) || length <= 0 ||
            !Number.isFinite(width)  || width  <= 0 ||
            !Number.isFinite(height) || height <= 0) continue
        if (!Number.isFinite(weight) || weight <= 0) continue
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

export function makeDefaultGroup(): ItemGroup {
  return {
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
  }
}

function Req() {
  return <span style={{ color: ERROR_COLOR, marginLeft: 2 }}>*</span>
}

function LocationField({
  value,
  placeholder,
  hasError,
  errorMsg,
  accentColor,
  onClick,
}: {
  value: string
  placeholder: string
  hasError?: boolean
  errorMsg?: string
  accentColor: string
  onClick: () => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-2 px-3 text-left transition-all
                   hover:opacity-90 active:scale-[0.99] cursor-pointer"
        style={{
          height: 36,
          background: INPUT_BG_PANEL,
          border: `1px solid ${hasError ? `${ERROR_COLOR}99` : BORDER_PANEL}`,
          borderRadius: RADIUS,
          outline: 'none',
        }}
      >
        <MapPin size={13} style={{ color: accentColor, flexShrink: 0 }} />
        <span
          className="flex-1 text-sm truncate"
          style={{ color: value ? '#fff' : 'rgba(255,255,255,0.3)' }}
        >
          {value || placeholder}
        </span>
      </button>
      {hasError && errorMsg && (
        <FormHelperText sx={HELPER_SX}>{errorMsg}</FormHelperText>
      )}
    </div>
  )
}

export default function StepBookingDetails({ onNext, onBack }: Props) {
  const dispatch = useAppDispatch()

  const date            = useAppSelector((s) => s.booking.date)
  const time            = useAppSelector((s) => s.booking.time)
  const pickup          = useAppSelector((s) => s.booking.pickup)
  const dropoffs        = useAppSelector((s) => s.booking.dropoffs)
  const mode            = useAppSelector((s) => s.booking.mode)
  const sections        = useAppSelector((s) => s.booking.sections)
  const allNonTiltable  = useAppSelector((s) => s.booking.allNonTiltable)
  const allNonStackable = useAppSelector((s) => s.booking.allNonStackable)
  const allStackable    = useAppSelector((s) => s.booking.allStackable)
  const allOversize     = useAppSelector((s) => s.booking.allOversize)

  const [touched,     setTouched]     = useState(false)
  const [mapTarget,   setMapTarget]   = useState<MapPickerTarget>(null)

  const syncedSections: DropoffSection[] = dropoffs.map((_, i) => {
    const existing = sections.find((s) => s.dropoffIndex === i)
    return existing ?? { dropoffIndex: i, groups: [makeDefaultGroup()] }
  })

  if (sections.length !== dropoffs.length) {
    dispatch(setSections(syncedSections))
  }

  const rawErrors = validateBooking(date, time, pickup, dropoffs, syncedSections, mode)
  const errors    = touched ? rawErrors : { schedule: {}, route: { dropoffs: {} }, sections: [] }

  const handleNext = () => {
    setTouched(true)
    if (hasAnyErrors(rawErrors)) return
    onNext()
  }

  const handleAddDropoff = () => {
    dispatch(addDropoff())
    dispatch(setSections([
      ...syncedSections,
      { dropoffIndex: dropoffs.length, groups: [makeDefaultGroup()] },
    ]))
  }

  const handleUpdateGroup = (dropoffIndex: number, groupId: string, patch: Partial<ItemGroup>) =>
    dispatch(updateGroupAction({ dropoffIndex, groupId, patch }))

  const handleRemoveGroup = (dropoffIndex: number, groupId: string) =>
    dispatch(removeGroupAction({ dropoffIndex, groupId }))

  const handleAddGroup = (dropoffIndex: number) =>
    dispatch(addGroupAction({ dropoffIndex, newGroup: makeDefaultGroup() }))

  const handleMapConfirm = useCallback(
    (place: ResolvedPlace) => {
      if (!mapTarget) return
      if (mapTarget.kind === 'pickup') {
        dispatch(setPickup(place.address))
        dispatch(setPickupCoords({ lat: place.latitude, lng: place.longitude }))
      } else {
        dispatch(updateDropoff({ index: mapTarget.index, value: place.address }))
        dispatch(updateDropoffCoords({ index: mapTarget.index, lat: place.latitude, lng: place.longitude }))
      }
      setMapTarget(null)
    },
    [dispatch, mapTarget],
  )

  const summary      = calcSummary(syncedSections, mode)
  const allGroups    = syncedSections.flatMap((s) => s.groups)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const timeInputRef = useRef<HTMLInputElement>(null)

  const mapInitialValue = mapTarget
    ? mapTarget.kind === 'pickup'
      ? pickup
      : dropoffs[mapTarget.index] ?? ''
    : ''

  const mapPickerMode: 'pickup' | 'dropoff' =
    mapTarget?.kind === 'pickup' ? 'pickup' : 'dropoff'

  return (
    <div className="relative flex flex-col h-full overflow-hidden">

      <AnimatePresence>
        {mapTarget && (
          <motion.div
            key="map-picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50"
          >
            <MapLocationPicker
              mode={mapPickerMode}
              onConfirm={handleMapConfirm}
              onClose={() => setMapTarget(null)}
              initialValue={mapInitialValue}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-auto p-4 lg:p-6 flex flex-col gap-3 sm:gap-6">

        <motion.div variants={stagger} initial="hidden" animate="show"
          className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6"
        >
          {/* TransitSched */}
          <motion.div variants={fadeUp}
            className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-3"
          >
            <SectionHeader icon={<CalendarDays size={16} />} title="Transit Schedule" />

            <div className="flex flex-col gap-1">
              <span className="font-body booking-text text-xs">Date<Req /></span>
              <TextField
                fullWidth type="date" value={date}
                onChange={(e) => dispatch(setDate(e.target.value))}
                variant="outlined" inputRef={dateInputRef}
                error={!!errors.schedule.date}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <CalendarDays size={16}
                        className="cursor-pointer text-white/40 hover:text-white transition-colors"
                        onClick={() => dateInputRef.current?.showPicker()} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  ...fieldSx(INPUT_BG_PANEL, BORDER_PANEL, !!errors.schedule.date),
                  '& input[type="date"]::-webkit-calendar-picker-indicator': { display: 'none' },
                  '& .MuiInputBase-input': { padding: '0 0 0 12px', height: 36, boxSizing: 'border-box', colorScheme: 'dark' },
                }}
              />
              {errors.schedule.date && <FormHelperText sx={HELPER_SX}>{errors.schedule.date}</FormHelperText>}
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-body booking-text text-xs">Time<Req /></span>
              <TextField
                fullWidth type="time" value={time}
                onChange={(e) => dispatch(setTime(e.target.value))}
                variant="outlined" inputRef={timeInputRef}
                error={!!errors.schedule.time}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Clock size={16}
                        className="cursor-pointer text-white/40 hover:text-white transition-colors"
                        onClick={() => timeInputRef.current?.showPicker()} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  ...fieldSx(INPUT_BG_PANEL, BORDER_PANEL, !!errors.schedule.time),
                  '& input[type="time"]::-webkit-calendar-picker-indicator': { display: 'none' },
                  '& .MuiInputBase-input': { padding: '0 0 0 12px', height: 36, boxSizing: 'border-box', colorScheme: 'dark' },
                }}
              />
              {errors.schedule.time && <FormHelperText sx={HELPER_SX}>{errors.schedule.time}</FormHelperText>}
            </div>
          </motion.div>

          {/* Pickup */}
          <motion.div variants={fadeUp}
            className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-3"
          >
            <div className="flex items-center">
              <SectionHeader icon={<Truck size={16} />} title="Pick Up Point" />
              <Req />
            </div>
            <div className="flex flex-col gap-1">
              <LocationField
                value={pickup}
                placeholder="Click to set on map"
                hasError={!!errors.route.pickup}
                errorMsg={errors.route.pickup}
                accentColor={CYAN}
                onClick={() => setMapTarget({ kind: 'pickup' })}
              />
            </div>
          </motion.div>

          {/* Dropoff */}
          <motion.div variants={fadeUp}
            className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-2"
          >
            <div className="flex items-center">
              <SectionHeader icon={<MapPin size={16} />} title="Drop Off Point" />
              <Req />
            </div>
            <div className="flex flex-col gap-2 mt-1">
              {dropoffs.map((d, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <LocationField
                        value={d}
                        placeholder="Click to set on map"
                        hasError={!!errors.route.dropoffs[i]}
                        errorMsg={errors.route.dropoffs[i]}
                        accentColor={RED}
                        onClick={() => setMapTarget({ kind: 'dropoff', index: i })}
                      />
                    </div>
                    {i > 0 && (
                      <button
                        onClick={() => dispatch(removeDropoff(i))}
                        className="hover:text-red-400 transition-colors cursor-pointer shrink-0"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {dropoffs.length < 3 && (
                <button onClick={handleAddDropoff}
                  className="flex items-center gap-1 text-[var(--color-cyan)] font-body booking-text
                             text-xs mt-1 hover:opacity-80 transition-opacity cursor-pointer w-fit">
                  <Plus size={13} /> Add drop-off
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* Productand Cargo Capacity */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-4"
        >
          <SectionHeader icon={<Package size={16} />} title="Product & Cargo Capacity" />

          <div className="flex items-center gap-6 border-b border-white/[0.07]">
            {(['loose', 'palletized'] as CargoMode[]).map((m) => (
              <button key={m} onClick={() => dispatch(setMode(m))}
                className={`pb-2 font-body booking-text text-sm capitalize transition-colors cursor-pointer
                  ${mode === m ? 'text-white border-b-2 border-white -mb-px' : 'text-[var(--color-muted)] hover:text-white'}`}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-6">
              {mode === 'loose' ? (
                <>
                  <CheckRow checked={allNonTiltable}  onChange={(v) => dispatch(setAllNonTiltable(v))}  label="All Non-tiltable"  />
                  <CheckRow checked={allNonStackable} onChange={(v) => dispatch(setAllNonStackable(v))} label="All Non-stackable" />
                </>
              ) : (
                <>
                  <CheckRow checked={allStackable} onChange={(v) => dispatch(setAllStackable(v))} label="All Stackable" />
                  <CheckRow checked={allOversize}  onChange={(v) => dispatch(setAllOversize(v))}  label="All Oversize"  />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <AnimatePresence>
              {syncedSections.map((section) => {
                const dropoffLabel = dropoffs[section.dropoffIndex]?.trim() || `Drop-off ${section.dropoffIndex + 1}`
                return (
                  <motion.div key={section.dropoffIndex}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-white/40 shrink-0" />
                        <span className="font-body booking-text text-sm text-white/80 truncate">{dropoffLabel}</span>
                      </div>
                      <div className="border-b border-white/[0.12] w-full" />
                    </div>

                    <div className="flex flex-col gap-3">
                      <AnimatePresence>
                        {section.groups.map((g, idx) => {
                          const gErr = touched
                            ? getGroupErrors(rawErrors.sections, section.dropoffIndex, g.id)
                            : {}
                          return (
                            <motion.div key={g.id}
                              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                              className="bg-[#424242] rounded-xl p-3 lg:p-4 border border-white/[0.07]"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <span className="font-body booking-text text-sm font-bold text-[var(--color-cyan)]">
                                  Product #{idx + 1}
                                </span>
                                {idx > 0 && (
                                  <button onClick={() => handleRemoveGroup(section.dropoffIndex, g.id)}
                                    className="flex items-center justify-center w-6 h-6 rounded-full
                                               border border-white/10 hover:border-red-400/40 hover:text-red-400
                                               transition-colors cursor-pointer">
                                    <X size={12} />
                                  </button>
                                )}
                              </div>

                              <ProductFieldsRow
                                group={g} errors={gErr}
                                onUpdate={(patch) => handleUpdateGroup(section.dropoffIndex, g.id, patch)}
                              />

                              <div className="border-t border-white/[0.07] my-3" />

                              {mode === 'loose' && (
                                <div className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-3 lg:flex lg:items-start lg:gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="font-body booking-text text-xs whitespace-nowrap">Pieces<Req /></label>
                                    <TextField value={g.pieces}
                                      onChange={(e) => handleUpdateGroup(section.dropoffIndex, g.id, { pieces: e.target.value })}
                                      placeholder="0" variant="outlined" error={!!gErr.pieces}
                                      sx={{ ...fieldSx(INPUT_BG_CARD, BORDER_CARD, !!gErr.pieces), width: 90 }} />
                                    {gErr.pieces && <FormHelperText sx={HELPER_SX}>{gErr.pieces}</FormHelperText>}
                                  </div>

                                  <div className="flex flex-col gap-1 min-w-0">
                                    <label className="font-body booking-text text-xs whitespace-nowrap">
                                      Dimensions <span className="text-white/20">(cm)</span><Req />
                                    </label>
                                    <div className="flex gap-1.5">
                                      {(['looseLength', 'looseWidth', 'looseHeight'] as const).map((dim) => (
                                        <div key={dim} className="flex flex-col gap-0.5 flex-1 min-w-0">
                                          <TextField value={g[dim]}
                                            onChange={(e) => handleUpdateGroup(section.dropoffIndex, g.id, { [dim]: e.target.value })}
                                            placeholder={dim === 'looseLength' ? 'L' : dim === 'looseWidth' ? 'W' : 'H'}
                                            variant="outlined" error={!!gErr[dim]}
                                            sx={{ ...fieldSx(INPUT_BG_CARD, BORDER_CARD, !!gErr[dim]), width: '100%' }} />
                                          {gErr[dim] && <FormHelperText sx={HELPER_SX}>{gErr[dim]}</FormHelperText>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-1 col-span-2 lg:col-span-1 lg:shrink-0">
                                    <label className="font-body booking-text text-xs whitespace-nowrap">Weight<Req /></label>
                                    <div className="flex gap-1.5">
                                      <div className="flex flex-col gap-0.5">
                                        <TextField value={g.weight}
                                          onChange={(e) => handleUpdateGroup(section.dropoffIndex, g.id, { weight: e.target.value })}
                                          placeholder="0" variant="outlined" error={!!gErr.weight}
                                          sx={{ ...fieldSx(INPUT_BG_CARD, BORDER_CARD, !!gErr.weight), width: 64 }} />
                                        {gErr.weight && <FormHelperText sx={HELPER_SX}>{gErr.weight}</FormHelperText>}
                                      </div>
                                      <Select value={g.weightUnit}
                                        onChange={(e: SelectChangeEvent) =>
                                          handleUpdateGroup(section.dropoffIndex, g.id, { weightUnit: e.target.value as 'kg' | 'lbs' })}
                                        sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: 64 }} MenuProps={MENU_PROPS}>
                                        <MenuItem value="kg">kg</MenuItem>
                                        <MenuItem value="lbs">lbs</MenuItem>
                                      </Select>
                                      <Select value={g.perItem}
                                        onChange={(e: SelectChangeEvent) =>
                                          handleUpdateGroup(section.dropoffIndex, g.id, { perItem: e.target.value as 'Per Item' | 'Total' })}
                                        sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), flex: 1 }} MenuProps={MENU_PROPS}>
                                        <MenuItem value="Per Item">Per Item</MenuItem>
                                        <MenuItem value="Total">Total</MenuItem>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="hidden lg:flex flex-row items-end gap-4 pb-0.5 ml-2 shrink-0">
                                    <CheckRow checked={g.nonTiltable}
                                      onChange={(v) => handleUpdateGroup(section.dropoffIndex, g.id, { nonTiltable: v })}
                                      label="Non-tiltable" />
                                    <CheckRow checked={g.nonStackable}
                                      onChange={(v) => handleUpdateGroup(section.dropoffIndex, g.id, { nonStackable: v })}
                                      label="Non-stackable" />
                                  </div>
                                </div>
                              )}

                              {mode === 'palletized' && (
                                <div className="flex flex-wrap items-start gap-2">
                                  <div className="flex flex-col gap-1 w-full sm:w-[140px]">
                                    <label className="font-body booking-text text-xs whitespace-nowrap">No. of Pallets<Req /></label>
                                    <TextField fullWidth value={g.numPallets}
                                      onChange={(e) => handleUpdateGroup(section.dropoffIndex, g.id, { numPallets: e.target.value })}
                                      placeholder="0" variant="outlined" error={!!gErr.numPallets}
                                      sx={fieldSx(INPUT_BG_CARD, BORDER_CARD, !!gErr.numPallets)} />
                                    {gErr.numPallets && <FormHelperText sx={HELPER_SX}>{gErr.numPallets}</FormHelperText>}
                                  </div>

                                  <div className="flex flex-col gap-1 w-full sm:w-[180px]">
                                    <label className="font-body booking-text text-xs whitespace-nowrap">Pallet Type</label>
                                    <Select value={g.palletType}
                                      onChange={(e: SelectChangeEvent) => {
                                        const type = e.target.value as ItemGroup['palletType']
                                        handleUpdateGroup(section.dropoffIndex, g.id, { palletType: type, ...PALLET_DIMENSIONS[type] })
                                      }}
                                      sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: '100%' }} MenuProps={MENU_PROPS}>
                                      <MenuItem value="Standard">Standard (120×100)</MenuItem>
                                      <MenuItem value="Euro">Euro (120×80)</MenuItem>
                                      <MenuItem value="Half">Half (60×80)</MenuItem>
                                      <MenuItem value="Custom">Custom</MenuItem>
                                    </Select>
                                  </div>

                                  <div className="flex flex-col gap-1 w-full min-w-[220px] flex-1">
                                    <label className="font-body booking-text text-xs whitespace-nowrap">
                                      Dimensions <span className="text-white/20">(cm)</span><Req />
                                    </label>
                                    <div className="flex gap-1.5 items-start">
                                      {(['palletLength', 'palletWidth', 'palletHeight'] as const).map((dim) => (
                                        <div key={dim} className="flex flex-col gap-0.5 flex-1 min-w-0">
                                          <TextField value={g[dim]}
                                            onChange={(e) => handleUpdateGroup(section.dropoffIndex, g.id, { [dim]: e.target.value })}
                                            placeholder={dim === 'palletLength' ? 'L' : dim === 'palletWidth' ? 'W' : 'H'}
                                            variant="outlined" error={!!gErr[dim as keyof GroupErrors]}
                                            sx={{ ...fieldSx(INPUT_BG_CARD, BORDER_CARD, !!gErr[dim as keyof GroupErrors]), width: '100%' }} />
                                          {gErr[dim as keyof GroupErrors] && (
                                            <FormHelperText sx={HELPER_SX}>{gErr[dim as keyof GroupErrors]}</FormHelperText>
                                          )}
                                        </div>
                                      ))}
                                      <Select value={g.palletWeightUnit}
                                        onChange={(e: SelectChangeEvent) =>
                                          handleUpdateGroup(section.dropoffIndex, g.id, { palletWeightUnit: e.target.value as 'kg' | 'lbs' })}
                                        sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: 64, flexShrink: 0 }} MenuProps={MENU_PROPS}>
                                        <MenuItem value="kg">kg</MenuItem>
                                        <MenuItem value="lbs">lbs</MenuItem>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-1 w-full sm:w-[180px]">
                                    <label className="font-body booking-text text-xs whitespace-nowrap">Gross weight / pallet<Req /></label>
                                    <div className="relative inline-flex">
                                      <TextField fullWidth value={g.grossWeightPerPallet}
                                        onChange={(e) => handleUpdateGroup(section.dropoffIndex, g.id, { grossWeightPerPallet: e.target.value })}
                                        placeholder="0" variant="outlined" error={!!gErr.grossWeightPerPallet}
                                        sx={{
                                          ...fieldSx(INPUT_BG_CARD, BORDER_CARD, !!gErr.grossWeightPerPallet),
                                          '& .MuiInputBase-input': { padding: '0 36px 0 12px', height: 36, boxSizing: 'border-box', '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 } },
                                        }} />
                                      <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[#333333]">
                                        <button onClick={() => handleUpdateGroup(section.dropoffIndex, g.id, { grossWeightPerPallet: String((Number(g.grossWeightPerPallet) || 0) + 1) })}
                                          className="flex-1 px-1.5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-tr-lg transition-colors cursor-pointer text-[9px] leading-none">▲</button>
                                        <button onClick={() => handleUpdateGroup(section.dropoffIndex, g.id, { grossWeightPerPallet: String(Math.max(0, (Number(g.grossWeightPerPallet) || 0) - 1)) })}
                                          className="flex-1 px-1.5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-br-lg border-t border-[#333333] transition-colors cursor-pointer text-[9px] leading-none">▼</button>
                                      </div>
                                    </div>
                                    {gErr.grossWeightPerPallet && <FormHelperText sx={HELPER_SX}>{gErr.grossWeightPerPallet}</FormHelperText>}
                                  </div>

                                  <div className="flex flex-col gap-1 w-full sm:w-[180px]">
                                    <label className="font-body booking-text text-xs whitespace-nowrap">Net weight / pallet<Req /></label>
                                    <div className="relative inline-flex">
                                      <TextField fullWidth value={g.netWeightPerPallet}
                                        onChange={(e) => handleUpdateGroup(section.dropoffIndex, g.id, { netWeightPerPallet: e.target.value })}
                                        placeholder="0" variant="outlined" error={!!gErr.netWeightPerPallet}
                                        sx={{
                                          ...fieldSx(INPUT_BG_CARD, BORDER_CARD, !!gErr.netWeightPerPallet),
                                          '& .MuiInputBase-input': { padding: '0 36px 0 12px', height: 36, boxSizing: 'border-box', '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 } },
                                        }} />
                                      <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[#333333]">
                                        <button onClick={() => handleUpdateGroup(section.dropoffIndex, g.id, { netWeightPerPallet: String((Number(g.netWeightPerPallet) || 0) + 1) })}
                                          className="flex-1 px-1.5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-tr-lg transition-colors cursor-pointer text-[9px] leading-none">▲</button>
                                        <button onClick={() => handleUpdateGroup(section.dropoffIndex, g.id, { netWeightPerPallet: String(Math.max(0, (Number(g.netWeightPerPallet) || 0) - 1)) })}
                                          className="flex-1 px-1.5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-br-lg border-t border-[#333333] transition-colors cursor-pointer text-[9px] leading-none">▼</button>
                                      </div>
                                    </div>
                                    {gErr.netWeightPerPallet && <FormHelperText sx={HELPER_SX}>{gErr.netWeightPerPallet}</FormHelperText>}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center mt-3">
                                <div className="flex items-center gap-4">
                                  {mode === 'loose' ? (
                                    <div className="flex items-center gap-4 lg:hidden">
                                      <CheckRow checked={g.nonTiltable}
                                        onChange={(v) => handleUpdateGroup(section.dropoffIndex, g.id, { nonTiltable: v })}
                                        label="Non-tiltable" />
                                      <CheckRow checked={g.nonStackable}
                                        onChange={(v) => handleUpdateGroup(section.dropoffIndex, g.id, { nonStackable: v })}
                                        label="Non-stackable" />
                                    </div>
                                  ) : (
                                    <>
                                      <CheckRow checked={g.stackable}
                                        onChange={(v) => handleUpdateGroup(section.dropoffIndex, g.id, { stackable: v })}
                                        label="Stackable" />
                                      <CheckRow checked={g.oversize}
                                        onChange={(v) => handleUpdateGroup(section.dropoffIndex, g.id, { oversize: v })}
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
                          )
                        })}
                      </AnimatePresence>

                      <motion.button onClick={() => handleAddGroup(section.dropoffIndex)}
                        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-white/10
                                   font-body booking-text text-sm text-white/50 hover:border-white/20 hover:text-white/80
                                   transition-all cursor-pointer">
                        Add another product
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
          className="rounded-md bg-[#2A2828] p-5 flex flex-col gap-3
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
          transition={{ delay: 0.5 }} className="flex justify-between gap-3 pt-2"
        >
          <WizBtn onClick={onBack} variant="back">BACK</WizBtn>
          <WizBtn onClick={handleNext} variant="next">NEXT</WizBtn>
        </motion.div>

      </div>{/* end scrollable content */}
    </div>
  )
}

function ProductFieldsRow({ group, errors, onUpdate }: {
  group: ItemGroup; errors: GroupErrors; onUpdate: (patch: Partial<ItemGroup>) => void
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-start">
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">
          Commodity<span style={{ color: ERROR_COLOR, marginLeft: 2 }}>*</span>
        </label>
        <TextField fullWidth placeholder="e.g. Accessories" variant="outlined"
          value={group.commodity} error={!!errors.commodity}
          onChange={(e) => onUpdate({ commodity: e.target.value })}
          sx={fieldSx(INPUT_BG_CARD, BORDER_CARD, !!errors.commodity)} />
        {errors.commodity && <FormHelperText sx={HELPER_SX}>{errors.commodity}</FormHelperText>}
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">Product</label>
        <TextField fullWidth placeholder="e.g. General Cargo" variant="outlined"
          value={group.product} onChange={(e) => onUpdate({ product: e.target.value })}
          sx={fieldSx(INPUT_BG_CARD, BORDER_CARD)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">SHC</label>
        <Select value={group.shc} onChange={(e: SelectChangeEvent) => onUpdate({ shc: e.target.value })}
          displayEmpty sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: '100%' }} MenuProps={MENU_PROPS}>
          <MenuItem value=""><em style={{ opacity: 0.4, fontStyle: 'normal' }}>Select SHC</em></MenuItem>
          <MenuItem value="GEN">GEN</MenuItem><MenuItem value="PER">PER</MenuItem>
          <MenuItem value="EAT">EAT</MenuItem><MenuItem value="HEA">HEA</MenuItem>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">Additional SHC</label>
        <Select value={group.additionalShc} onChange={(e: SelectChangeEvent) => onUpdate({ additionalShc: e.target.value })}
          displayEmpty sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD), width: '100%' }} MenuProps={MENU_PROPS}>
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
    <div className="rounded-sm border border-[#4DF9ED] bg-white p-3 lg:p-4 flex flex-col gap-2">
      <p className="font-body booking-text text-[#818181] text-[10px] lg:!text-[0.9rem] uppercase tracking-widest leading-none">{label}</p>
      <p className="font-body booking-text text-black text-2xl lg:text-3xl leading-none tracking-wide whitespace-nowrap truncate">{value}</p>
    </div>
  )
}