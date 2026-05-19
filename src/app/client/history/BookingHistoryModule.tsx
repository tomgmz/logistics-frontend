'use client'

import { motion, Variants, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  History, Search, ChevronRight, ChevronLeft,
  MapPin, Truck, Package, Calendar, Hash,
  X, Clock, CheckCircle2, XCircle, AlertCircle,
  Loader2, RefreshCw, Download, FileText,
  ArrowUpRight, Filter,
} from 'lucide-react'

import TextField from '@mui/material/TextField'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import { SxProps, Theme } from '@mui/material/styles'

import { bookingService } from '@/lib/services/client/booking.service'
import { useAuthStore }    from '@/lib/store/auth.store'
import type {
  BookingWithRelations,
  BookingDestination,
} from '@/lib/store/slice/routeMap.slice'
import type { ParsedCargoDetails } from '@/app/types/maps/routemap.types'
import { type BookingStatus, asBookingStatus } from '@/app/types/maps/routemap.types'

const BG_PAGE  = '#0a0a0a'
const BG_PANEL = '#2A2828'
const BG_CARD  = '#424242'
const BORDER   = 'rgba(255,255,255,0.07)'
const BORDER_C = 'rgba(255,255,255,0.12)'
const CYAN     = '#4DF9ED'
const MUTED    = '#818181'
const ERROR    = '#f87171'
const AMBER    = '#FBBF24'
const GREEN    = '#3af626'
const RADIUS   = '8px'

function fieldSx(bg: string, border: string): SxProps<Theme> {
  return {
    '& .MuiInputBase-root': {
      height: 36, borderRadius: RADIUS, backgroundColor: bg,
      color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
    },
    '& .MuiInputBase-input': {
      padding: '0 12px', height: 36, boxSizing: 'border-box',
      '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
    },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: border, borderRadius: RADIUS },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66` },
    '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66`, borderWidth: 1 },
    '& .MuiInputLabel-root': { display: 'none' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

function selectSx(bg: string, border: string): SxProps<Theme> {
  return {
    height: 36, borderRadius: RADIUS, backgroundColor: bg,
    color: '#fff', fontSize: '0.875rem', fontFamily: 'inherit',
    '& .MuiSelect-select': {
      padding: '0 32px 0 10px !important', height: '36px !important',
      display: 'flex', alignItems: 'center',
    },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: border, borderRadius: RADIUS },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66` },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${CYAN}66`, borderWidth: 1 },
    '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.5)' },
    '& legend': { display: 'none' },
    '& fieldset': { top: 0 },
  }
}

const MENU_PROPS = {
  PaperProps: {
    sx: {
      bgcolor: '#2A2828', color: '#fff',
      border: `1px solid ${BORDER_C}`, borderRadius: RADIUS,
      '& .MuiMenuItem-root': {
        fontSize: '0.875rem', fontFamily: 'inherit',
        '&:hover':              { bgcolor: 'rgba(77,249,237,0.08)' },
        '&.Mui-selected':       { bgcolor: 'rgba(77,249,237,0.14)' },
        '&.Mui-selected:hover': { bgcolor: 'rgba(77,249,237,0.20)' },
      },
    },
  },
}

const STATUS_META: Record<
  BookingStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  BOOKED:     { label: 'Booked',     color: CYAN,  bg: `${CYAN}18`,  icon: <CheckCircle2 size={12} /> },
  APPROVED: { label: 'Approved', color: CYAN, bg: `${CYAN}18`, icon: <CheckCircle2 size={12} /> },
  PENDING:    { label: 'Pending',    color: AMBER, bg: `${AMBER}18`, icon: <Clock        size={12} /> },
  ASSIGNED:   { label: 'Assigned',   color: CYAN,  bg: `${CYAN}18`,  icon: <CheckCircle2 size={12} /> },
  IN_TRANSIT: { label: 'In Transit', color: GREEN, bg: `${GREEN}18`, icon: <Truck        size={12} /> },
  ARRIVED:    { label: 'Arrived',    color: GREEN, bg: `${GREEN}18`, icon: <MapPin       size={12} /> },
  COMPLETED:  { label: 'Completed',  color: CYAN,  bg: `${CYAN}18`,  icon: <CheckCircle2 size={12} /> },
  CANCELLED:  { label: 'Cancelled',  color: ERROR, bg: `${ERROR}18`, icon: <XCircle      size={12} /> },
}

