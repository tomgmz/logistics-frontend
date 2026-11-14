'use client'

/**
 * Building blocks of the booking side panel (Figma "booking detail frame"):
 * dark rounded cards, grey small-caps labels and outlined status tags. The
 * panel itself, and everything that acts on the booking, stays in
 * BookingManagementView.
 */

import { useId, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Info,
  MapPin,
  Building2,
  Calendar,
  Clock,
  Truck,
  User,
  Weight,
  SquareDashed,
  Ruler,
  FileText,
  Eye,
} from 'lucide-react'

import { PALETTE } from '@/lib/palette'
import { FileViewButton } from '@/components/ui/FileViewer'

/** Panel surfaces and greys from the design. Not badge colours, so not in the palette. */
export const PANEL_BG    = '#2a2828'
export const CARD_BG     = '#1b1b1b'
export const CARD_BORDER = '#424242'
export const MUTED       = '#818181'

export const CARD_CLASS = 'rounded-[15px] border border-[#424242] bg-[#1b1b1b]'

// ── Tag ──────────────────────────────────────────────────────────────────────

/** Outlined status tag. `color` is a 6-digit hex; null draws the grey "not this one" tag. */
export function Tag({
  color, children, size = 'sm', title,
}: { color: string | null; children: ReactNode; size?: 'sm' | 'md'; title?: string }) {
  const c = color ?? MUTED
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center rounded-[5px] border px-1 whitespace-nowrap leading-none ${
        size === 'md' ? 'text-base py-1' : 'text-sm py-0.5'
      }`}
      style={{ color: c, borderColor: c, background: `${c}${color ? '26' : '1a'}` }}
    >
      {children}
    </span>
  )
}

// ── Section heading ──────────────────────────────────────────────────────────

export function SectionHeading({
  icon, children, right, tone = 'muted',
}: {
  icon: ReactNode
  children: ReactNode
  right?: ReactNode
  /** 'bright' = white heading and icon (Booking Management, Figma 2026-11-14). */
  tone?: 'muted' | 'bright'
}) {
  const color = tone === 'bright' ? 'text-white' : 'text-[#818181]'
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      <span className={`shrink-0 flex items-center ${color}`}>{icon}</span>
      <h3 className={`text-sm font-bold uppercase min-w-0 ${color}`}>{children}</h3>
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  )
}

/** One of the three icons the design draws that Lucide has no match for. */
export function AssetIcon({ name, size = 18 }: { name: 'steering-wheel' | 'cargo-summary' | 'delivery-stops'; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/icons/booking-detail/${name}.svg`} alt="" width={size} height={size} className="shrink-0" />
  )
}

// ── Booking info card ────────────────────────────────────────────────────────

function InfoRow({ icon, children, strong = false }: { icon: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start gap-[7px]">
      <span className="shrink-0 mt-px flex">{icon}</span>
      <span className={`text-sm font-bold leading-[18px] min-w-0 break-words ${strong ? 'text-white' : 'text-[#818181]'}`}>
        {children}
      </span>
    </div>
  )
}

export function BookingInfoCard({
  reference, extras, origin, company, date, time, vehicleType, driverLine, accentReference = false,
}: {
  reference:   string
  /** Booking number in cyan (Booking Management design). */
  accentReference?: boolean
  /** Submitted time, after-hours and problem badges — under the reference. */
  extras?:     ReactNode
  origin:      string
  company:     string | null | undefined
  date:        string | null | undefined
  time:        string | null | undefined
  vehicleType: string | null | undefined
  /** Shown where no assignment card carries the crew. */
  driverLine?: string | null
}) {
  const iconProps = { size: 18, strokeWidth: 2, className: 'text-[#818181]' }
  return (
    <div className={`${CARD_CLASS} px-3.5 pt-2.5 pb-3.5 space-y-2`}>
      <p className="text-sm font-bold break-all" style={{ color: accentReference ? PALETTE.cyan : MUTED }}>{reference}</p>
      {extras}
      <InfoRow icon={<MapPin size={18} strokeWidth={2} style={{ color: PALETTE.cyan }} />} strong>
        {origin || '—'}
      </InfoRow>
      <InfoRow icon={<Building2 {...iconProps} />}>{company || '—'}</InfoRow>
      <InfoRow icon={<Calendar {...iconProps} />}>{date || '—'}</InfoRow>
      <InfoRow icon={<Clock {...iconProps} />}>{time || '—'}</InfoRow>
      <InfoRow icon={<Truck {...iconProps} />}>{vehicleType || 'Vehicle not assigned yet'}</InfoRow>
      {driverLine && (
        <InfoRow icon={<User {...iconProps} />}>Driver: {driverLine}</InfoRow>
      )}
    </div>
  )
}

