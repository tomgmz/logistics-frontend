import { useEffect, useRef, useState } from 'react'

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

let scriptPromise: Promise<void> | null = null

function loadGoogleMapsScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.google?.maps?.places) return Promise.resolve()

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = [
      'https://maps.googleapis.com/maps/api/js',
      `?key=${GOOGLE_MAPS_API_KEY}`,
      '&libraries=places',
      '&loading=async', 
      '&callback=__gmapsInit', 
    ].join('')
    script.async = true
    script.defer = true

    // Google calls the global callback instead of script.onload
    ;(window as unknown as Record<string, () => void>)['__gmapsInit'] = () => {
      resolve()
      delete (window as unknown as Record<string, unknown>)['__gmapsInit']
    }

    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load Google Maps'))
    }

    document.head.appendChild(script)
  })

  return scriptPromise
}

interface UsePlacesAutocompleteOptions {
  onSelect: (value: string) => void
  componentRestrictions?: google.maps.places.ComponentRestrictions
}

export function usePlacesAutocomplete(
  inputRef: React.RefObject<HTMLInputElement | null>,
  { onSelect, componentRestrictions = { country: 'ph' } }: UsePlacesAutocompleteOptions,
) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadGoogleMapsScript()
      .then(() => setReady(true))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!ready || !inputRef.current) return
    if (autocompleteRef.current) return

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions,
      fields: ['formatted_address', 'name'],
    })

    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      const value = place.formatted_address ?? place.name ?? ''
      onSelect(value)
    })

    autocompleteRef.current = ac
  }, [ready, inputRef, onSelect, componentRestrictions])

  return { ready }
}