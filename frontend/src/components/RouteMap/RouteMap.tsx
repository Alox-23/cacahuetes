/*
 * Route map. With real coordinates, 'full' (mobile) and 'wide' (desktop panel) are an
 * interactive Leaflet map of Marbella: route polyline, numbered pins and, on mobile, a
 * popup card linking to the stop detail. On desktop the pins are linked with the stop
 * list (highlight on hover, select on click).
 * 'card' and 'thumb', stops without coordinates and environments where the container
 * has no size (unit tests) use the schematic SVG copied from the design SVGs
 * (Ruta.html, RutaGuardada.html, MisRutas.html, DeskAsistenteRuta.html).
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import catalog from '../../../../backend/lib/marbella.json'
import 'leaflet/dist/leaflet.css'
import { cx } from '../../lib/cx'
import { START, THUMB_START, WIDE_START, layoutStops, layoutThumb, layoutWide, type Point } from './layout'
import styles from './RouteMap.module.css'

export type RouteMapVariant = 'full' | 'card' | 'thumb' | 'wide'

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
  /** Desktop ('wide'): stop order highlighted, linked with the stop list. */
  highlighted?: number | null
  onHighlight?: (order: number | null) => void
  onSelect?: (order: number) => void
  /** Route id for the popup link to the stop detail (/route/:id/stop/:order). */
  routeId?: string
}

type GeoStop = StopMapInfo & { lat: number; lon: number }
type A11y = { 'aria-hidden': true } | { role: string; 'aria-label': string }

const line = (points: Point[]) => points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')

const hasCoords = (stop: StopMapInfo): stop is GeoStop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon)

/** Changes only when something drawn on the map changes (not on every new `stops` array). */
const stopsKey = (stops: readonly StopMapInfo[]) =>
  stops.map((s) => [s.order, s.lat, s.lon, s.name, s.photo, s.rating, s.reviewsCount, s.price, s.hours].join('|')).join(';')

/* ---------- Leaflet ---------- */

/** IGN street map of Marbella shipped in public/maps (offline), or local XYZ tiles. */
const OVERLAY_BOUNDS: L.LatLngBoundsExpression = [
  [36.477, -4.97],
  [36.52, -4.87],
]

