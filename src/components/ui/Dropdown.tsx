'use client'

import * as React from 'react'
import { useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/*
 * Every dropdown on the web (user 2026-11-16: shadcn Select everywhere, the
 * phone's own picker on phones).
 *
 * A drop-in for <select>: same <option> children, same value / onChange(e) /
 * disabled / id / aria-label / className / style. Below 768 px it IS a native
 * <select>, so iOS and Android show their own picker (scroll wheel, sized to
 * the screen, works with the keyboard and accessibility settings). From 768 px
 * (tablets and desktop) it is the shadcn/Radix Select in the app's dark menu.
 *
 * Rules:
 * - An <option value=""> is the "nothing picked" choice. A disabled one is only
 *   the placeholder; an enabled one ("All types", "Not about a booking") is a
 *   real choice that sets the value back to ''.
 * - onChange gets a minimal event: e.target.value (and name). Nothing else on
 *   the event is real on tablets and desktop.
 * - className styles the closed box on both; it gets a chevron of its own, so
 *   don't add one (pass chevron={false} when the page draws its own).
 * - <option data-hint="centimetres">CM</option> gives a short choice its full
 *   name. Tablets and desktop: a tooltip on the item (hover or keyboard) and on
 *   the closed box. Phones (no hover): the phone's own list reads
 *   "CM – centimetres" while the closed box still shows "CM".
 * **Rule: never use a plain <select> or MUI Select on the web; use Dropdown
 * (or Combobox for long lists that need a search).**
 */

const DESKTOP_QUERY = '(min-width: 768px)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY)
  // Safari before 14 has only addListener on a MediaQueryList.
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }
  mq.addListener(onChange)
  return () => mq.removeListener(onChange)
}

/** True on tablets and desktop (768 px and up). Native picker (false) on the server and phones. */
export function useDesktopPicker(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}

export interface PickerOption {
  value:    string
  label:    React.ReactNode
  /** The label as plain text (search, the native fallback). */
  text:     string
  disabled: boolean
  /** Full name of a short choice (<option data-hint>): tooltip on desktop, spelled out on phones. */
  hint?:    string
}

function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children)
  return ''
}

/** Reads <option> children (arrays, fragments and nulls from .map() are fine). */
export function readOptions(children: React.ReactNode): PickerOption[] {
  const out: PickerOption[] = []
  const walk = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      const props = child.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode; 'data-hint'?: string }
      if (child.type === React.Fragment) { walk(props.children); return }
      if (child.type !== 'option') return
      const text = nodeText(props.children).replace(/\s+/g, ' ').trim()
      out.push({
        value:    props.value == null ? text : String(props.value),
        label:    props.children,
        text,
        disabled: !!props.disabled,
        ...(props['data-hint'] ? { hint: props['data-hint'] } : {}),
      })
    })
  }
  walk(children)
  return out
}

/** Radix Select can't hold '' as an item value; this stands in for it. */
export const EMPTY_VALUE = '__none__'

