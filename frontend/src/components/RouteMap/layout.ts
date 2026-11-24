/* Deterministic marker positions for RouteMap (from the design SVGs). */
export type Point = [number, number]

/* ---------- layouts ---------- */

/** The 4-stop layout of the designs, in the 390×230 space. */
const DESIGN_4: Point[] = [
  [80, 60],
  [180, 60],
  [236, 124],
  [326, 96],
]
export const START: Point = [56, 150]
const ROWS = [60, 60, 124, 96, 124, 60, 96, 40]

/** Marker positions for n stops in the 390×230 space (card uses the same coordinates). */
export function layoutStops(n: number): Point[] {
  if (n <= 0) return []
  if (n === 4) return DESIGN_4
  if (n === 1) return [[180, 60]]
  if (n === 2) return [
    [80, 60],
    [236, 124],
  ]
  if (n === 3) return [
    [80, 60],
    [180, 60],
    [290, 110],
  ]
  const span = 326 - 80
  return Array.from({ length: n }, (_, i) => [Math.round(80 + (span * i) / (n - 1)), ROWS[i % ROWS.length]] as Point)
}

/** Thumbnail (88×96): MisRutas.html first card for up to 3 stops, a zigzag along the grid otherwise. */
const THUMB_DESIGN: Point[] = [
  [30, 30],
  [62, 30],
  [74, 62],
]
export const THUMB_START: Point = [14, 76]

export function layoutThumb(n: number): Point[] {
  if (n <= 0) return []
  if (n <= THUMB_DESIGN.length) return THUMB_DESIGN.slice(0, n)
  const from = 30
  const to = 76
  return Array.from({ length: n }, (_, i) => [Math.round(from + ((to - from) * i) / (n - 1)), i % 2 === 0 ? 30 : 66] as Point)
}

/* ---------- wide (desktop panel, DeskAsistenteRuta.html, 900×330) ---------- */

const WIDE_4: Point[] = [
  [190, 110],
  [400, 110],
  [520, 230],
  [720, 170],
]
export const WIDE_START: Point = [120, 270]
const WIDE_ROWS = [110, 110, 230, 170, 270, 110, 230, 170]

export function layoutWide(n: number): Point[] {
  if (n <= 0) return []
  if (n === 4) return WIDE_4
  if (n === 1) return [[400, 110]]
  const from = 190
  const to = 800
  return Array.from({ length: n }, (_, i) => [Math.round(from + ((to - from) * i) / (n - 1)), WIDE_ROWS[i % WIDE_ROWS.length]] as Point)
}