const UNKNOWN_META = {
  label: 'Unknown', color: MUTED, bg: `${MUTED}18`, icon: <AlertCircle size={12} />,
}

function getStatusMeta(status: string) {
  const normalized = asBookingStatus(status)
  return normalized !== 'UNKNOWN'
    ? STATUS_META[normalized]
    : UNKNOWN_META
}

const STATUS_ORDER: BookingStatus[] = ['PENDING', 'APPROVED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED']

const TIMELINE_LABELS: Record<BookingStatus, string> = {
  BOOKED:     'Booking Created',
  APPROVED: 'Booking Approved',
  PENDING:    'Booking Placed',
  ASSIGNED:   'Driver Assigned',
  IN_TRANSIT: 'In Transit',
  ARRIVED:    'Arrived',
  COMPLETED:  'Completed',
  CANCELLED:  'Cancelled',
}

function getStepState(
  stepStatus: BookingStatus,
  currentStatus: BookingStatus,
): 'done' | 'active' | 'upcoming' {
  if (currentStatus === 'CANCELLED') {
    return stepStatus === 'CANCELLED' ? 'active' : 'upcoming'
  }
  const stepIdx    = STATUS_ORDER.indexOf(stepStatus)
  const currentIdx = STATUS_ORDER.indexOf(currentStatus)
  if (stepIdx < currentIdx)   return 'done'
  if (stepIdx === currentIdx) return 'active'
  return 'upcoming'
}

const TABS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'PENDING',    label: 'Pending' },
  { key: 'APPROVED',   label: 'Approved' },
  { key: 'ASSIGNED',   label: 'Assigned' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'COMPLETED',  label: 'Completed' },
  { key: 'CANCELLED',  label: 'Cancelled' },
]

function parseCargoDetails(raw: string | null | undefined): ParsedCargoDetails | null {
  if (!raw) return null
  try { return JSON.parse(raw) as ParsedCargoDetails } catch { return null }
}

function buildCargoSummary(booking: BookingWithRelations): string {
  const parsed = parseCargoDetails(booking.cargo_details as string | null | undefined)
  const pieces = parsed?.sections
    ?.flatMap((s) => s.groups)
    .reduce((sum, g) => sum + (parseInt(g.pieces || '0', 10)), 0) ?? 0

  const parts: string[] = []
  if (pieces > 0) {
    const mode = parsed?.mode ?? 'loose'
    parts.push(`${pieces} ${mode === 'palletized' ? 'pallet' : 'piece'}${pieces !== 1 ? 's' : ''}`)
  }
  const weight = booking.required_weight_kg as number | null | undefined
  const volume = booking.required_volume_cbm as number | null | undefined
  if (weight)  parts.push(`${weight} KG`)
  if (volume)  parts.push(`${volume.toFixed(2)} CBM`)
  return parts.length > 0 ? parts.join(' · ') : 'No cargo details'
}

function getDropoffs(booking: BookingWithRelations): string[] {
  const destinations = booking.booking_destinations as BookingDestination[] | undefined
  return (destinations ?? [])
    .slice()
    .sort((a, b) => {
      const ao = a.sequence_order as number | undefined ?? 0
      const bo = b.sequence_order as number | undefined ?? 0
      return ao - bo
    })
    .map((d) => d.address)
}

