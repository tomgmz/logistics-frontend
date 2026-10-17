'use client'

/**
 * Billing address: typed, with Google address suggestions as a shortcut.
 *
 * Deliberately not a pick-only or map field. A billing address goes on
 * paperwork and usually needs a unit and floor ("Unit 1203, 12/F Tower A, …")
 * that Google does not return, and nothing ever routes to it. So a suggestion
 * only fills the box, the text stays editable, and whatever was typed is kept
 * as typed — leaving the field never swaps it for a suggestion.
 */

import { useId, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { usePlacesAutocomplete, type PlaceSuggestion } from '@/lib/hooks/usePlacesAutoComplete'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value:    string
  onChange: (value: string) => void
  /** The form's own textarea classes, so it matches the fields around it. */
  textareaClassName: string
}

export default function BillingAddressField({ value, onChange, textareaClassName, disabled, ...props }: Props) {
  const { suggestions, loading, onInputChange, resolvePlace } = usePlacesAutocomplete()
  const [focused, setFocused]   = useState(false)
  // Set once a suggestion is taken (or the list is dismissed) and cleared by the
  // next keystroke, so the same list does not pop straight back up.
  const [closed, setClosed]     = useState(false)
  const [active, setActive]     = useState(-1)
  const [resolving, setResolving] = useState(false)
  const listId  = useId()
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const open = focused && !closed && !disabled && value.trim().length >= 3 && suggestions.length > 0

  const pick = async (s: PlaceSuggestion) => {
    setClosed(true)
    setActive(-1)
    setResolving(true)
    try {
      const resolved = await resolvePlace(s.placeId)
      onChange(resolved.address || s.label)
    } catch {
      // The suggestion's own text is still a usable address.
      onChange(s.label)
    } finally {
      setResolving(false)
      // Straight back to the box, so the unit or floor can be added in front.
      areaRef.current?.focus()
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      // Enter only takes a highlighted suggestion; otherwise it is a new line.
      e.preventDefault()
      void pick(suggestions[active])
    } else if (e.key === 'Escape') {
      // Close the list, not the whole form.
      e.preventDefault()
      e.stopPropagation()
      setClosed(true)
      setActive(-1)
    }
  }

  return (
    <div>
      <div className="relative">
      <textarea
        {...props}
        ref={areaRef}
        value={value}
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value)
          onInputChange(e.target.value)
          setClosed(false)
          setActive(-1)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setActive(-1) }}
        onKeyDown={onKeyDown}
        className={`${textareaClassName} pr-8`}
      />
      {(loading || resolving) && focused && (
        <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-[#4df9ed]" aria-hidden />
      )}

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-20 rounded-[10px] border border-[#2a2a2a] bg-[#1b1b1b] shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
        >
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {suggestions.map((s, i) => (
              <li
                key={s.placeId || s.label}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: a click would blur the box first and
                // close the list before the pick lands.
                onMouseDown={(e) => { e.preventDefault(); void pick(s) }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-start gap-2 px-3 py-2 text-[13px] leading-snug cursor-pointer ${
                  i === active ? 'bg-[#252525] text-white' : 'text-[#ccc]'
                }`}
              >
                <MapPin size={13} className="shrink-0 mt-0.5 text-[#818181]" />
                <span className="min-w-0 break-words">{s.label}</span>
              </li>
            ))}
          </ul>
          {/* Google requires attribution when its suggestions are shown without a map. */}
          <p className="px-3 py-1.5 border-t border-[#2a2a2a] text-[10px] text-[#666] text-right">
            Suggestions by Google
          </p>
        </div>
      )}
      </div>
      <p className="mt-1 text-[11px] text-[#555] leading-snug">
        Pick a suggestion or type it in full. Add the unit or floor if needed.
      </p>
    </div>
  )
}
