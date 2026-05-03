'use client'

import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import type { OptimizedStop } from '@/app/types/maps/routemap.types'

interface DirectionsRendererProps {
  encodedPolyline?: string | null
  origin: { latitude: number; longitude: number }
  stops: OptimizedStop[]
  onDurations?: (total: number, legs: number[]) => void
}

export function decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
  const points: google.maps.LatLngLiteral[] = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

export function DirectionsRenderer({
  encodedPolyline,
  origin,
  stops,
  onDurations,
}: DirectionsRendererProps) {
  const map         = useMap()
  const polylineRef = useRef<google.maps.Polyline | null>(null)
  const renderedRef = useRef<string | null>(null)

  const originLat = origin.latitude
  const originLng = origin.longitude
  const stopsKey  = stops.map((s) => s.destination_id).join(',')

  useEffect(() => {
    if (!map || !encodedPolyline) return
    if (renderedRef.current === encodedPolyline) return

    polylineRef.current?.setMap(null)

    const path = decodePolyline(encodedPolyline)

    polylineRef.current = new google.maps.Polyline({
      path,
      strokeColor:   '#06b6d4',
      strokeWeight:  4,
      strokeOpacity: 0.9,
      map,
    })

    renderedRef.current = encodedPolyline

    onDurations?.(0, [])

    return () => {
      polylineRef.current?.setMap(null)
      polylineRef.current = null
      renderedRef.current = null
    }
  }, [map, encodedPolyline]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchingRef = useRef(false)

  useEffect(() => {
    if (!map || encodedPolyline || stops.length === 0) return
    if (fetchingRef.current) return

    let mounted = true
    fetchingRef.current = true

    import('@/lib/api/directions.api')
      .then(({ computeDirections }) =>
        computeDirections({
          origin: {
            location: { latLng: { latitude: originLat, longitude: originLng } },
          },
          destination: {
            location: {
              latLng: {
                latitude:  stops[stops.length - 1].latitude,
                longitude: stops[stops.length - 1].longitude,
              },
            },
          },
          ...(stops.length > 1 && {
            intermediates: stops.slice(0, -1).map((stop) => ({
              location: { latLng: { latitude: stop.latitude, longitude: stop.longitude } },
              via: true,  // ← forces strict pass-through order, fixes one-way street routing
            })),
          }),
          travelMode:        'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          routeModifiers: {
            avoidTolls:    false,
            avoidHighways: false,
            avoidFerries:  true,
          },
        })
      )
      .then((data) => {
        if (!mounted) return

        const route   = data?.routes?.[0]
        const encoded = route?.polyline?.encodedPolyline
        if (!encoded) return

        polylineRef.current?.setMap(null)
        polylineRef.current = new google.maps.Polyline({
          path:          decodePolyline(encoded),
          strokeColor:   '#06b6d4',
          strokeWeight:  4,
          strokeOpacity: 0.9,
          map,
        })

        const parseSecs = (d?: string) => parseInt(d ?? '0')
        const totalSecs = parseSecs(route?.duration)
        const legSecs   = (route?.legs ?? []).map(
          (l: { duration?: string }) => parseSecs(l.duration)
        )
        onDurations?.(totalSecs, legSecs)
      })
      .catch((err) => {
        console.error('[DirectionsRenderer] fallback directions error —', err)
      })
      .finally(() => {
        fetchingRef.current = false
      })

    return () => {
      mounted = false
      fetchingRef.current = false
      polylineRef.current?.setMap(null)
      polylineRef.current = null
    }
  }, [map, encodedPolyline, originLat, originLng, stopsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}