function getDriverName(booking: BookingWithRelations): string | null {
  const assignments = booking.driver_assignments as Array<{
    drivers?: { users?: { first_name?: string; last_name?: string } }
  }> | undefined
  const u = assignments?.[0]?.drivers?.users
  if (!u) return null
  return `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || null
}

function getPlateNumber(booking: BookingWithRelations): string | null {
  const assignments = booking.truck_assignments as Array<{
    trucks?: { plate_number?: string }
  }> | undefined
  return assignments?.[0]?.trucks?.plate_number ?? null
}

function getTruckModel(booking: BookingWithRelations): string | null {
  const assignments = booking.truck_assignments as Array<{
    trucks?: { truck_models?: { name?: string; vehicle_type?: string } }
  }> | undefined
  const m = assignments?.[0]?.trucks?.truck_models
  return m ? `${m.name ?? ''} (${m.vehicle_type ?? ''})` : null
}

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function formatPeso(n: number | null | undefined): string {
  if (!n) return '—'
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function fileNameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/')
    const raw = decodeURIComponent(parts[parts.length - 1] || url)
    return raw.replace(/(\.[a-zA-Z0-9]+)\1+$/i, '$1')
  } catch { return url }
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35 } },
}
const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
}
const slideIn: Variants = {
  hidden: { opacity: 0, x: 24 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.28 } },
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white">{icon}</span>
      <h3 className="font-body text-white font-bold tracking-wide text-sm">{title}</h3>
    </div>
  )
}

function StatusBadgeRaw({ status }: { status: string }) {
  const m = getStatusMeta(status)
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}40` }}
    >
      {m.icon}{m.label}
    </span>
  )
}

function InfoTile({ label, value, accent, mono }: {
  label: string; value: string; accent?: boolean; mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{label}</span>
      <span className={`text-sm font-bold ${mono ? 'font-mono' : ''}`}
        style={{ color: accent ? CYAN : '#fff' }}>
        {value}
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3 animate-pulse"
      style={{ background: BG_PANEL, borderColor: BORDER }}>
      <div className="flex justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 rounded" style={{ background: BG_CARD }} />
          <div className="h-3 w-24 rounded" style={{ background: BG_CARD }} />
        </div>
        <div className="h-5 w-20 rounded" style={{ background: BG_CARD }} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="h-3 w-48 rounded" style={{ background: BG_CARD }} />
        <div className="h-3 w-36 rounded" style={{ background: BG_CARD }} />
      </div>
      <div className="h-px" style={{ background: BORDER }} />
      <div className="flex justify-between">
        <div className="h-3 w-36 rounded" style={{ background: BG_CARD }} />
        <div className="h-4 w-20 rounded" style={{ background: BG_CARD }} />
      </div>
    </div>
  )
}

