'use client'

import * as React from 'react'
import { useRef, useState, useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
      const props = child.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode }
      if (child.type === React.Fragment) { walk(props.children); return }
      if (child.type !== 'option') return
      const text = nodeText(props.children).replace(/\s+/g, ' ').trim()
      out.push({
        value:    props.value == null ? text : String(props.value),
        label:    props.children,
        text,
        disabled: !!props.disabled,
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
  return (
    <select
      {...rest}
      value={value == null ? '' : String(value)}
      className={cn(className, 'cursor-pointer appearance-none disabled:cursor-not-allowed', chevron && 'pr-8')}
      style={{
        colorScheme: 'dark',
        ...(chevron ? { backgroundImage: CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' } : {}),
        ...style,
      }}
    >
      {children}
    </select>
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
      </SelectTrigger>
      <SelectContent className={contentClassName} style={font ? { fontFamily: font } : undefined}>
        {items.map((o) => (
          <SelectItem key={o.value || EMPTY_VALUE} value={o.value === '' ? EMPTY_VALUE : o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
