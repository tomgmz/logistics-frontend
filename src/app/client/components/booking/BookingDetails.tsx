'use client'

import { motion, Variants, AnimatePresence } from 'framer-motion'
import { useCallback, useState, useRef, useEffect } from 'react'
import {
  CalendarDays, Clock, MapPin, Package,
  Truck, Plus, X, Check, Info, Upload, CreditCard, File,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/lib/hooks/hooks'
import {
  setDate, setTime, setPickup,
  setPickupCoords,
  updateDropoff, updateDropoffCoords, addDropoff, removeDropoff,
  setMode,
  updateGroup as updateGroupAction,
  addGroup as addGroupAction,
  removeGroup as removeGroupAction,
  setAllNonTiltable, setAllNonStackable,
  setAllStackable, setAllOversize,
  makeDefaultGroup,
  setPaymentTerms,
} from '@/lib/store/slice/booking.slice'
import type { CargoMode, ItemGroup } from '@/lib/store/slice/booking.slice'
import { selectCargoSummary, selectSections } from '@/lib/store/bookingSelectors'
import MapLocationPicker from './MapLocationPicker'
import './BookingDetails.css'

import Select, { SelectChangeEvent } from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import FormHelperText from '@mui/material/FormHelperText'
import { SxProps, Theme } from '@mui/material/styles'
import WizBtn from '../WizButton'

import {
  validateBooking,
  hasAnyErrors,
  getGroupErrors,
  type GroupErrors,
} from '@/lib/validation/bookingValidation'

import type { ResolvedPlace } from '@/lib/hooks/usePlacesAutoComplete'

interface Props {
  onNext: () => void
  onBack?: () => void
  files: File[]
  onFilesChange: (files: File[]) => void
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

const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024
const MAX_DOC_COUNT      = 3
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx']

const INPUT_BG_CARD  = '#424242'
const INPUT_BG_PANEL = '#2A2828'
const BORDER_PANEL   = 'rgba(255,255,255,0.12)'
const BORDER_CARD    = BORDER_PANEL
const CYAN           = '#4DF9ED'
const RED            = '#f87171'
const ERROR_COLOR    = '#f87171'
const ERROR_BORDER   = `${ERROR_COLOR}99`
const RADIUS         = '8px'

const TIME_SLOTS: string[] = []
for (let h = 0; h < 24; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa']

function calDays(year: number, month: number) {
  const first = new Date(year, month, 1).getDay()
  const total = new Date(year, month + 1, 0).getDate()
  return { first, total }
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function parseDateStr(s: string): { y: number; m: number; d: number } | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m: m - 1, d }
}

function formatDisplayDate(s: string) {
  const p = parseDateStr(s)
  if (!p) return ''
  const dt = new Date(p.y, p.m, p.d)
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDisplayTime(s: string) {
  if (!s) return ''
  const [hStr, mStr] = s.split(':')
  const h = parseInt(hStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mStr} ${ampm}`
}

function fieldSx(bg: string, borderColor: string, hasError = false): SxProps<Theme> {
  const activeBorder = hasError ? ERROR_COLOR : `${CYAN}66`
  const idleBorder   = hasError ? ERROR_BORDER : borderColor
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
    '& .MuiOutlinedInput-root.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: ERROR_BORDER },
    '& .MuiOutlinedInput-root.Mui-error:hover .MuiOutlinedInput-notchedOutline': { borderColor: ERROR_BORDER },
    '& .MuiInputLabel-root': { display: 'none' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

function selectSx(bg: string, borderColor: string, hasError = false): SxProps<Theme> {
  const activeBorder = hasError ? ERROR_COLOR : `${CYAN}66`
  const idleBorder   = hasError ? ERROR_BORDER : borderColor
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
    '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: ERROR_BORDER },
    '&.Mui-error:hover .MuiOutlinedInput-notchedOutline': { borderColor: ERROR_BORDER },
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

function Req() {
  return <span style={{ color: ERROR_COLOR, marginLeft: 2 }}>*</span>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DatePickerPopup({
  value, onChange, hasError, errorMsg,
}: {
  value: string
  onChange: (v: string) => void
  hasError?: boolean
  errorMsg?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const today = new Date()
  const parsed = parseDateStr(value)
  const [viewYear,  setViewYear]  = useState(parsed?.y  ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed?.m  ?? today.getMonth())

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const { first, total } = calDays(viewYear, viewMonth)
  const blanks = first

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(v => v - 1) }
    else setViewMonth(v => v - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(v => v + 1) }
    else setViewMonth(v => v + 1)
  }

  const selectDay = (d: number) => {
    onChange(toDateStr(viewYear, viewMonth, d))
    setOpen(false)
  }

  const todayY = today.getFullYear()
  const todayM = today.getMonth()
  const todayD = today.getDate()

  const isDisabled = (d: number) => {
    const dt = new Date(viewYear, viewMonth, d)
    const td = new Date(todayY, todayM, todayD)
    return dt < td
  }

  const idleBorder   = hasError ? ERROR_BORDER : BORDER_PANEL
  const activeBorder = hasError ? ERROR_COLOR   : `${CYAN}66`

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 text-left transition-all
                   hover:opacity-90 active:scale-[0.99] cursor-pointer"
        style={{
          height: 36,
          background: INPUT_BG_PANEL,
          border: `1px solid ${open ? activeBorder : idleBorder}`,
          borderRadius: RADIUS,
          outline: 'none',
        }}
      >
        <CalendarDays size={14} style={{ color: CYAN, flexShrink: 0 }} />
        <span className="flex-1 text-sm" style={{ color: value ? '#fff' : 'rgba(255,255,255,0.3)' }}>
          {value ? formatDisplayDate(value) : 'Select date'}
        </span>
      </button>

      {hasError && errorMsg && <FormHelperText sx={HELPER_SX}>{errorMsg}</FormHelperText>}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: -6,  scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-[42px] left-0 z-50 rounded-xl shadow-2xl p-4 w-[260px]"
            style={{
              background: '#1E1C1C',
              border: `1px solid ${BORDER_PANEL}`,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={prevMonth}
                className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer text-white/60 hover:text-white">
                <ChevronLeft size={15} />
              </button>
              <span className="font-body text-xs font-bold text-white tracking-wider">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button type="button" onClick={nextMonth}
                className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer text-white/60 hover:text-white">
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {DOW.map(d => (
                <div key={d} className="text-center font-body text-[10px] text-white/30 py-0.5">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: total }, (_, i) => i + 1).map(d => {
                const str = toDateStr(viewYear, viewMonth, d)
                const isSelected = str === value
                const isToday    = viewYear === todayY && viewMonth === todayM && d === todayD
                const disabled   = isDisabled(d)
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectDay(d)}
                    className="h-8 w-full flex items-center justify-center rounded-md text-xs font-body
                               transition-all cursor-pointer"
                    style={{
                      background:  isSelected ? CYAN : isToday ? 'rgba(77,249,237,0.12)' : 'transparent',
                      color:       disabled ? 'rgba(255,255,255,0.15)'
                                 : isSelected ? '#000'
                                 : isToday    ? CYAN
                                 : '#fff',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontWeight:  isSelected || isToday ? 700 : 400,
                    }}
                  >
                    {d}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 pt-2 border-t border-white/[0.07] text-center">
              <button
                type="button"
                onClick={() => {
                  onChange(toDateStr(todayY, todayM, todayD))
                  setOpen(false)
                }}
                className="font-body text-xs cursor-pointer transition-colors"
                style={{ color: CYAN }}
              >
                Today
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TimePickerPopup({
  value, onChange, hasError, errorMsg,
}: {
  value: string
  onChange: (v: string) => void
  hasError?: boolean
  errorMsg?: string
}) {
  const [open, setOpen] = useState(false)
  const ref      = useRef<HTMLDivElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open || !value) return
    const idx = TIME_SLOTS.indexOf(value)
    if (idx === -1 || !listRef.current) return
    const btn = listRef.current.children[idx] as HTMLElement | undefined
    btn?.scrollIntoView({ block: 'center' })
  }, [open, value])

  const idleBorder   = hasError ? ERROR_BORDER : BORDER_PANEL
  const activeBorder = hasError ? ERROR_COLOR   : `${CYAN}66`

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 text-left transition-all
                   hover:opacity-90 active:scale-[0.99] cursor-pointer"
        style={{
          height: 36,
          background: INPUT_BG_PANEL,
          border: `1px solid ${open ? activeBorder : idleBorder}`,
          borderRadius: RADIUS,
          outline: 'none',
        }}
      >
        <Clock size={14} style={{ color: CYAN, flexShrink: 0 }} />
        <span className="flex-1 text-sm" style={{ color: value ? '#fff' : 'rgba(255,255,255,0.3)' }}>
          {value ? formatDisplayTime(value) : 'Select time'}
        </span>
      </button>

      {hasError && errorMsg && <FormHelperText sx={HELPER_SX}>{errorMsg}</FormHelperText>}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: -6,  scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-[42px] left-0 z-50 rounded-xl shadow-2xl w-[160px] overflow-hidden"
            style={{
              background: '#1E1C1C',
              border: `1px solid ${BORDER_PANEL}`,
            }}
          >
            <div className="px-3 py-2 border-b border-white/[0.07]">
              <span className="font-body text-[10px] text-white/40 uppercase tracking-widest">
                Select Time
              </span>
            </div>
            <div ref={listRef} className="overflow-y-auto flex flex-col" style={{ maxHeight: 220 }}>
              {TIME_SLOTS.map(slot => {
                const selected = slot === value
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => { onChange(slot); setOpen(false) }}
                    className="flex items-center justify-between px-4 py-2 text-sm font-body
                               transition-colors cursor-pointer text-left"
                    style={{
                      background: selected ? `${CYAN}1A` : 'transparent',
                      color: selected ? CYAN : '#fff',
                      fontWeight: selected ? 700 : 400,
                    }}
                  >
                    <span>{formatDisplayTime(slot)}</span>
                    {selected && <Check size={11} style={{ color: CYAN }} />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LocationField({
  value, placeholder, hasError, errorMsg, accentColor, onClick,
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
        <span className="flex-1 text-sm truncate" style={{ color: value ? '#fff' : 'rgba(255,255,255,0.3)' }}>
          {value || placeholder}
        </span>
      </button>
      {hasError && errorMsg && <FormHelperText sx={HELPER_SX}>{errorMsg}</FormHelperText>}
    </div>
  )
}

export default function StepBookingDetails({ onNext, onBack, files, onFilesChange }: Props) {
  const dispatch = useAppDispatch()

  const date         = useAppSelector((s) => s.booking.date)
  const time         = useAppSelector((s) => s.booking.time)
  const pickup       = useAppSelector((s) => s.booking.pickup)
  const dropoffs     = useAppSelector((s) => s.booking.dropoffs)
  const mode         = useAppSelector((s) => s.booking.mode)
  const sections     = useAppSelector(selectSections)
  const paymentTerms = useAppSelector((s) => s.booking.paymentTerms)

  const [touched,    setTouched]    = useState(false)
  const [mapTarget,  setMapTarget]  = useState<MapPickerTarget>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [docError,   setDocError]   = useState<string | null>(null)

  const allGroups = sections.flatMap((s) => s.groups)

  const computedAllNonTiltable  = allGroups.length > 0 && allGroups.every((g) => g.nonTiltable)
  const computedAllNonStackable = allGroups.length > 0 && allGroups.every((g) => g.nonStackable)
  const computedAllStackable    = allGroups.length > 0 && allGroups.every((g) => g.stackable)
  const computedAllOversize     = allGroups.length > 0 && allGroups.every((g) => g.oversize)

  const summary = useAppSelector(selectCargoSummary)

  const rawErrors = validateBooking(date, time, pickup, dropoffs, sections, mode, paymentTerms, files.length)
  const errors    = touched ? rawErrors : { schedule: {}, route: { dropoffs: {} }, sections: [], paymentTerms: undefined, documents: undefined }

  const handleNext = () => {
    setTouched(true)
    if (hasAnyErrors(rawErrors)) return
    onNext()
  }

  const handleAddDropoff = () => dispatch(addDropoff())

  const handleUpdateGroup = (dropoffIndex: number, groupId: string, patch: Partial<ItemGroup>) =>
    dispatch(updateGroupAction({ dropoffIndex, groupId, patch }))

  const handleRemoveGroup = (dropoffIndex: number, groupId: string) =>
    dispatch(removeGroupAction({ dropoffIndex, groupId }))

  const handleAddGroup = (dropoffIndex: number) => {
    const newGroup: ItemGroup = {
      ...makeDefaultGroup(),
      ...(mode === 'loose'
        ? { nonTiltable: computedAllNonTiltable, nonStackable: computedAllNonStackable }
        : { stackable: computedAllStackable, oversize: computedAllOversize }),
    }
    dispatch(addGroupAction({ dropoffIndex, newGroup }))
  }

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

  const fileInputRef = useRef<HTMLInputElement>(null)

  const mapInitialValue = mapTarget
    ? mapTarget.kind === 'pickup' ? pickup : dropoffs[mapTarget.index] ?? ''
    : ''

  const mapPickerMode: 'pickup' | 'dropoff' =
    mapTarget?.kind === 'pickup' ? 'pickup' : 'dropoff'

  const validateAndAddFiles = (incoming: File[]) => {
    setDocError(null)
    const slots    = MAX_DOC_COUNT - files.length
    const accepted = incoming.slice(0, slots)
    if (accepted.length === 0) return

    for (const f of accepted) {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setDocError(`"${f.name}" is not allowed. Use PDF, DOCX, or XLSX.`)
        return
      }
      if (f.size > MAX_DOC_SIZE_BYTES) {
        setDocError(`"${f.name}" exceeds the 10 MB limit (${formatBytes(f.size)}).`)
        return
      }
    }

    onFilesChange([...files, ...accepted])
  }

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index))
    setDocError(null)
  }

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

        {/* Transit Schedule + Pick Up + Drop Off */}
        <motion.div variants={stagger} initial="hidden" animate="show"
          className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6"
        >
          {/* ── Transit Schedule ── */}
          <motion.div variants={fadeUp}
            className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-3"
          >
            <SectionHeader icon={<CalendarDays size={16} />} title="Transit Schedule" />

            <div className="flex flex-col gap-1">
              <span className="font-body booking-text text-xs">Date<Req /></span>
              <DatePickerPopup
                value={date}
                onChange={(v) => dispatch(setDate(v))}
                hasError={!!errors.schedule?.date}
                errorMsg={errors.schedule?.date}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-body booking-text text-xs">Time<Req /></span>
              <TimePickerPopup
                value={time}
                onChange={(v) => dispatch(setTime(v))}
                hasError={!!errors.schedule?.time}
                errorMsg={errors.schedule?.time}
              />
            </div>
          </motion.div>

          {/* ── Pick Up ── */}
          <motion.div variants={fadeUp}
            className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-3"
          >
            <div className="flex items-center">
              <SectionHeader icon={<Truck size={16} />} title="Pick Up Point" />
              <Req />
            </div>
            <LocationField
              value={pickup}
              placeholder="Click to set on map"
              hasError={!!errors.route?.pickup}
              errorMsg={errors.route?.pickup}
              accentColor={CYAN}
              onClick={() => setMapTarget({ kind: 'pickup' })}
            />
          </motion.div>

          {/* ── Drop Off ── */}
          <motion.div variants={fadeUp}
            className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-2"
          >
            <div className="flex items-center">
              <SectionHeader icon={<MapPin size={16} />} title="Drop Off Point" />
              <Req />
            </div>
            <div className="flex flex-col gap-2 mt-1">
              {dropoffs.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <LocationField
                      value={d}
                      placeholder="Click to set on map"
                      hasError={!!errors.route?.dropoffs?.[i]}
                      errorMsg={errors.route?.dropoffs?.[i]}
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

        {/* ── Product & Cargo ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-4"
        >
          <div className="flex items-start justify-between gap-3">
            <SectionHeader icon={<Package size={16} />} title="Product & Cargo Capacity" />
            <div className="relative group shrink-0">
              <button
                type="button"
                aria-label="Cargo estimate info"
                className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full
                           border border-white/10 bg-white/[0.03] text-white/60
                           hover:text-white hover:border-white/20 transition-colors cursor-pointer"
              >
                <Info size={15} />
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 top-9 z-20 w-[300px]
                          rounded-lg border border-white/10 bg-[#111] px-3 py-3
                          text-xs text-white/80 shadow-xl opacity-0 translate-y-1
                          group-hover:opacity-100 group-hover:translate-y-0 transition-all"
              >
                <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">
                  {mode === 'palletized' ? 'Palletized Formulas' : 'Loose Cargo Formulas'}
                </p>
                {mode === 'palletized' ? (
                  <div className="flex flex-col gap-1.5">
                    <p><span className="text-[var(--color-cyan)]">Gross Weight</span> = Pallets × Gross/Pallet</p>
                    <p><span className="text-[var(--color-cyan)]">Net Weight</span> = Pallets × Net/Pallet</p>
                    <p><span className="text-[var(--color-cyan)]">Volume</span> = Pallets × (L × W × H) ÷ 1,000,000</p>
                    <p className="text-white/30 text-[10px] mt-1 pt-1 border-t border-white/[0.07]">
                      Dimensions in cm → result in CBM
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <p><span className="text-[var(--color-cyan)]">Gross Weight</span> = Pieces × Weight <span className="text-white/40">(Per Item)</span></p>
                    <p><span className="text-[var(--color-cyan)]">Volume</span> = Pieces × (L × W × H) ÷ 1,000,000</p>
                    <p><span className="text-[var(--color-cyan)]">Density</span> = Gross Weight ÷ Volume</p>
                    <p className="text-white/30 text-[10px] mt-1 pt-1 border-t border-white/[0.07]">
                      Dimensions in cm → result in CBM · lbs auto-converted to kg
                    </p>
                  </div>
                )}
                <p className="text-white/25 text-[10px] mt-2 pt-1 border-t border-white/[0.07]">
                  Estimates only — final charges may vary after review.
                </p>
              </div>
            </div>
          </div>

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
                  <CheckRow checked={computedAllNonTiltable}  onChange={(v) => dispatch(setAllNonTiltable(v))}  label="All Non-tiltable"  />
                  <CheckRow checked={computedAllNonStackable} onChange={(v) => dispatch(setAllNonStackable(v))} label="All Non-stackable" />
                </>
              ) : (
                <>
                  <CheckRow checked={computedAllStackable} onChange={(v) => dispatch(setAllStackable(v))} label="All Stackable" />
                  <CheckRow checked={computedAllOversize}  onChange={(v) => dispatch(setAllOversize(v))}  label="All Oversize"  />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <AnimatePresence>
              {sections.map((section) => {
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

                                  <div className="hidden lg:flex flex-row items-end gap-4 pb-0.5 ml-2 shrink-0 self-end">
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

        {/* ── Transaction Summary ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-4"
        >
          <SectionHeader icon={<File size={16} />} title="Transaction Summary" />

          <p className="font-body booking-text text-sm text-white/80">
            Upload your transaction summary here — files will be attached when your booking is confirmed.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              if (files.length >= MAX_DOC_COUNT) return
              validateAndAddFiles(Array.from(e.dataTransfer.files))
            }}
            onClick={() => { if (files.length < MAX_DOC_COUNT) fileInputRef.current?.click() }}
            className="flex flex-col items-center gap-2 rounded-md px-4 py-6 border border-dashed transition-colors cursor-pointer"
            style={{
              background:    INPUT_BG_CARD,
              borderColor:   isDragging ? CYAN
                           : (touched && !!rawErrors.documents && !docError) ? ERROR_BORDER
                           : '#818181',
              opacity:       files.length >= MAX_DOC_COUNT ? 0.5 : 1,
              pointerEvents: files.length >= MAX_DOC_COUNT ? 'none' : 'auto',
            }}
          >
            <Upload size={24} style={{ color: isDragging ? CYAN : 'rgba(255,255,255,0.4)' }} />
            <div className="flex items-center gap-1 text-sm">
              <span className="font-body booking-text" style={{ color: CYAN, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Click to browse
              </span>
              <span className="font-body booking-text text-white/80">or drag and drop</span>
            </div>
            <p className="font-body booking-text text-xs text-white/50 text-center">
              .pdf, .docx, or .xlsx · max 10 MB each · up to 3 files
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx"
              multiple
              className="sr-only"
              onChange={(e) => {
                validateAndAddFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </div>

          {docError && <p className="font-body booking-text text-xs text-red-400">{docError}</p>}
          {touched && rawErrors.documents && !docError && (
            <p className="font-body booking-text text-xs text-red-400">{rawErrors.documents}</p>
          )}
          {files.length >= MAX_DOC_COUNT && (
            <p className="font-body booking-text text-xs text-white/40 text-center">
              Maximum of {MAX_DOC_COUNT} files reached
            </p>
          )}

          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {files.map((file, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between rounded-md px-3 py-2 border border-white/10"
                  style={{ background: INPUT_BG_CARD }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                    <File size={13} className="text-white/40 shrink-0" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-body booking-text text-xs text-white/80 truncate">{file.name}</span>
                      <span className="font-body booking-text text-[10px] text-white/40">
                        {formatBytes(file.size)} · queued for upload
                      </span>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeFile(i)}
                    className="hover:text-red-400 transition-colors cursor-pointer shrink-0">
                    <X size={13} />
                  </button>
                </motion.div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <p className="font-body booking-text text-xs text-white/30 flex items-center gap-1.5">
              <Check size={11} className="text-[var(--color-cyan)]" />
              {files.length} file{files.length !== 1 ? 's' : ''} will be uploaded when you confirm your booking
            </p>
          )}
        </motion.div>

        {/* ── Payment Terms ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="bg-[#2A2828] rounded-md border border-white/[0.07] p-4 flex flex-col gap-4"
        >
          <SectionHeader icon={<CreditCard size={16} />} title="Payment Terms" />
          <p className="font-body booking-text text-sm text-white/80">Select your payment terms</p>
          <Select
            value={paymentTerms}
            onChange={(e: SelectChangeEvent) => dispatch(setPaymentTerms(e.target.value))}
            displayEmpty
            error={touched && !!rawErrors.paymentTerms}
            sx={{ ...selectSx(INPUT_BG_PANEL, BORDER_PANEL, touched && !!rawErrors.paymentTerms), width: '100%' }}
            MenuProps={MENU_PROPS}
          >
            <MenuItem value=""><em style={{ opacity: 0.4, fontStyle: 'normal' }}>Select payment terms</em></MenuItem>
            <MenuItem value="30">30 days</MenuItem>
            <MenuItem value="45">45 days</MenuItem>
            <MenuItem value="60">60 days</MenuItem>
          </Select>
          {touched && rawErrors.paymentTerms && (
            <FormHelperText sx={HELPER_SX}>{rawErrors.paymentTerms}</FormHelperText>
          )}
        </motion.div>

        {/* ── Cargo Summary ── */}
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

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }} className="flex justify-between gap-3 pt-2"
        >
          {onBack ? (
            <WizBtn onClick={onBack} variant="back">BACK</WizBtn>
          ) : (
            <span />
          )}
          <WizBtn onClick={handleNext} variant="next">NEXT</WizBtn>
        </motion.div>

      </div>
    </div>
  )
}

function ProductFieldsRow({ group, errors, onUpdate }: {
  group: ItemGroup; errors: GroupErrors; onUpdate: (patch: Partial<ItemGroup>) => void
}) {
  const INPUT_BG_CARD = '#424242'
  const BORDER_CARD   = 'rgba(255,255,255,0.12)'
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-start">
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">
          Commodity<span style={{ color: '#f87171', marginLeft: 2 }}>*</span>
        </label>
        <TextField fullWidth placeholder="e.g. Accessories" variant="outlined"
          value={group.commodity} error={!!errors.commodity}
          onChange={(e) => onUpdate({ commodity: e.target.value })}
          sx={fieldSx(INPUT_BG_CARD, BORDER_CARD, !!errors.commodity)} />
        {errors.commodity && <FormHelperText sx={HELPER_SX}>{errors.commodity}</FormHelperText>}
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">
          Product<span style={{ color: '#f87171', marginLeft: 2 }}>*</span>
        </label>
        <TextField fullWidth placeholder="e.g. General Cargo" variant="outlined"
          value={group.product} error={!!errors.product}
          onChange={(e) => onUpdate({ product: e.target.value })}
          sx={fieldSx(INPUT_BG_CARD, BORDER_CARD, !!errors.product)} />
        {errors.product && <FormHelperText sx={HELPER_SX}>{errors.product}</FormHelperText>}
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">
          Special Handling Code<span style={{ color: '#f87171', marginLeft: 2 }}>*</span>
        </label>
        <Select value={group.shc} onChange={(e: SelectChangeEvent) => onUpdate({ shc: e.target.value })}
          displayEmpty
          sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD, !!errors.shc), width: '100%' }}
          MenuProps={MENU_PROPS}
        >
          <MenuItem value=""><em style={{ opacity: 0.4, fontStyle: 'normal' }}>Select SHC</em></MenuItem>
          <MenuItem value="GENERAL">GENERAL</MenuItem><MenuItem value="PERISHABLE">PERISHABLE</MenuItem>
          <MenuItem value="EAT">EAT(Foodstuff)</MenuItem><MenuItem value="HEAVY">HEAVY</MenuItem>
        </Select>
        {errors.shc && <FormHelperText sx={HELPER_SX}>{errors.shc}</FormHelperText>}
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-body booking-text text-xs">
          Additional Special Handling Code<span style={{ color: '#f87171', marginLeft: 2 }}>*</span>
        </label>
        <Select value={group.additionalShc} onChange={(e: SelectChangeEvent) => onUpdate({ additionalShc: e.target.value })}
          displayEmpty
          sx={{ ...selectSx(INPUT_BG_CARD, BORDER_CARD, !!errors.additionalShc), width: '100%' }}
          MenuProps={MENU_PROPS}
        >
          <MenuItem value=""><em style={{ opacity: 0.4, fontStyle: 'normal' }}>Select additional SHC</em></MenuItem>
          <MenuItem value="FRAGILE">FRAGILE</MenuItem>
          <MenuItem value="PERISHABLE">PERISHABLE</MenuItem>
          <MenuItem value="HAZMAT">HAZMAT</MenuItem>
        </Select>
        {errors.additionalShc && <FormHelperText sx={HELPER_SX}>{errors.additionalShc}</FormHelperText>}
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