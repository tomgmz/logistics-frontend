'use client'

import { useEffect, useRef } from 'react'
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { OptimizedStop } from '@/app/types/maps/routemap.types'

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!

interface DirectionsRendererProps {
  origin: { latitude: number; longitude: number }
  stops: OptimizedStop[]
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

export function DirectionsRenderer({ origin, stops }: DirectionsRendererProps) {
  const map = useMap()
  const routesLibrary = useMapsLibrary('routes')
  const polylineRef = useRef<google.maps.Polyline | null>(null)

  useEffect(() => {
    if (!map || !routesLibrary || stops.length === 0) return

    const controller = new AbortController()

    fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
        'X-Goog-FieldMask': 'routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: {
          location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } },
        },
        destination: {
          location: {
            latLng: {
              latitude: stops[stops.length - 1].latitude,
              longitude: stops[stops.length - 1].longitude,
            },
          },
        },
        ...(stops.length > 1 && {
          intermediates: stops.slice(0, -1).map((stop) => ({
            location: { latLng: { latitude: stop.latitude, longitude: stop.longitude } },
          })),
        }),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        const encoded = data?.routes?.[0]?.polyline?.encodedPolyline
        if (!encoded) return

        polylineRef.current?.setMap(null)
        polylineRef.current = new google.maps.Polyline({
          path: decodePolyline(encoded),
          strokeColor: '#06b6d4',
          strokeWeight: 4,
          strokeOpacity: 0.9,
          map,
        })
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error('Routes API error:', err)
      })

    return () => {
      controller.abort()
      polylineRef.current?.setMap(null)
      polylineRef.current = null
    }
  }, [map, routesLibrary, origin, stops])

  return null
}