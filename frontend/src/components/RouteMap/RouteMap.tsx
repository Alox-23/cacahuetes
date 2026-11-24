/*
 * Schematic route map (no tiles, no network). Street grid, route line in the
 * accent colour, numbered gold markers and a dark start dot, copied from the
 * design SVGs (Ruta.html, RutaGuardada.html, MisRutas.html). The layout is
 * deterministic from the stop count; a real map can replace this component
 * behind the same props.
 */
import { cx } from '../../lib/cx'
import { START, THUMB_START, layoutStops, layoutThumb, type Point } from './layout'
import styles from './RouteMap.module.css'

export type RouteMapVariant = 'full' | 'card' | 'thumb'

type RouteMapProps = {
  /** Only the count and order matter. */
  stops: readonly { order: number }[]
  variant?: RouteMapVariant
  /** CSS height in px (defaults: full 230, card 150, thumb 96). */
  height?: number
  /** Accessible name (full and card). Thumbnails are decorative. */
  label?: string
  className?: string
}

const line = (points: Point[]) => points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')

/* ---------- component ---------- */

export function RouteMap({ stops, variant = 'full', height, label, className }: RouteMapProps) {
  const n = stops.length
  const a11y = variant === 'thumb' || !label ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': label }

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
  return (
    <svg
      {...a11y}
      focusable="false"
      viewBox={full ? '0 0 390 230' : `0 0 390 ${h ?? 150}`}
      preserveAspectRatio="xMidYMid slice"
      className={cx(styles.map, full ? styles.full : styles.card, className)}
      style={h ? { height: h } : undefined}
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