export function changeEvent(value: string, name?: string): React.ChangeEvent<HTMLSelectElement> {
  const target = { value, name: name ?? '' }
  return { target, currentTarget: target } as unknown as React.ChangeEvent<HTMLSelectElement>
}

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`

export type DropdownProps =
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'defaultValue' | 'onChange' | 'multiple'> & {
    value?:    string | number | null
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
    /** false when the page draws its own arrow next to the box. */
    chevron?:  boolean
    /** Extra classes for the open menu (tablets and desktop). */
    contentClassName?: string
  }

/** The native select used on phones (and by Combobox there). */
export function NativeDropdown({ className, style, chevron = true, value, children, ...props }: DropdownProps) {
  const rest = { ...props }
  delete rest.contentClassName
  const current = value == null ? '' : String(value)
  const options = readOptions(children)
  const hinted = options.some((o) => o.hint)

  const select = (
    <select
      {...rest}
      value={current}
      className={cn(className, 'cursor-pointer appearance-none disabled:cursor-not-allowed', chevron && 'pr-8')}
      style={{
        colorScheme: 'dark',
        ...(chevron ? { backgroundImage: CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' } : {}),
        // The box's own text is hidden; the short label is drawn over it (below).
        ...(hinted ? { color: 'transparent', WebkitTextFillColor: 'transparent' } : {}),
        ...style,
      }}
    >
      {hinted
        ? options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled} style={{ color: '#fff', WebkitTextFillColor: '#fff' }}>
            {o.hint ? `${o.text} – ${o.hint}` : o.text}
          </option>
        ))
        : children}
    </select>
  )
  if (!hinted) return select

  // The phone's list spells each choice out ("CM – centimetres"); the closed box
  // keeps the short label, drawn in the box's own padding and font.
  const shown = options.find((o) => o.value === current)
  return (
    <span className="relative inline-flex shrink-0">
      {select}
      <span aria-hidden
        className={cn(className, 'pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap border-transparent bg-transparent', chevron && 'pr-8')}>
        {shown?.text ?? ''}
      </span>
    </span>
  )
}

/** The font of the closed box, so the menu (portaled to <body>) reads the same. */
export function useTriggerFont() {
  const ref = useRef<HTMLButtonElement>(null)
  const [font, setFont] = useState<string | undefined>()
  const capture = () => {
    if (ref.current) setFont(getComputedStyle(ref.current).fontFamily)
  }
  return { ref, font, capture }
}

export default function Dropdown(props: DropdownProps) {
  const desktop = useDesktopPicker()
  if (!desktop) return <NativeDropdown {...props} />
  return <DesktopDropdown {...props} />
}

/** Wraps a trigger or menu item in a tooltip with the option's full name (hover / keyboard focus). */
function withHint(hint: string | undefined, side: 'right' | 'bottom', node: React.ReactElement) {
  if (!hint) return node
  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side={side}>{hint}</TooltipContent>
    </Tooltip>
  )
}

function DesktopDropdown({
  value, onChange, children, className, style, chevron = true, contentClassName,
  id, name, disabled, required, autoFocus, title,
  onBlur, onFocus,
  ...rest
}: DropdownProps) {
  const options = readOptions(children)
  const emptyOption = options.find((o) => o.value === '')
  const emptyIsChoice = !!emptyOption && !emptyOption.disabled
  const items = options.filter((o) => o.value !== '' || !o.disabled)

  const current = value == null ? '' : String(value)
  // '' with no "nothing" choice in the list: show the placeholder.
  const radixValue = current === '' ? (emptyIsChoice ? EMPTY_VALUE : '') : current

  const { ref, font, capture } = useTriggerFont()
  const currentHint = options.find((o) => o.value === current)?.hint

  // aria-*, data-* and the like go on the button.
  const triggerProps = Object.fromEntries(
    Object.entries(rest).filter(([k]) => k.startsWith('aria-') || k.startsWith('data-') || k === 'tabIndex' || k === 'role'),
  )

  return (
    <Select
      value={radixValue}
      onValueChange={(v) => onChange?.(changeEvent(v === EMPTY_VALUE ? '' : v, name))}
      onOpenChange={(open) => { if (open) capture() }}
      disabled={disabled}
      required={required}
      name={name}
    >
      {withHint(currentHint, 'bottom',
        <SelectTrigger
          ref={ref}
          id={id}
          title={title}
          autoFocus={autoFocus}
          chevron={chevron}
          onBlur={onBlur as unknown as React.FocusEventHandler<HTMLButtonElement>}
          onFocus={onFocus as unknown as React.FocusEventHandler<HTMLButtonElement>}
          className={className}
          style={style}
          {...triggerProps}
        >
          <span className="min-w-0 flex-1 truncate">
            <SelectValue placeholder={emptyOption && !emptyIsChoice ? emptyOption.label : undefined} />
          </span>
        </SelectTrigger>,
      )}
      <SelectContent className={contentClassName} style={font ? { fontFamily: font } : undefined}>
        {items.map((o) => (
          <React.Fragment key={o.value || EMPTY_VALUE}>
            {withHint(o.hint, 'right',
              <SelectItem value={o.value === '' ? EMPTY_VALUE : o.value} disabled={o.disabled}>
                {o.label}
              </SelectItem>,
            )}
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  )
}