// ── Cargo item card ──────────────────────────────────────────────────────────

export function CargoLine({ label, value, accent = false }: { label: ReactNode; value: string | null; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[34px] px-[15px] py-1.5 border-b-[0.5px] border-[#818181] last:border-b-0">
      <span className="text-sm font-bold text-[#818181] leading-tight min-w-0">{label}</span>
      <span
        className="text-sm font-bold text-right leading-tight break-words max-w-[55%]"
        style={{ color: value == null ? MUTED : accent ? PALETTE.cyan : '#ffffff' }}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

export function CargoItemCard({
  index, dropOff, quantity, commodity, product, shc, ashc, weight, volume, dims, notes,
}: {
  index:     number
  /** 1-based drop-off this line goes to, when the booking recorded one. */
  dropOff:   number | null
  quantity:  number | null | undefined
  commodity: string | null
  product:   string | null
  shc:       string | null
  ashc:      string | null
  weight:    string | null
  volume:    string | null
  dims:      string | null
  notes:     string | null | undefined
}) {
  return (
    <div className={`${CARD_CLASS} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 min-h-[34px] px-[15px] py-1.5 border-b-[0.5px] border-[#818181]">
        <span className="text-sm font-bold" style={{ color: PALETTE.cyan }}>
          Cargo {index}
          {dropOff != null && <span className="text-white"> (drop off {dropOff})</span>}
        </span>
        {quantity != null && quantity > 0 && (
          <span className="text-sm font-bold shrink-0" style={{ color: PALETTE.cyan }}>
            {quantity}x piece{quantity === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <CargoLine label="Commodity" value={commodity} />
      <CargoLine label="Product" value={product} />
      <CargoLine label="Special Handling Code" value={shc} />
      <CargoLine label="Additional Special Handling Code" value={ashc} />
      <CargoLine label="Weight" value={weight} accent />
      <CargoLine label="Volume" value={volume} accent />
      <CargoLine
        label={<>Length <span className="text-[#424242]">x</span> Width <span className="text-[#424242]">x</span> Height</>}
        value={dims}
        accent
      />
      {notes && <CargoLine label="Notes" value={notes} />}
    </div>
  )
}

// ── Cargo summary tiles ──────────────────────────────────────────────────────

function SummaryTile({ icon, label, value, unit }: { icon: ReactNode; label: string; value: string | null; unit: string }) {
  return (
    <div className="rounded-[10px] border border-[#424242] bg-[#1b1b1b] min-h-[85px] px-2.5 pt-1.5 pb-2 flex flex-col min-w-0">
      <span className="flex items-center gap-1.5 text-xs font-bold text-[#818181] min-w-0">
        <span className="shrink-0 flex">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className={`mt-auto text-lg font-bold tabular-nums truncate ${value ? 'text-white' : 'text-[#818181]'}`}>
        {value ?? '—'}
      </span>
      <span className="text-xs font-bold text-[#818181]">{unit}</span>
    </div>
  )
}

export function CargoSummaryTiles({
  weightKg, volumeCbm, lengthCm,
}: { weightKg: number | null; volumeCbm: number | null; lengthCm: number | null }) {
  const icon = { size: 12, strokeWidth: 2, className: 'text-[#818181]' }
  return (
    <div className="grid grid-cols-3 gap-2">
      <SummaryTile icon={<Weight {...icon} />} label="Gross Wt." unit="KG"
        value={weightKg ? weightKg.toFixed(2) : null} />
      <SummaryTile icon={<SquareDashed {...icon} />} label="Volume" unit="CBM"
        value={volumeCbm ? volumeCbm.toFixed(volumeCbm < 1 ? 4 : 2) : null} />
      <SummaryTile icon={<Ruler {...icon} />} label="Max Len." unit="CM"
        value={lengthCm ? lengthCm.toFixed(0) : null} />
    </div>
  )
}

// ── Delivery stop card ───────────────────────────────────────────────────────

export const STOP_STATUS_COLOR: Record<string, string> = {
  pending:   PALETTE.yellow,
  delivered: PALETTE.green,
  failed:    PALETTE.red,
}

export function StopCard({
  address, status, statuses, label, children,
}: {
  address:  string
  status:   string
  statuses: readonly string[]
  label:    (s: string) => string
  /** Proof photo, under the tags. */
  children?: ReactNode
}) {
  return (
    <li className={`${CARD_CLASS} px-3.5 pt-2 pb-3 space-y-2.5`}>
      <p className="text-sm font-bold text-[#818181] leading-snug break-words">{address}</p>
      <div className="flex flex-wrap gap-1.5">
        {statuses.map((st) => (
          <Tag key={st} color={status === st ? STOP_STATUS_COLOR[st] ?? null : null}>
            {label(st)}
          </Tag>
        ))}
      </div>
      {children}
    </li>
  )
}

// ── Transaction document row ─────────────────────────────────────────────────

export function DocumentRow({ url, filename }: { url: string; filename: string }) {
  return (
    <FileViewButton
      url={url}
      name={filename}
      className={`${CARD_CLASS} w-full flex items-center gap-3 min-h-[48px] px-4 py-2 group transition-colors hover:border-[#4df9ed]/50`}
    >
      <FileText size={18} strokeWidth={2} className="shrink-0 text-[#818181]" />
      <span className="flex-1 min-w-0 truncate text-lg text-white">{filename}</span>
      <Eye size={18} strokeWidth={2} className="shrink-0 text-[#818181] group-hover:text-white transition-colors" />
    </FileViewButton>
  )
}

// ── Booking Management panel pieces (Figma "booking_management_panels", 2026-11-14) ──

/** The big teal action button: "Choose vehicle and driver", "Set Call Time", "Save Plan"… */
export const TEAL_BUTTON_CLASS =
  'w-full min-h-[46px] px-4 py-2 rounded-[10px] border text-base font-bold transition-colors ' +
  'disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-center'
export const TEAL_BUTTON_STYLE = { background: '#244543', borderColor: PALETTE.cyan, color: PALETTE.cyan } as const
/** Its outlined grey partner ("Cancel"). */
export const GREY_BUTTON_STYLE = { background: 'transparent', borderColor: MUTED, color: MUTED } as const

/** Dashed rule between groups of the panel. */
export function DashedDivider() {
  return <div aria-hidden className="border-t border-dashed border-[#818181]/70 my-1" />
}

/** "(i)" next to a card title: the explanation shows on hover, focus or tap. */
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label="About this"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="flex p-0.5 rounded-full text-[#818181] [@media(hover:hover)]:hover:text-white"
      >
        <Info size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <span id={id} role="tooltip"
          className="absolute right-0 top-full mt-1.5 z-20 w-[min(260px,70vw)] rounded-lg border border-[#424242] bg-[#111] px-3 py-2 text-xs font-normal normal-case leading-snug text-white/80 shadow-xl">
          {text}
        </span>
      )}
    </span>
  )
}

/** The design's card: icon + title (+ grey subtitle) and an (i) explanation. */
export function DesignCard({
  icon, title, subtitle, info, children, className = '',
}: {
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  info?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-[15px] border border-[#424242] bg-[#1b1b1b] px-3.5 sm:px-4 pt-3 pb-4 space-y-3 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="shrink-0 flex mt-px" style={{ color: PALETTE.cyan }}>{icon}</span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white leading-tight">{title}</h3>
            {subtitle && <div className="text-xs leading-tight mt-0.5">{subtitle}</div>}
          </div>
        </div>
        {info && <InfoTip text={info} />}
      </div>
      {children}
    </div>
  )
}

/** A cyan heading that opens and closes its section (Trips, Stop Times, Changes after Rejection). */
export function CollapsibleSection({
  title, children, defaultOpen = false, badge,
}: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className="border-b border-[#424242]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="w-full flex items-center justify-between gap-3 py-3 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-bold uppercase leading-tight" style={{ color: PALETTE.cyan }}>{title}</span>
          {badge}
        </span>
        <ChevronDown size={18} strokeWidth={2} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: PALETTE.cyan }} />
      </button>
      {/* Kept mounted while closed so live updates and an unsaved trip plan survive closing it. */}
      <div id={id} hidden={!open} className="pb-4">{children}</div>
    </section>
  )
}
