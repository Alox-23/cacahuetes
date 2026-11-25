import type { Route } from '../contract/types'
import { normalize } from './text'
import { isoDate } from './time'

export type RoutesTab = 'upcoming' | 'past' | 'favorites'

/** Upcoming when the route date is today or later. */
export function isUpcoming(route: Route, today: Date): boolean {
  return route.request.date >= isoDate(today)
}

/** Routes of a Mis rutas tab whose city (or name) contains the query (accent-insensitive). */
export function filterRoutes(routes: Route[], tab: RoutesTab, query: string, today: Date = new Date()): Route[] {
  const q = normalize(query)
  const matching = routes.filter((route) => {
    const inTab = tab === 'favorites' ? route.favorite : tab === 'upcoming' ? isUpcoming(route, today) : !isUpcoming(route, today)
    if (!inTab) return false
    if (!q) return true
    return normalize(route.request.city).includes(q) || normalize(route.name).includes(q)
  })
  // Upcoming: soonest first (as in the design). Past and favourites: most recent first.
  const direction = tab === 'upcoming' ? 1 : -1
  return matching.sort((a, b) => direction * a.request.date.localeCompare(b.request.date))
}