function BookingCard({ booking, onSelect }: {
  booking: BookingWithRelations
  onSelect: () => void
}) {
  const dropoffs   = getDropoffs(booking)
  const summary    = buildCargoSummary(booking)
  const schedDate  = booking.schedule_date as string | undefined
  const totalCost  = booking.total_cost as number | null | undefined

  return (
    <motion.div variants={fadeUp} layout
      className="rounded-xl border p-4 flex flex-col gap-3 cursor-pointer group transition-colors"
      style={{ background: BG_PANEL, borderColor: BORDER }}
      onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Hash size={12} style={{ color: CYAN }} />
            <span className="font-bold text-white text-sm tracking-wide font-mono">
              {booking.reference_number ?? booking.booking_id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
            <Calendar size={11} />
            <span>Scheduled {formatDate(schedDate)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadgeRaw status={booking.status} />
          <ArrowUpRight size={14} style={{ color: MUTED }}
            className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs">
          <Truck size={11} style={{ color: CYAN }} />
          <span className="truncate text-white/70">{booking.origin as string | undefined}</span>
        </div>
        {dropoffs.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs pl-0.5">
            <MapPin size={11} style={{ color: ERROR }} />
            <span className="truncate text-white/70">{d}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
          <Package size={11} />
          <span>{summary}</span>
        </div>
        <span className="text-sm font-bold text-white">{formatPeso(totalCost)}</span>
      </div>
    </motion.div>
  )
}

function StatusTimeline({ booking }: { booking: BookingWithRelations }) {
  const currentStatus = asBookingStatus(booking.status)
  const isCancelled   = currentStatus === 'CANCELLED'
  const createdAt     = booking.created_at as string | undefined
  const updatedAt     = booking.updated_at as string | undefined

  const steps = isCancelled
    ? [
        { status: 'PENDING'   as BookingStatus, timestamp: formatDateTime(createdAt) },
        { status: 'CANCELLED' as BookingStatus, timestamp: formatDateTime(updatedAt) },
      ]
    : STATUS_ORDER.map((s, idx) => ({
        status: s,
        timestamp: idx === 0
          ? formatDateTime(createdAt)
          : currentStatus !== 'UNKNOWN' && STATUS_ORDER.indexOf(currentStatus) >= idx
          ? formatDateTime(updatedAt)
          : null,
      }))

  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const resolvedStatus = currentStatus === 'UNKNOWN' ? 'PENDING' : currentStatus
        const state  = getStepState(step.status, resolvedStatus)
        const isLast = i === steps.length - 1
        const meta   = STATUS_META[step.status]

        return (
          <div key={step.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border transition-all"
                style={
                  state === 'done'
                    ? { background: `${CYAN}22`,       borderColor: `${CYAN}60`,       color: CYAN }
                    : state === 'active'
                    ? { background: `${meta.color}22`, borderColor: `${meta.color}80`, color: meta.color }
                    : { background: 'transparent',     borderColor: BORDER_C,          color: MUTED }
                }>
                {state === 'done'
                  ? <CheckCircle2 size={14} />
                  : state === 'active'
                  ? meta.icon
                  : <div className="w-1.5 h-1.5 rounded-full" style={{ background: BORDER_C }} />}
              </div>
              {!isLast && (
                <div className="w-px flex-1 my-1"
                  style={{ background: state === 'done' ? `${CYAN}40` : BORDER_C, minHeight: 20 }} />
              )}
            </div>

            <div className="flex flex-col gap-0.5 pb-4">
              <span className="text-sm font-bold" style={{ color: state === 'upcoming' ? MUTED : '#fff' }}>
                {TIMELINE_LABELS[step.status]}
              </span>
              {step.timestamp ? (
                <span className="text-xs" style={{ color: MUTED }}>{step.timestamp}</span>
              ) : state === 'active' ? (
                <span className="text-xs flex items-center gap-1" style={{ color: AMBER }}>
                  <Loader2 size={10} className="animate-spin" />In progress
                </span>
              ) : (
                <span className="text-xs" style={{ color: BORDER_C }}>Pending</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BookingDetail({ booking }: {
  booking: BookingWithRelations
}) {
  const dropoffs    = getDropoffs(booking)
  const driverName  = getDriverName(booking)
  const plateNumber = getPlateNumber(booking)
  const truckModel  = getTruckModel(booking)
  const summary     = buildCargoSummary(booking)
  const parsed      = parseCargoDetails(booking.cargo_details as string | null | undefined)
  const docs        = (booking.transaction_documents as string[] | null | undefined) ?? []

  const schedDate   = booking.schedule_date as string | undefined
  const callTime    = booking.call_time     as string | undefined
  const payTerms    = booking.payment_terms as string | undefined
  const totalCost   = booking.total_cost    as number | null | undefined
  const createdAt   = booking.created_at    as string | undefined

  const weightKg    = booking.required_weight_kg  as number | null | undefined
  const volumeCbm   = booking.required_volume_cbm as number | null | undefined
  const lengthCm    = booking.required_length_cm  as number | null | undefined
  const stackable   = booking.stackable_required  as boolean | null | undefined
  const truckType   = booking.truck_type_needed   as string | undefined
  const origin      = booking.origin              as string | undefined

  const destinations = booking.booking_destinations as Array<{
    destination_id: string
    address: string
    sequence_order: number
    status: string
    delivered_at?: string | null
  }> | undefined

  return (
    <motion.div key="detail" variants={slideIn} initial="hidden" animate="show"
      className="flex flex-col gap-4 pb-6">

      {/* Summary banner */}
      <div className="rounded-xl border p-4 flex flex-col gap-3"
        style={{ background: BG_PANEL, borderColor: BORDER, borderTopWidth: 3, borderTopColor: CYAN }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Hash size={13} style={{ color: CYAN }} />
              <span className="font-bold text-white tracking-wide font-mono">
                {booking.reference_number ?? booking.booking_id.slice(0, 8).toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
              <Calendar size={11} />
              <span>Booked on {formatDateTime(createdAt)}</span>
            </div>
          </div>
          <StatusBadgeRaw status={booking.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t" style={{ borderColor: BORDER }}>
          <InfoTile label="Scheduled Date" value={formatDate(schedDate)} />
          <InfoTile label="Call Time"      value={callTime ?? '—'} />
          <InfoTile label="Payment Terms"  value={payTerms ?? '—'} />
          <InfoTile label="Total Cost"     value={formatPeso(totalCost)} accent />
        </div>
      </div>

      {/* Route */}
      <div className="rounded-xl border p-4 flex flex-col gap-4"
        style={{ background: BG_PANEL, borderColor: BORDER }}>
        <SectionHeader icon={<MapPin size={15} />} title="Route" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 p-3 rounded-lg border"
            style={{ background: BG_CARD, borderColor: BORDER_C }}>
            <Truck size={14} style={{ color: CYAN }} className="shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Pick Up</span>
              <span className="text-sm text-white/80">{origin}</span>
            </div>
          </div>
          {dropoffs.map((d, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border"
              style={{ background: BG_CARD, borderColor: BORDER_C }}>
              <MapPin size={14} style={{ color: ERROR }} className="shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
                  Drop Off {dropoffs.length > 1 ? i + 1 : ''}
                </span>
                <span className="text-sm text-white/80">{d}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Cargo */}
        <div className="border-t pt-4" style={{ borderColor: BORDER }}>
          <SectionHeader icon={<Package size={15} />} title="Cargo" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            <InfoTile label="Mode"         value={parsed?.mode ?? truckType ?? '—'} />
            <InfoTile label="Summary"      value={summary} />
            <InfoTile label="Truck Needed" value={truckType ?? '—'} />
            {weightKg  != null && <InfoTile label="Weight"    value={`${weightKg} KG`} />}
            {volumeCbm != null && <InfoTile label="Volume"    value={`${volumeCbm.toFixed(2)} CBM`} />}
            {lengthCm  != null && <InfoTile label="Length"    value={`${lengthCm} cm`} />}
            {stackable != null && <InfoTile label="Stackable" value={stackable ? 'Yes' : 'No'} />}
          </div>
        </div>
      </div>

      {/* Driver & truck */}
      {(driverName || plateNumber) && (
        <div className="rounded-xl border p-4 flex flex-col gap-3"
          style={{ background: BG_PANEL, borderColor: BORDER }}>
          <SectionHeader icon={<Truck size={15} />} title="Assigned Driver & Truck" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {driverName  && <InfoTile label="Driver Name"  value={driverName} />}
            {plateNumber && <InfoTile label="Plate Number" value={plateNumber} mono />}
            {truckModel  && <InfoTile label="Truck"        value={truckModel} />}
          </div>
        </div>
      )}

      {/* Destination statuses */}
      {(destinations?.length ?? 0) > 0 && (
        <div className="rounded-xl border p-4 flex flex-col gap-3"
          style={{ background: BG_PANEL, borderColor: BORDER }}>
          <SectionHeader icon={<MapPin size={15} />} title="Destination Status" />
          <div className="flex flex-col gap-2">
            {(destinations ?? [])
              .slice()
              .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
              .map((dest) => {
                const c = dest.status === 'delivered' ? CYAN : dest.status === 'failed' ? ERROR : MUTED
                return (
                  <div key={dest.destination_id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border"
                    style={{ background: BG_CARD, borderColor: BORDER_C }}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MapPin size={13} style={{ color: ERROR }} className="shrink-0" />
                      <span className="text-sm text-white/80 truncate">{dest.address}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: c }}>
                        {dest.status}
                      </span>
                      {dest.delivered_at && (
                        <span className="text-[10px]" style={{ color: MUTED }}>
                          {formatDateTime(dest.delivered_at)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border p-4 flex flex-col gap-4"
        style={{ background: BG_PANEL, borderColor: BORDER }}>
        <SectionHeader icon={<History size={15} />} title="Booking Timeline" />
        <StatusTimeline booking={booking} />
      </div>

      {/* Transaction documents (Cloudinary URLs) */}
      {docs.length > 0 && (
        <div className="rounded-xl border p-4 flex flex-col gap-3"
          style={{ background: BG_PANEL, borderColor: BORDER }}>
          <SectionHeader icon={<FileText size={15} />} title="Transaction Documents" />
          <div className="flex flex-col gap-2">
            {docs.map((url: string, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 border"
                style={{ background: BG_CARD, borderColor: BORDER_C }}>
                <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                  <FileText size={13} style={{ color: MUTED }} className="shrink-0" />
                  <span className="text-xs text-white/80 truncate">{fileNameFromUrl(url)}</span>
                </div>
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider
                             transition-opacity hover:opacity-70 shrink-0"
                  style={{ color: CYAN }}>
                  <Download size={12} /> Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancellation notice */}
      {booking.status === 'CANCELLED' && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: `${ERROR}10`, border: `1px solid ${ERROR}30`, color: ERROR }}>
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>This booking was cancelled. Contact support if you believe this was an error.</span>
        </div>
      )}
    </motion.div>
  )
}

type View = 'list' | 'detail'

export default function BookingHistoryModule() {
  const clientId = useAuthStore((s) => s.user?.clients?.client_id)

  const [bookings,    setBookings]    = useState<BookingWithRelations[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [view,        setView]        = useState<View>('list')
  const [selected,    setSelected]    = useState<BookingWithRelations | null>(null)
  const [search,      setSearch]      = useState('')
  const [activeTab,   setActiveTab]   = useState<BookingStatus | 'all'>('all')
  const [sortBy,      setSortBy]      = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const dateFromRef = useRef<HTMLInputElement>(null)
  const dateToRef   = useRef<HTMLInputElement>(null)

  const loadBookings = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const data = await bookingService.fetchBookingsByClient(clientId)
      setBookings(data)
    } catch {
      setError('Failed to load bookings. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { loadBookings() }, [loadBookings])

  const filtered = bookings
    .filter((b) => {
      const bStatus     = asBookingStatus(b.status)
      const matchTab    = activeTab === 'all' || bStatus === activeTab
      const q           = search.toLowerCase()
      const bOrigin     = (b.origin as string | undefined) ?? ''
      const bDests      = (b.booking_destinations as BookingDestination[] | undefined) ?? []
      const matchSearch =
        !q ||
        b.reference_number?.toLowerCase().includes(q) ||
        b.booking_id.toLowerCase().includes(q) ||
        bOrigin.toLowerCase().includes(q) ||
        bDests.some((d) => d.address.toLowerCase().includes(q))
      const schedDate   = (b.schedule_date as string | undefined) ?? ''
      const matchFrom   = !dateFrom || schedDate >= dateFrom
      const matchTo     = !dateTo   || schedDate <= dateTo
      return matchTab && matchSearch && matchFrom && matchTo
    })
    .sort((a, b) => {
      const aDate = (a.schedule_date as string | undefined) ?? ''
      const bDate = (b.schedule_date as string | undefined) ?? ''
      const aCost = (a.total_cost as number | null | undefined) ?? 0
      const bCost = (b.total_cost as number | null | undefined) ?? 0
      if (sortBy === 'date_desc')   return bDate.localeCompare(aDate)
      if (sortBy === 'date_asc')    return aDate.localeCompare(bDate)
      if (sortBy === 'amount_desc') return bCost - aCost
      if (sortBy === 'amount_asc')  return aCost - bCost
      return 0
    })

  const counts = TABS.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] = t.key === 'all'
      ? bookings.length
      : bookings.filter((b) => asBookingStatus(b.status) === t.key).length
    return acc
  }, {})

  const hasActiveFilters =
    !!dateFrom || !!dateTo || sortBy !== 'date_desc' || !!search || activeTab !== 'all'

  function clearFilters() {
    setDateFrom(''); setDateTo('')
    setSortBy('date_desc'); setSearch(''); setActiveTab('all')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG_PAGE, color: '#fff' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 lg:px-6 py-4 border-b shrink-0"
        style={{ borderColor: BORDER }}>
        {view === 'detail' && (
          <button onClick={() => { setView('list'); setSelected(null) }}
            className="flex items-center justify-center w-8 h-8 rounded-lg border transition-colors
                       hover:border-white/30 hover:text-white cursor-pointer shrink-0"
            style={{ borderColor: BORDER_C, color: MUTED }}>
            <ChevronLeft size={16} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <History size={18} style={{ color: CYAN }} />
          <h1 className="font-bold text-white text-base tracking-wide">
            {view === 'list' ? 'Transaction History' : (selected?.reference_number ?? selected?.booking_id.slice(0, 8).toUpperCase())}
          </h1>
        </div>
        {view === 'list' && !loading && (
          <>
            <button onClick={loadBookings} title="Refresh"
              className="ml-2 flex items-center justify-center w-7 h-7 rounded-lg border transition-colors
                         hover:border-white/30 hover:text-white cursor-pointer"
              style={{ borderColor: BORDER_C, color: MUTED }}>
              <RefreshCw size={13} />
            </button>
            <span className="ml-auto text-xs uppercase tracking-widest font-bold px-2 py-0.5 rounded"
              style={{ background: `${CYAN}18`, color: CYAN }}>
              {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {view === 'detail' && selected && (
          <div className="ml-auto"><StatusBadgeRaw status={selected.status} /></div>
        )}
      </div>

      {/* Breadcrumb */}
      {view === 'detail' && selected && (
        <div className="flex items-center gap-1.5 px-4 lg:px-6 py-2 text-xs border-b shrink-0"
          style={{ borderColor: BORDER, color: MUTED }}>
          <button onClick={() => { setView('list'); setSelected(null) }}
            className="hover:text-white transition-colors cursor-pointer">
            Transaction History
          </button>
          <ChevronRight size={11} />
          <span style={{ color: CYAN }}>{selected.reference_number ?? selected.booking_id.slice(0, 8).toUpperCase()}</span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <AnimatePresence mode="wait">

          {view === 'list' && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-4">

              {/* Search + filter toggle */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <TextField
                    fullWidth
                    placeholder="Search by reference number, pickup, or drop-off…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="outlined"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search size={15} style={{ color: MUTED }} />
                        </InputAdornment>
                      ),
                      endAdornment: search ? (
                        <InputAdornment position="end">
                          <button onClick={() => setSearch('')}
                            className="cursor-pointer hover:text-white transition-colors"
                            style={{ color: MUTED }}>
                            <X size={14} />
                          </button>
                        </InputAdornment>
                      ) : null,
                    }}
                    sx={{
                      ...fieldSx(BG_PANEL, BORDER),
                      '& .MuiInputBase-input': {
                        padding: '0 8px', height: 36, boxSizing: 'border-box',
                        '&::placeholder': { color: 'rgba(255,255,255,0.2)', opacity: 1 },
                      },
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-bold
                             uppercase tracking-wider transition-all cursor-pointer shrink-0"
                  style={{
                    borderColor: showFilters ? `${CYAN}60` : BORDER_C,
                    background:  showFilters ? `${CYAN}10` : 'transparent',
                    color:       showFilters ? CYAN : MUTED,
                  }}>
                  <Filter size={13} />Filters
                  {hasActiveFilters && (
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: CYAN }} />
                  )}
                </button>
              </div>

              {/* Expanded filters */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div key="filters"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="rounded-xl border p-4 flex flex-col gap-3"
                      style={{ background: BG_PANEL, borderColor: BORDER }}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: MUTED }}>Scheduled From</label>
                          <TextField
                            fullWidth type="date" value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            variant="outlined" inputRef={dateFromRef}
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <Calendar size={14} className="cursor-pointer hover:text-white transition-colors"
                                    style={{ color: MUTED }} onClick={() => dateFromRef.current?.showPicker()} />
                                </InputAdornment>
                              ),
                            }}
                            sx={{
                              ...fieldSx(BG_CARD, BORDER_C),
                              '& input[type="date"]::-webkit-calendar-picker-indicator': { display: 'none' },
                              '& .MuiInputBase-input': { padding: '0 0 0 12px', height: 36, boxSizing: 'border-box', colorScheme: 'dark' },
                            }}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: MUTED }}>Scheduled To</label>
                          <TextField
                            fullWidth type="date" value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            variant="outlined" inputRef={dateToRef}
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <Calendar size={14} className="cursor-pointer hover:text-white transition-colors"
                                    style={{ color: MUTED }} onClick={() => dateToRef.current?.showPicker()} />
                                </InputAdornment>
                              ),
                            }}
                            sx={{
                              ...fieldSx(BG_CARD, BORDER_C),
                              '& input[type="date"]::-webkit-calendar-picker-indicator': { display: 'none' },
                              '& .MuiInputBase-input': { padding: '0 0 0 12px', height: 36, boxSizing: 'border-box', colorScheme: 'dark' },
                            }}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: MUTED }}>Sort By</label>
                          <Select value={sortBy}
                            onChange={(e: SelectChangeEvent) => setSortBy(e.target.value as typeof sortBy)}
                            sx={{ ...selectSx(BG_CARD, BORDER_C), width: '100%' }} MenuProps={MENU_PROPS}>
                            <MenuItem value="date_desc">Date — Newest First</MenuItem>
                            <MenuItem value="date_asc">Date — Oldest First</MenuItem>
                            <MenuItem value="amount_desc">Amount — Highest First</MenuItem>
                            <MenuItem value="amount_asc">Amount — Lowest First</MenuItem>
                          </Select>
                        </div>
                      </div>
                      {hasActiveFilters && (
                        <div className="flex justify-end">
                          <button onClick={clearFilters}
                            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider
                                       transition-opacity hover:opacity-70 cursor-pointer"
                            style={{ color: ERROR }}>
                            <RefreshCw size={12} /> Clear Filters
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tab bar */}
              <div className="flex items-center gap-0 border-b overflow-x-auto scrollbar-none"
                style={{ borderColor: BORDER }}>
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    className="flex items-center gap-1.5 pb-2 px-3 text-xs font-bold uppercase
                               tracking-wider transition-colors whitespace-nowrap cursor-pointer"
                    style={
                      activeTab === t.key
                        ? { color: '#fff', borderBottom: `2px solid ${CYAN}`, marginBottom: -1 }
                        : { color: MUTED }
                    }>
                    {t.label}
                    <span className="px-1.5 py-0.5 rounded-sm text-[10px]"
                      style={{
                        background: activeTab === t.key ? `${CYAN}22` : 'rgba(255,255,255,0.06)',
                        color:      activeTab === t.key ? CYAN : MUTED,
                      }}>
                      {counts[t.key] ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Results count */}
              {(search || dateFrom || dateTo) && !loading && (
                <p className="text-xs" style={{ color: MUTED }}>
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''} found
                </p>
              )}

              {/* Loading */}
              {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              )}

              {/* Error */}
              {!loading && error && (
                <div className="flex flex-col items-center gap-3 py-16">
                  <AlertCircle size={32} style={{ color: ERROR }} />
                  <p className="text-sm" style={{ color: ERROR }}>{error}</p>
                  <button onClick={loadBookings}
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider
                               transition-opacity hover:opacity-70 cursor-pointer"
                    style={{ color: CYAN }}>
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              )}

              {/* Empty */}
              {!loading && !error && filtered.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16">
                  <Package size={32} style={{ color: MUTED }} />
                  <p className="text-sm" style={{ color: MUTED }}>
                    {bookings.length === 0 ? 'No bookings yet.' : 'No bookings match your filters.'}
                  </p>
                  {hasActiveFilters && (
                    <button onClick={clearFilters}
                      className="text-xs underline underline-offset-2 cursor-pointer hover:opacity-80"
                      style={{ color: CYAN }}>
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              {/* Cards */}
              {!loading && !error && filtered.length > 0 && (
                <motion.div variants={stagger} initial="hidden" animate="show"
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filtered.map((b) => (
                    <BookingCard key={b.booking_id} booking={b}
                      onSelect={() => { setSelected(b); setView('detail') }} />
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Detail */}
          {view === 'detail' && selected && (
            <BookingDetail key="detail" booking={selected} />
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}