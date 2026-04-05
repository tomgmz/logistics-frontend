'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  loadGoogleMapsScript,
  usePlacesAutocomplete,
  PlaceSuggestion,
  ResolvedPlace,
} from '../../../lib/hooks/usePlacesAutoComplete'

const CYAN  = '#4DF9ED'
const RED   = '#f87171'
const BG    = '#0b0b14'
const PANEL = 'rgba(13,13,22,0.96)'

const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 }

const DARK_MAP_STYLES = [
  { elementType: 'geometry',            stylers: [{ color: '#0d0d1c' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#0d0d1c' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#6b7280' }] },
  { featureType: 'road',               elementType: 'geometry',         stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road',               elementType: 'geometry.stroke',  stylers: [{ color: '#252542' }] },
  { featureType: 'road.arterial',      elementType: 'labels.text.fill', stylers: [{ color: '#8b8b9a' }] },
  { featureType: 'road.highway',       elementType: 'geometry',         stylers: [{ color: '#1f1f3a' }] },
  { featureType: 'road.highway',       elementType: 'geometry.stroke',  stylers: [{ color: '#2d2d55' }] },
  { featureType: 'road.highway',       elementType: 'labels.text.fill', stylers: [{ color: CYAN }] },
  { featureType: 'water',              elementType: 'geometry',         stylers: [{ color: '#060612' }] },
  { featureType: 'water',              elementType: 'labels.text.fill', stylers: [{ color: '#3a3a5c' }] },
  { featureType: 'poi',                elementType: 'labels',           stylers: [{ visibility: 'on' }] },
  { featureType: 'poi.park',           elementType: 'geometry',         stylers: [{ color: '#0f1a0f' }] },
  { featureType: 'transit',            stylers: [{ visibility: 'on' }] },
  { featureType: 'administrative',     elementType: 'geometry',         stylers: [{ color: '#2a2a4a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
]

export interface MapLocationPickerProps {
  mode: 'pickup' | 'dropoff'
  onConfirm: (place: ResolvedPlace) => void
  onClose?: () => void
  initialValue?: string
}

const LocationIcon = ({ color }: { color: string }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

const CrosshairIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
)

const ArrowLeftIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
)

export default function MapLocationPicker({
  mode,
  onConfirm,
  onClose,
  initialValue = '',
}: MapLocationPickerProps) {
  const mapDivRef   = useRef<HTMLDivElement>(null)
  const mapRef      = useRef<google.maps.Map | null>(null)
  const geocoderRef = useRef<google.maps.Geocoder | null>(null)
  const searchRef   = useRef<HTMLDivElement>(null)

  const [address,     setAddress]     = useState(initialValue)
  const [coords,      setCoords]      = useState<{ lat: number; lng: number } | null>(null)
  const [isDragging,  setIsDragging]  = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [mapReady,    setMapReady]    = useState(false)
  const [searchQuery, setSearchQuery] = useState(initialValue)
  const [showSugg,    setShowSugg]    = useState(false)

  const { suggestions, onInputChange, resolvePlace } = usePlacesAutocomplete({ includedPrimaryTypes: [] })

  const pinColor    = mode === 'pickup' ? CYAN : RED
  const label       = mode === 'pickup' ? 'Pickup' : 'Drop-off'
  const confirmText = mode === 'pickup' ? 'Set Pickup Location' : 'Set Drop-off Location'
  const placeholder = mode === 'pickup'
    ? 'Search pickup address or place…'
    : 'Search drop-off address or place…'

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (!geocoderRef.current) return
    setIsGeocoding(true)
    try {
      const result = await geocoderRef.current.geocode({ location: { lat, lng } })
      const addr = result.results[0]?.formatted_address ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      setAddress(addr)
      setCoords({ lat, lng })
      setSearchQuery(addr)
    } catch {
      const addr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      setAddress(addr)
      setCoords({ lat, lng })
      setSearchQuery(addr)
    } finally {
      setIsGeocoding(false)
    }
  }, [])

  useEffect(() => {
    if (!mapDivRef.current) return
    let cancelled = false

    loadGoogleMapsScript().then(() => {
      if (cancelled || !mapDivRef.current) return

      geocoderRef.current = new google.maps.Geocoder()

      const map = new google.maps.Map(mapDivRef.current, {
        center:           DEFAULT_CENTER,
        zoom:             15,
        disableDefaultUI: true,
        gestureHandling:  'greedy',
        clickableIcons:   false,
        styles:           DARK_MAP_STYLES as google.maps.MapTypeStyle[],
      })

      mapRef.current = map
      setMapReady(true)

      navigator.geolocation?.getCurrentPosition(
        pos => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          map.setCenter(c)
        },
        () => {
          map.setCenter(DEFAULT_CENTER)
        }
      )

      map.addListener('dragstart', () => setIsDragging(true))
      map.addListener('dragend', () => {
        setIsDragging(false)
        const c = map.getCenter()
        if (c) reverseGeocode(c.lat(), c.lng())
      })
    })

    return () => { cancelled = true }
  }, [reverseGeocode])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowSugg(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSuggestionSelect = useCallback(async (s: PlaceSuggestion) => {
    const resolved = await resolvePlace(s.placeId)
    if (resolved.latitude !== null && resolved.longitude !== null) {
      const c = { lat: resolved.latitude, lng: resolved.longitude }
      mapRef.current?.setCenter(c)
      mapRef.current?.setZoom(17)
      setAddress(resolved.address)
      setCoords(c)
      setSearchQuery(resolved.address)
    }
    setShowSugg(false)
  }, [resolvePlace])

  const handleUseMyLocation = useCallback(() => {
    navigator.geolocation?.getCurrentPosition(pos => {
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      mapRef.current?.setCenter(c)
      mapRef.current?.setZoom(17)
      reverseGeocode(c.lat, c.lng)
    })
  }, [reverseGeocode])

  const canConfirm = !!coords && !!address && !isGeocoding

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return
    onConfirm({ address, latitude: coords!.lat, longitude: coords!.lng })
  }, [canConfirm, address, coords, onConfirm])

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: BG, fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div ref={mapDivRef} className="absolute inset-0" />

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: BG }}>
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: `${pinColor}60`, borderTopColor: pinColor }}
            />
            <p className="text-xs" style={{ color: `${pinColor}80` }}>Loading map…</p>
          </div>
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
        <div
          className="flex flex-col items-center"
          style={{
            transform:  isDragging ? 'translateY(-20px)' : 'translateY(0)',
            transition: 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1)',
            filter:     isDragging
              ? `drop-shadow(0 8px 24px ${pinColor}80)`
              : `drop-shadow(0 4px 12px ${pinColor}60)`,
          }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center border-[3px] border-white"
            style={{ background: pinColor, boxShadow: `0 0 0 4px ${pinColor}30` }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-white" />
          </div>
          <div className="w-px h-6" style={{ background: 'linear-gradient(to bottom, white 0%, transparent 100%)' }} />
          {!isDragging && (
            <div
              className="w-2 h-1 rounded-full"
              style={{ background: 'rgba(0,0,0,0.5)', filter: 'blur(1.5px)', marginTop: '-1px' }}
            />
          )}
        </div>
      </div>

      <div className="absolute top-0 left-0 right-0 z-30 p-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
                         text-white transition-opacity hover:opacity-70 active:opacity-50"
              style={{ background: PANEL, border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <ArrowLeftIcon />
            </button>
          )}

          {/* Search bar + dropdown */}
          <div ref={searchRef} className="relative flex-1">
            <div
              className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl transition-all w-full"
              style={{
                background: PANEL,
                border: `1px solid ${showSugg ? `${pinColor}50` : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <span style={{ flexShrink: 0 }}>
                <LocationIcon color={showSugg ? pinColor : 'rgba(255,255,255,0.3)'} />
              </span>

              <input
                className="flex-1 bg-transparent text-sm font-medium outline-none"
                style={{ color: '#fff', caretColor: pinColor }}
                placeholder={placeholder}
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value)
                  onInputChange(e.target.value)
                  setShowSugg(true)
                }}
                onFocus={() => suggestions.length > 0 && setShowSugg(true)}
              />

              {searchQuery && (
                <button
                  className="text-lg leading-none transition-opacity hover:opacity-70 flex-shrink-0"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                  onClick={() => {
                    setSearchQuery('')
                    onInputChange('')
                    setShowSugg(false)
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Suggestions dropdown — inside ref div so outside-click works */}
            {showSugg && suggestions.length > 0 && (
              <div
                className="absolute top-full left-0 right-0 mt-1.5 rounded-2xl overflow-hidden shadow-2xl z-50"
                style={{
                  background: PANEL,
                  border: '1px solid rgba(255,255,255,0.07)',
                  backdropFilter: 'blur(16px)',
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {suggestions.map((s, i) => (
                  <button
                    key={s.placeId}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left
                               transition-colors hover:bg-white/5 active:bg-white/10"
                    style={{ borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleSuggestionSelect(s)}
                  >
                    <div
                      className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${pinColor}15` }}
                    >
                      <LocationIcon color={pinColor} />
                    </div>
                    <span className="text-sm truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 z-30 p-4 flex flex-col gap-3"
        style={{ background: `linear-gradient(to top, ${BG} 70%, transparent)` }}
      >
        <button
          className="self-end flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium
                     transition-opacity hover:opacity-70 active:opacity-50"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)',
          }}
          onClick={handleUseMyLocation}
        >
          <CrosshairIcon />
          Use my location
        </button>

        <div
          className="flex items-start gap-3 p-4 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div
            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
            style={{ backgroundColor: pinColor, boxShadow: `0 0 6px ${pinColor}` }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] mb-1 font-semibold uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.35)' }}>
              {label}
            </p>
            {isGeocoding ? (
              <div className="flex items-center gap-2">
                <div
                  className="w-3.5 h-3.5 rounded-full border border-t-transparent animate-spin flex-shrink-0"
                  style={{ borderColor: `${pinColor}60`, borderTopColor: pinColor }}
                />
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>Finding address…</span>
              </div>
            ) : (
              <p className="text-sm font-medium leading-snug"
                style={{ color: address ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                {address || 'Drag the map to pin a location'}
              </p>
            )}
          </div>
        </div>

        <button
          className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide transition-all active:scale-[0.98]"
          style={{
            background:    !canConfirm
              ? 'rgba(255,255,255,0.07)'
              : `linear-gradient(135deg, ${pinColor} 0%, ${pinColor}bb 100%)`,
            color:         !canConfirm ? 'rgba(255,255,255,0.25)' : BG,
            cursor:        !canConfirm ? 'not-allowed' : 'pointer',
            boxShadow:     !canConfirm ? 'none' : `0 4px 24px ${pinColor}40`,
            letterSpacing: '0.02em',
          }}
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          {confirmText}
        </button>
      </div>
    </div>
  )
}