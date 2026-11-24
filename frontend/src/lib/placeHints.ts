import type { Place } from '../contract/types'

/**
 * Optional presentation hints the mock data module adds to `Place` objects
 * (not part of the contract, like the assistant's `display`). Screens must
 * still work with a plain `Place` when they are absent, e.g. with a real API.
 */
export type PlaceHints = {
  /** How the stop reads on the route: "Visita", "Paseo", "Comida", "Pausa". */
  activity?: 'visit' | 'walk' | 'food' | 'pause'
  /** Typical visit length (alternatives subtitle). */
  visitMinutes?: number
  /** Estimated leg from the stop being replaced (alternatives subtitle). */
  travel?: { mode: string; minutes: number }
}

export type PlaceWithHints = Place & PlaceHints

export function hintsOf(place: Place | undefined): PlaceHints {
  return (place ?? {}) as PlaceHints
}
