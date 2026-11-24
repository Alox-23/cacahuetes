/* Text for route screens: stop details, counts, time ranges, card tags. */
import { companyLabel, formatDateShort, interestLabel, legLabel, numberWord, transportChip } from '../assistant/format'
import type { Preferences, Route, Stop } from '../contract/types'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { t, tDynamic } from '../i18n'
import type { PlaceHints } from './placeHints'
import { routeEnd } from './route'
import { lowerFirst } from './text'

/** Compact visit length: "45 min", "1 h", "1 h 15". */
export function formatVisit(minutes: number): string {
  if (minutes < 60) return t('format.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? t('format.compactHoursMinutes', { hours, minutes: rest }) : t('format.compactHours', { hours })
}

export type Activity = NonNullable<PlaceHints['activity']>

/** "Visita 1 h 15", "Comida 1 h", "Pausa 20 min", "Paseo 45 min". */
export function activityLabel(stop: Stop, activity: Activity = 'visit'): string {
  return tDynamic(`routeScreen.activity.${activity}`, { duration: formatVisit(stop.visitMinutes) })
}

/** "Visita 1 h 15 · luego 20 min en metro" or "Paseo 45 min · fin de la ruta". */
export function stopDetail(stop: Stop, activity?: Activity): string {
  const next = stop.travelToNext ? t('routeScreen.then', { leg: legLabel(stop.travelToNext) }) : t('routeScreen.end')
  return t('routeScreen.detail', { activity: activityLabel(stop, activity), next })
}

/** "4 paradas" / "1 parada". */
export function stopsCount(count: number): string {
  return count === 1 ? t('routeScreen.stopsOne') : t('routeScreen.stops', { count })
}

/** "10:00 a 15:00" (start to computed end). */
export function routeTimeRange(route: Route): string {
  const from = route.stops[0]?.arrive ?? route.request.timeWindow.from
  return t('routeScreen.timeRange', { from, to: routeEnd(route) })
}

/** Preferences merged with the per-route overrides. */
export function effectivePreferences(route: Route, preferences: Preferences | null): Preferences {
  return { ...DEFAULT_PREFERENCES, ...(preferences ?? {}), ...(route.request.overrides ?? {}) }
}

/** "4 paradas · 10:00 a 15:00 · a pie y metro" */
export function routeSubtitle(route: Route, preferences: Preferences | null): string {
  const transport = effectivePreferences(route, preferences).transport
  return t('routeScreen.subtitle', {
    stops: stopsCount(route.stops.length),
    time: routeTimeRange(route),
    transport: lowerFirst(transportChip(transport.length > 0 ? transport : DEFAULT_PREFERENCES.transport)),
  })
}

/** "Mapa de la ruta con cuatro paradas" */
export function mapLabel(count: number): string {
  return count === 1 ? t('routeScreen.mapLabelOne') : t('routeScreen.mapLabel', { count: numberWord(count) })
}

/**
 * Tags of a Mis rutas card: what makes this route special. Interests asked in
 * the request, else company or transport overrides ("con niños", "a pie"),
 * else the saved interests.
 */
export function routeTags(route: Route, preferences: Preferences | null): string {
  const o = route.request.overrides ?? {}
  if (o.interests && o.interests.length > 0) return o.interests.map((i) => lowerFirst(interestLabel(i))).join(', ')
  if (o.company) return lowerFirst(companyLabel(o.company))
  if (o.transport && o.transport.length > 0) return lowerFirst(transportChip(o.transport))
  const interests = (preferences ?? DEFAULT_PREFERENCES).interests
  return interests.map((i) => lowerFirst(interestLabel(i))).join(', ')
}

/** "Sáb 5 dic · 10:00 a 15:00" */
export function routeWhen(route: Route): string {
  return t('myRoutes.cardDate', { date: formatDateShort(route.request.date), time: routeTimeRange(route) })
}
