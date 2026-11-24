/*
 * Route map: interactive Leaflet OpenStreetMap of Marbella for the full route view,
 * with real coordinates, route polyline, numbered pins, and Google-style popup cards.
 * Falls back cleanly to schematic SVG for thumbnail/card variants and unit test environments.
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import catalog from '../../../../backend/lib/marbella.json'
import 'leaflet/dist/leaflet.css'
import { cx } from '../../lib/cx'
import { START, THUMB_START, layoutStops, layoutThumb, type Point } from './layout'
import styles from './RouteMap.module.css'

export type RouteMapVariant = 'full' | 'card' | 'thumb'

export type StopMapInfo = {
  order: number
  lat?: number
  lon?: number
  name?: string
  placeId?: string
  photo?: string
  rating?: number
  reviewsCount?: number
  price?: string
  hours?: string
  address?: string
}

type RouteMapProps = {
  stops: readonly StopMapInfo[]
  variant?: RouteMapVariant
  /** CSS height in px (defaults: full 230, card 150, thumb 96). */
  height?: number
  /** Accessible name (full and card). Thumbnails are decorative. */
  label?: string
  className?: string
  routeId?: string
}

const line = (points: Point[]) => points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')

/* ---------- component ---------- */

export function RouteMap({ stops, variant = 'full', height, label, className, routeId }: RouteMapProps) {
  const n = stops.length
  const a11y = variant === 'thumb' || !label ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': label }
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [interactive, setInteractive] = useState(false)

  useEffect(() => {
    if (variant !== 'full' || !mapContainerRef.current) return
    const validCoords = stops.filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number')
    if (validCoords.length === 0) return

    let map = mapInstanceRef.current
    if (!map) {
      try {
        map = L.map(mapContainerRef.current, {
          zoomControl: true,
          maxZoom: 19,
          minZoom: 9,
          attributionControl: true,
        })
        const tiles = import.meta.env.VITE_LOCAL_TILE_URL
        if (tiles?.startsWith('/') && !tiles.startsWith('//')) L.tileLayer(tiles, {
          maxZoom: 19,
        }).addTo(map)
        if (!tiles) {
          L.imageOverlay('/maps/marbella.jpg', [[36.477, -4.97], [36.520, -4.87]], {
            attribution: 'Cartografía: © Instituto Geográfico Nacional (IGN)',
          }).addTo(map)
        }
        mapInstanceRef.current = map
        setInteractive(true)
      } catch {
        return
      }
    }

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map?.removeLayer(layer)
      }
    })

    for (const point of catalog) {
      L.circleMarker([point.lat, point.lon], { radius: 3, color: '#765438' })
        .bindTooltip(point.name).addTo(map)
    }
    const latlngs: L.LatLngExpression[] = []
    stops.forEach((stop) => {
      if (stop.lat == null || stop.lon == null) return
      const latlng: L.LatLngExpression = [stop.lat, stop.lon]
      latlngs.push(latlng)

      const iconHtml = `<div style="
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #F4AE52;
        border: 2.5px solid #D4621A;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 700;
        font-size: 13px;
        color: #4A2F1B;
        box-shadow: 0 3px 8px rgba(0,0,0,0.35);
        cursor: pointer;
      ">${stop.order}</div>`

      const markerIcon = L.divIcon({
        className: 'marbella-pin',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
      })

      const popupHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 200px; max-width: 250px; padding: 2px;">
          ${stop.photo?.startsWith('/places/') ? `<img src="${stop.photo}" style="width: 100%; height: 95px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; display: block;" alt="${stop.name || ''}" />` : ''}
          <div style="font-weight: 700; font-size: 14px; color: #1E120A; line-height: 1.25; margin-bottom: 4px;">
            ${stop.order}. ${stop.name || ''}
          </div>
          ${stop.rating ? `<div style="font-size: 12px; color: #D4621A; font-weight: 600; margin-bottom: 4px;">★ ${stop.rating.toFixed(1)} <span style="color: #6B5847; font-weight: 400;">(${stop.reviewsCount ? stop.reviewsCount.toLocaleString('es-ES') : ''} reseñas)</span></div>` : ''}
          ${stop.price ? `<div style="font-size: 12px; color: #4A2F1B; margin-bottom: 2px;">💶 ${stop.price}</div>` : ''}
          ${stop.hours ? `<div style="font-size: 11px; color: #6B5847; margin-bottom: 6px;">🕒 ${stop.hours}</div>` : ''}
          ${routeId ? `<a href="/route/${routeId}/stop/${stop.order}" style="display: block; text-align: center; margin-top: 8px; padding: 7px 10px; background: #4A2F1B; color: #FFFFFF; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none;">Ver detalles y fotos ↗</a>` : ''}
        </div>
      `

      L.marker(latlng, { icon: markerIcon })
        .addTo(map)
        .bindPopup(popupHtml, { maxWidth: 270, closeButton: false })
    })

    if (latlngs.length > 1) {
      L.polyline(latlngs, {
        color: '#D4621A',
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map)
      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] })
    } else if (latlngs.length === 1) {
      map.setView(latlngs[0], 15)
    }

    const timer = setTimeout(() => map?.invalidateSize(), 200)
    return () => {
      clearTimeout(timer)
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [variant, stops, routeId])

  if (variant === 'thumb') {
    const points = layoutThumb(n)
    return (
      <svg {...a11y} focusable="false" viewBox="0 0 88 96" className={cx(styles.map, styles.thumb, className)} style={height ? { height } : undefined}>
        <path className={styles.streets} d="M0 30 H88 M0 66 H88 M30 0 V96 M62 0 V96" strokeWidth="5" />
        <path className={styles.route} d={line([THUMB_START, ...points])} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle className={styles.startDot} cx={THUMB_START[0]} cy={THUMB_START[1]} r="5" />
        {points.map(([x, y], i) => (
          <circle key={i} className={styles.stopDot} cx={x} cy={y} r="5" />
        ))}
      </svg>
    )
  }

  const points = layoutStops(n)
  const full = variant === 'full'
  const h = height ?? (full ? undefined : 150)

  if (full) {
    return (
      <div className={cx(styles.map, styles.full, className)} style={{ position: 'relative', width: '100%', height: h ?? 230, overflow: 'hidden' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
        {!interactive && (
          <svg
            {...a11y}
            focusable="false"
            viewBox="0 0 390 230"
            preserveAspectRatio="xMidYMid slice"
            className={cx(styles.map, styles.full)}
            style={{ width: '100%', height: '100%' }}
          >
            <path className={styles.water} d="M0 190 C90 168 200 214 390 180 L390 230 L0 230 Z" />
            <path className={styles.streets} d="M0 60 H390 M0 124 H390 M80 0 V230 M180 0 V230 M290 0 V230" strokeWidth="7" />
            <path className={styles.streets} d="M40 30 L130 96 L200 150 L240 130 L330 110" strokeWidth="5" />
            <path className={styles.route} d={line([START, ...points])} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <circle className={styles.start} cx={START[0]} cy={START[1]} r="9" strokeWidth="3" />
            <g className={styles.labels} textAnchor="middle">
              {points.map(([x, y], i) => (
                <g key={i}>
                  <circle className={styles.marker} cx={x} cy={y} r="13" strokeWidth="2" />
                  <text x={x} y={y + 4.5}>
                    {stops[i]?.order ?? i + 1}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        )}
      </div>
    )
  }

  return (
    <svg
      {...a11y}
      focusable="false"
      viewBox={`0 0 390 ${h ?? 150}`}
      preserveAspectRatio="xMidYMid slice"
      className={cx(styles.map, styles.card, className)}
      style={h ? { height: h } : undefined}
    >
      <path className={styles.streets} d="M0 60 H390 M0 124 H390 M80 0 V230 M180 0 V230 M290 0 V230" strokeWidth="7" />
      <path className={styles.route} d={line([START, ...points])} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle className={styles.start} cx={START[0]} cy={START[1]} r="9" strokeWidth="3" />
      {points.map(([x, y], i) => (
        <circle key={i} className={styles.stopDot} cx={x} cy={y} r="11" />
      ))}
    </svg>
  )
}
