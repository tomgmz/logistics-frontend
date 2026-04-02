import { useCallback, useRef, useState } from 'react'

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

export interface ResolvedPlace {
  address: string
  latitude: number | null
  longitude: number | null
}

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

export interface PlaceSuggestion {
  label: string
  placeId: string
}

interface UsePlacesAutocompleteOptions {
  componentRestrictions?: { country: string | string[] }
  debounceMs?: number
}

export function usePlacesAutocomplete({
  componentRestrictions = { country: 'ph' },
  debounceMs = 300,
}: UsePlacesAutocompleteOptions = {}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(
    async (input: string) => {
      if (!input) {
        setSuggestions([])
        return
      }

      await loadGoogleMapsScript()

      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
      }

      setLoading(true)
      try {
        const { suggestions: raw } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: Array.isArray(componentRestrictions.country)
            ? componentRestrictions.country
            : [componentRestrictions.country],
        })

        setSuggestions(
          raw.map(s => ({
            label: s.placePrediction?.text?.toString() ?? '',
            placeId: s.placePrediction?.placeId ?? '',
          }))
        )
      } catch (e) {
        console.error(e)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    },
    [componentRestrictions]
  )

  const onInputChange = useCallback(
    (input: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => fetchSuggestions(input), debounceMs)
    },
    [fetchSuggestions, debounceMs]
  )

  const resolvePlace = useCallback(async (placeId: string): Promise<ResolvedPlace> => {
    await loadGoogleMapsScript()
    const place = new google.maps.places.Place({ id: placeId })
    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
    sessionTokenRef.current = null
    return {
      address:   place.formattedAddress ?? place.displayName ?? '',
      latitude:  place.location?.lat() ?? null,
      longitude: place.location?.lng() ?? null,
    }
  }, [])

  return { suggestions, loading, onInputChange, resolvePlace }
}