function createMap(container: HTMLElement): L.Map {
  const map = L.map(container, { zoomControl: true, maxZoom: 19, minZoom: 9, attributionControl: true })
  try {
    const tiles = import.meta.env.VITE_LOCAL_TILE_URL as string | undefined
    if (tiles) {
      // Same-origin tiles only (the app runs on the intranet, without internet).
      if (tiles.startsWith('/') && !tiles.startsWith('//')) L.tileLayer(tiles, { maxZoom: 19 }).addTo(map)
    } else {
      L.imageOverlay('/maps/marbella.jpg', OVERLAY_BOUNDS, {
        attribution: 'Cartografía: © Instituto Geográfico Nacional (IGN)',
      }).addTo(map)
    }
    for (const point of catalog) {
      L.circleMarker([point.lat, point.lon], { radius: 3, weight: 2, className: styles.catalogDot }).bindTooltip(point.name).addTo(map)
    }
    return map
  } catch (error) {
    // No SVG/canvas renderer: release the container so the schematic map stays.
    map.remove()
    throw error
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

/** Popup card (mobile). Built as DOM nodes so place data is never parsed as HTML. */
function popupContent(stop: GeoStop, routeId?: string, open?: (path: string) => void): HTMLElement {
  const root = el('div', styles.popup)
  if (stop.photo?.startsWith('/places/')) {
    const img = el('img', styles.popupPhoto)
    img.src = stop.photo
    img.alt = stop.name ?? ''
    img.onerror = () => img.remove()
    root.append(img)
  }
  root.append(el('div', styles.popupTitle, `${stop.order}. ${stop.name ?? ''}`))
  if (stop.rating) {
    const rating = el('div', styles.popupRating, `★ ${stop.rating.toFixed(1)}`)
    if (stop.reviewsCount) rating.append(' ', el('span', styles.popupMuted, `(${stop.reviewsCount.toLocaleString('es-ES')} reseñas)`))
    root.append(rating)
  }
  if (stop.price) root.append(el('div', styles.popupLine, `💶 ${stop.price}`))
  if (stop.hours) root.append(el('div', styles.popupMuted, `🕒 ${stop.hours}`))
  if (routeId) {
    const link = el('a', styles.popupLink, 'Ver detalles y fotos ↗')
    const path = `/route/${encodeURIComponent(routeId)}/stop/${stop.order}`
    link.href = path
    // In-app navigation (no page reload); modified clicks keep the browser's default.
    link.addEventListener('click', (e) => {
      if (!open || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      open(path)
    })
    root.append(link)
  }
  return root
}

function applyHighlight(markers: ReadonlyMap<number, L.Marker>, highlighted: number | null) {
  for (const [order, marker] of markers) {
    const active = order === highlighted
    const icon = marker.getElement()
    icon?.classList.toggle(styles.pinActive, active)
    if (active) icon?.setAttribute('data-highlighted', 'true')
    else icon?.removeAttribute('data-highlighted')
    marker.setZIndexOffset(active ? 1000 : 0)
  }
}

/* ---------- component ---------- */

export function RouteMap({ stops, variant = 'full', height, label, className, highlighted = null, onHighlight, onSelect, routeId }: RouteMapProps) {
  const a11y: A11y = variant === 'thumb' || !label ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label }
  const geo = (variant === 'full' || variant === 'wide') && stops.some(hasCoords)
  const key = stopsKey(stops)
  const selectable = Boolean(onSelect)

  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<ReadonlyMap<number, L.Marker>>(new Map())
  const [map, setMap] = useState<L.Map | null>(null)
  const navigate = useNavigate()

  // Latest props for the Leaflet handlers, so markers are not rebuilt when callbacks change.
  const latest = useRef({ stops, highlighted, onHighlight, onSelect, navigate })
  useEffect(() => {
    latest.current = { stops, highlighted, onHighlight, onSelect, navigate }
  })

  // Map lifecycle: created once the container has a size, resized with it, removed on unmount.
  useEffect(() => {
    const container = containerRef.current
    if (!geo || !container) return
    let instance: L.Map | null = null
    let failed = false
    const start = () => {
      if (instance || failed || !container.clientWidth || !container.clientHeight) return
      try {
        instance = createMap(container)
        setMap(instance)
      } catch {
        failed = true
      }
    }
    start()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => (instance ? instance.invalidateSize() : start()))
    observer?.observe(container)
    return () => {
      observer?.disconnect()
      instance?.remove()
      setMap(null)
    }
  }, [geo])

  // Route layers: polyline and numbered pins, rebuilt only when the drawn stops change.
  useEffect(() => {
    if (!map) return
    const points = latest.current.stops.filter(hasCoords)
    const latlngs = points.map((s): L.LatLngTuple => [s.lat, s.lon])
    if (latlngs.length === 0) return
    // View first: Leaflet only creates the marker elements once the map has one.
    if (latlngs.length > 1) map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] })
    else map.setView(latlngs[0], 15)

    const group = L.layerGroup().addTo(map)
    const markers = new Map<number, L.Marker>()

    if (latlngs.length > 1) {
      L.polyline(latlngs, { weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round', className: styles.geoRoute, interactive: false }).addTo(group)
    }

    points.forEach((stop, i) => {
      const { order } = stop
      const icon = L.divIcon({
        className: styles.pin,
        html: `<span class="${styles.pinBadge}">${order}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
      })
      const marker = L.marker(latlngs[i], { icon, title: `${order}. ${stop.name ?? ''}`.trim() })
      marker.on('mouseover', () => latest.current.onHighlight?.(order))
      marker.on('mouseout', () => latest.current.onHighlight?.(null))
      if (selectable) {
        marker.on('click', () => latest.current.onSelect?.(order))
        marker.on('keypress', (e: L.LeafletKeyboardEvent) => {
          if (e.originalEvent.key === 'Enter') latest.current.onSelect?.(order)
        })
      } else {
        // depth 1: the stop detail's back returns here, like the stop list links.
        const open = (path: string) => latest.current.navigate(path, { state: { depth: 1 } })
        marker.bindPopup(() => popupContent(stop, routeId, open), { maxWidth: 270, closeButton: false })
      }
      marker.addTo(group)
      const node = marker.getElement()
      node?.setAttribute('data-order', String(order))
      node?.addEventListener('focus', () => latest.current.onHighlight?.(order))
      node?.addEventListener('blur', () => latest.current.onHighlight?.(null))
      markers.set(order, marker)
    })

    markersRef.current = markers
    applyHighlight(markers, latest.current.highlighted)

    return () => {
      group.remove()
      markersRef.current = new Map()
    }
  }, [map, key, routeId, selectable])

  useEffect(() => {
    applyHighlight(markersRef.current, highlighted)
  }, [highlighted])

  if (geo) {
    const live = map !== null
    return (
      <div
        {...(live && label ? { role: 'region', 'aria-label': label } : {})}
        className={cx(styles.map, variant === 'wide' ? styles.wide : styles.full, styles.geo, className)}
        style={variant === 'full' && height ? { height } : undefined}
      >
        <div ref={containerRef} className={styles.leaflet} />
        {!live &&
          (variant === 'wide' ? (
            <WideSvg stops={stops} a11y={a11y} className={styles.fallback} highlighted={highlighted} onHighlight={onHighlight} onSelect={onSelect} />
          ) : (
            <SchematicSvg stops={stops} a11y={a11y} full className={styles.fallback} />
          ))}
      </div>
    )
  }

  if (variant === 'wide') {
    return <WideSvg stops={stops} a11y={a11y} className={cx(styles.map, styles.wide, className)} highlighted={highlighted} onHighlight={onHighlight} onSelect={onSelect} />
  }

  if (variant === 'thumb') {
    const points = layoutThumb(stops.length)
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

  const full = variant === 'full'
  const h = height ?? (full ? undefined : 150)
  return <SchematicSvg stops={stops} a11y={a11y} full={full} height={h} className={cx(styles.map, full ? styles.full : styles.card, className)} />
}

/* ---------- schematic SVG ---------- */

type WideProps = Pick<RouteMapProps, 'stops' | 'onHighlight' | 'onSelect'> & { a11y: A11y; className?: string; highlighted: number | null }

/** Desktop panel (DeskAsistenteRuta.html, 900×330), markers linked with the stop list. */
function WideSvg({ stops, a11y, className, highlighted, onHighlight, onSelect }: WideProps) {
  const points = layoutWide(stops.length)
  const linked = Boolean(onHighlight || onSelect)
  return (
    <svg {...a11y} focusable="false" viewBox="0 0 900 330" preserveAspectRatio="xMidYMid slice" className={className}>
      <path className={styles.water} d="M0 300 C200 262 470 336 900 284 L900 400 L0 400 Z" />
      <path className={styles.streets} d="M0 110 H900 M0 230 H900 M190 0 V400 M400 0 V400 M620 0 V400 M800 0 V400" strokeWidth="9" />
      <path className={styles.streets} d="M60 40 L300 190 L520 300 L640 250 L860 200" strokeWidth="6" />
      <path className={styles.route} d={line([WIDE_START, ...points])} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle className={styles.start} cx={WIDE_START[0]} cy={WIDE_START[1]} r="11" strokeWidth="4" />
      <g className={styles.labels} textAnchor="middle">
        {points.map(([x, y], i) => {
          const order = stops[i].order
          const active = highlighted === order
          return (
            <g
              key={i}
              data-order={order}
              data-highlighted={active || undefined}
              className={cx(active && styles.active, linked && styles.interactive)}
              onMouseEnter={onHighlight ? () => onHighlight(order) : undefined}
              onMouseLeave={onHighlight ? () => onHighlight(null) : undefined}
              onClick={onSelect ? () => onSelect(order) : undefined}
            >
              <circle className={styles.marker} cx={x} cy={y} r={active ? 19 : 16} strokeWidth="2" />
              <text x={x} y={y + 5} fontSize="15">
                {order}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}

type SchematicProps = { stops: readonly StopMapInfo[]; a11y: A11y; full: boolean; height?: number; className?: string }

/** Mobile route (390×230, numbered markers) and card (dots only). */
function SchematicSvg({ stops, a11y, full, height, className }: SchematicProps) {
  const points = layoutStops(stops.length)
  return (
    <svg
      {...a11y}
      focusable="false"
      viewBox={full ? '0 0 390 230' : `0 0 390 ${height ?? 150}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={height ? { height } : undefined}
    >
      {full && <path className={styles.water} d="M0 190 C90 168 200 214 390 180 L390 230 L0 230 Z" />}
      <path className={styles.streets} d="M0 60 H390 M0 124 H390 M80 0 V230 M180 0 V230 M290 0 V230" strokeWidth="7" />
      {full && <path className={styles.streets} d="M40 30 L130 96 L200 150 L240 130 L330 110" strokeWidth="5" />}
      <path className={styles.route} d={line([START, ...points])} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle className={styles.start} cx={START[0]} cy={START[1]} r="9" strokeWidth="3" />
      {full ? (
        <g className={styles.labels} textAnchor="middle">
          {points.map(([x, y], i) => (
            <g key={i}>
              <circle className={styles.marker} cx={x} cy={y} r="13" strokeWidth="2" />
              <text x={x} y={y + 4.5}>
                {stops[i].order}
              </text>
            </g>
          ))}
        </g>
      ) : (
        points.map(([x, y], i) => <circle key={i} className={styles.stopDot} cx={x} cy={y} r="11" />)
      )}
    </svg>
  )
}
