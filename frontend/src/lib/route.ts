import type { Route } from '../contract/types'
import { fromMinutes, toMinutes } from './time'

/** End time of a route: last arrival plus its visit. */
export function routeEnd(route: Route): string {
  const last = route.stops[route.stops.length - 1]
  if (!last) return route.request.timeWindow.from
  return fromMinutes(toMinutes(last.arrive) + last.visitMinutes)
}
