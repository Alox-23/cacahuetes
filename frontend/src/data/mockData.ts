/*
 * Mock implementation of the shared DataModule (docs/contract/types.ts).
 * Everything lives in localStorage through `JsonStorage`; no network calls.
 * Spec 2 owns this module long term; spec 1 needs it to run the flows.
 */
import type {
  DataModule,
  Place,
  Preferences,
  RefineAction,
  Route,
  RouteRequest,
  Session,
  Stop,
} from '../contract/types'
import { t } from '../i18n'
import { formatDuration } from '../assistant/format'
import { parseRefineText, type QuickRefine } from '../lib/refineKeywords'
import { fromMinutes, toMinutes, wait } from '../lib/time'
import {
  PAUSE_LEG,
  findPlace,
  getCityCatalog,
  legBetween,
  matchesMustInclude,
  type CatalogPlace,
  type CityCatalog,
} from './catalog'
import { DEFAULT_PREFERENCES } from './defaults'
import { STORAGE_KEYS, createStorage, type JsonStorage } from './storage'

type RouteStore = Record<string, Route[]>
type Rating = { stars: number; stops: Record<number, boolean>; comment?: string }

export type DataModuleOptions = {
  /** Simulated latency per call in ms (default 30; tests pass 0). */
  latency?: number
  newId?: () => string
}

const FULL_DAY_MINUTES = 9 * 60
const MIN_VISIT = 20

function defaultId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Travel leg between two places, mode chosen from the transport preference. */
function travel(
  catalog: CityCatalog,
  from: string,
  to: string,
  transport: Preferences['transport'],
): NonNullable<Stop['travelToNext']> {
  const fromPlace = findPlace(from)
  const toPlace = findPlace(to)
  const leg = fromPlace?.kind === 'pause' || toPlace?.kind === 'pause' ? PAUSE_LEG : legBetween(catalog, from, to)
  const modes = transport.length > 0 ? transport : DEFAULT_PREFERENCES.transport
  if (modes.includes('a_pie') && leg.walk <= 20) return { mode: 'a_pie', minutes: leg.walk }
  if (modes.includes('transporte_publico')) return { mode: 'transporte_publico', minutes: leg.transit }
  if (modes.includes('bici')) return { mode: 'bici', minutes: Math.max(3, Math.round(leg.walk / 3)) }
  if (modes.includes('coche')) return { mode: 'coche', minutes: leg.transit }
  return { mode: 'a_pie', minutes: leg.walk }
}

/** Recompute order numbers and arrival times from the window start. */
function reschedule(route: Route): Route {
  let clock = toMinutes(route.request.timeWindow.from)
  route.stops = route.stops.map((stop, index) => {
    const next: Stop = { ...stop, order: index + 1, arrive: fromMinutes(clock) }
    if (index === route.stops.length - 1) delete next.travelToNext
    clock += stop.visitMinutes + (index < route.stops.length - 1 ? (stop.travelToNext?.minutes ?? 0) : 0)
    return next
  })
  return route
}

function stopFor(place: CatalogPlace, visitMinutes = place.visitMinutes): Stop {
  return { order: 0, placeId: place.id, name: place.name, arrive: '00:00', visitMinutes, locked: false }
}

/** Relink the legs around index `i` (after an insert, replace or removal). */
function relink(route: Route, catalog: CityCatalog, transport: Preferences['transport'], indices: number[]) {
  for (const i of indices) {
    const a = route.stops[i]
    const b = route.stops[i + 1]
    if (a && b) a.travelToNext = travel(catalog, a.placeId, b.placeId, transport)
    else if (a) delete a.travelToNext
  }
}

function scorePlace(place: CatalogPlace, request: RouteRequest, prefs: Preferences): number {
  let score = 0
  const must = request.mustInclude.some((m) => matchesMustInclude(place, m))
  if (must) score += 100
  score += place.categories.filter((c) => prefs.interests.includes(c)).length > 0 ? 10 : 0
  // Restaurants only join at creation when asked for; "Más comida" adds them later.
  if (place.kind === 'food' && !must) score -= 20
  if (prefs.company === 'con_ninos' && place.kids) score += 5
  if (prefs.budget === 'bajo' && place.paid) score -= 3
  return score
}

export function createDataModule(
  storage: JsonStorage = createStorage(),
  options: DataModuleOptions = {},
): DataModule {
  const latency = options.latency ?? 30
  const newId = options.newId ?? defaultId
  const tick = () => (latency > 0 ? wait(latency) : Promise.resolve())

  const readRoutes = () => storage.read<RouteStore>(STORAGE_KEYS.routes, {})
  const writeRoutes = (routes: RouteStore) => storage.write(STORAGE_KEYS.routes, routes)
  const readPrefs = () => storage.read<Preferences | null>(STORAGE_KEYS.preferences, null)

  function effectivePrefs(request: RouteRequest): Preferences {
    return { ...DEFAULT_PREFERENCES, ...(readPrefs() ?? {}), ...(request.overrides ?? {}) }
  }

  function versionsOf(id: string): Route[] {
    const versions = readRoutes()[id]
    if (!versions || versions.length === 0) throw new Error(t('data.routeNotFound'))
    return versions
  }

  function current(id: string): Route {
    const versions = versionsOf(id)
    return clone(versions[versions.length - 1])
  }

  function pushVersion(route: Route): Route {
    const routes = readRoutes()
    const versions = routes[route.id] ?? []
    routes[route.id] = [...versions, route]
    writeRoutes(routes)
    return clone(route)
  }

  function applyQuick(route: Route, action: QuickRefine, catalog: CityCatalog, prefs: Preferences) {
    const inRoute = new Set(route.stops.map((s) => s.placeId))
    switch (action) {
      case 'menos_caminar': {
        for (const stop of route.stops) {
          const leg = stop.travelToNext
          if (leg && leg.mode === 'a_pie' && leg.minutes > 15) {
            stop.travelToNext = { mode: 'transporte_publico', minutes: Math.max(5, Math.round(leg.minutes / 2)) }
          }
        }
        return
      }
      case 'anadir_pausa': {
        const pause = catalog.places.find((p) => p.kind === 'pause')
        if (!pause) return
        const at = Math.min(2, route.stops.length)
        const previousLeg = route.stops[at - 1]?.travelToNext
        route.stops.splice(at, 0, stopFor(pause))
        if (route.stops[at - 1]) route.stops[at - 1].travelToNext = travel(catalog, route.stops[at - 1].placeId, pause.id, prefs.transport)
        if (route.stops[at + 1]) route.stops[at].travelToNext = previousLeg ?? travel(catalog, pause.id, route.stops[at + 1].placeId, prefs.transport)
        return
      }
      case 'mas_comida': {
        const food =
          catalog.places.find((p) => p.kind === 'food' && !inRoute.has(p.id) && !(prefs.budget === 'bajo' && p.paid)) ??
          catalog.places.find((p) => p.kind === 'food' && !inRoute.has(p.id))
        if (!food) return
        // Insert after the stop whose visit is nearest to 13:00 (or at the end).
        let best = route.stops.length - 1
        let bestDiff = Infinity
        route.stops.forEach((s, i) => {
          const diff = Math.abs(toMinutes(s.arrive) + s.visitMinutes - 13 * 60)
          if (diff < bestDiff) {
            bestDiff = diff
            best = i
          }
        })
        route.stops.splice(best + 1, 0, stopFor(food))
        relink(route, catalog, prefs.transport, [best, best + 1])
        return
      }
      case 'mas_barato': {
        const index = route.stops.findIndex((s) => !s.locked && findPlace(s.placeId)?.paid && findPlace(s.placeId)?.kind === 'sight')
        if (index < 0) return
        const old = findPlace(route.stops[index].placeId)
        const free = catalog.places
          .filter((p) => p.kind === 'sight' && !p.paid && !inRoute.has(p.id))
          .sort((a, b) => {
            const shared = (p: CatalogPlace) => p.categories.filter((c) => old?.categories.includes(c)).length
            return shared(b) - shared(a) || a.order - b.order
          })[0]
        if (!free) return
        route.stops[index] = stopFor(free)
        relink(route, catalog, prefs.transport, [index - 1, index])
        return
      }
    }
  }

  function applyAction(route: Route, action: RefineAction) {
    const catalog = getCityCatalog(route.request.city)
    const prefs = effectivePrefs(route.request)
    switch (action.type) {
      case 'quick':
        applyQuick(route, action.value, catalog, prefs)
        break
      case 'text':
        for (const quick of parseRefineText(action.value)) applyQuick(route, quick, catalog, prefs)
        break
      case 'remove_stop': {
        const index = route.stops.findIndex((s) => s.order === action.order)
        if (index >= 0 && route.stops.length > 1) {
          route.stops.splice(index, 1)
          relink(route, catalog, prefs.transport, [index - 1])
        }
        break
      }
      case 'lock_stop': {
        const stop = route.stops.find((s) => s.order === action.order)
        if (stop) stop.locked = !stop.locked
        break
      }
      case 'swap_stop': {
        const index = route.stops.findIndex((s) => s.order === action.order)
        const place = findPlace(action.placeId)
        if (index >= 0 && place) {
          route.stops[index] = { ...stopFor(place), locked: route.stops[index].locked }
          relink(route, catalog, prefs.transport, [index - 1, index])
        }
        break
      }
    }
  }

  return {
    async getPreferences() {
      await tick()
      return readPrefs()
    },

    async savePreferences(p) {
      await tick()
      storage.write(STORAGE_KEYS.preferences, p)
    },

    async getSession() {
      await tick()
      return storage.read<Session>(STORAGE_KEYS.session, { kind: 'guest' })
    },

    async register(email) {
      await tick()
      const session: Session = { kind: 'account', email, name: email.split('@')[0] }
      storage.write(STORAGE_KEYS.session, session)
      return session
    },

    async login(email) {
      await tick()
      const session: Session = { kind: 'account', email, name: email.split('@')[0] }
      storage.write(STORAGE_KEYS.session, session)
      return session
    },

    async logout() {
      await tick()
      storage.write(STORAGE_KEYS.session, { kind: 'guest' } satisfies Session)
    },

    async createRoute(request) {
      await tick()
      const prefs = effectivePrefs(request)
      const catalog = getCityCatalog(request.city)
      const window = toMinutes(request.timeWindow.to) - toMinutes(request.timeWindow.from)
      const count = window >= 7 * 60 ? 5 : 4

      const picked = catalog.places
        .filter((p) => p.kind !== 'pause')
        .map((p) => ({ p, score: scorePlace(p, request, prefs) }))
        .sort((a, b) => b.score - a.score || a.p.order - b.p.order)
        .slice(0, count)
        .map((x) => x.p)
        .sort((a, b) => a.order - b.order)

      const route: Route = {
        id: newId(),
        name:
          window >= FULL_DAY_MINUTES
            ? t('data.routeNameDay', { city: request.city })
            : t('data.routeNameHours', { city: request.city, duration: formatDuration(window) }),
        request: clone(request),
        stops: picked.map((p) => stopFor(p)),
        version: 1,
        saved: false,
        favorite: false,
      }
      relink(route, catalog, prefs.transport, route.stops.map((_, i) => i))

      // Fit the visits into the window when the selection is too long.
      const travelTotal = route.stops.reduce((sum, s) => sum + (s.travelToNext?.minutes ?? 0), 0)
      const visitTotal = route.stops.reduce((sum, s) => sum + s.visitMinutes, 0)
      if (window > 0 && travelTotal + visitTotal > window) {
        const factor = Math.max(0, window - travelTotal) / visitTotal
        for (const s of route.stops) s.visitMinutes = Math.max(MIN_VISIT, Math.round((s.visitMinutes * factor) / 5) * 5)
      }

      reschedule(route)
      return pushVersion(route)
    },

    async refineRoute(id, action) {
      await tick()
      const route = current(id)
      applyAction(route, action)
      route.version += 1
      reschedule(route)
      return pushVersion(route)
    },

    async undo(id) {
      await tick()
      const routes = readRoutes()
      const versions = versionsOf(id)
      if (versions.length > 1) {
        routes[id] = versions.slice(0, -1)
        writeRoutes(routes)
      }
      return current(id)
    },

    async getRoute(id) {
      await tick()
      return current(id)
    },

    async listRoutes() {
      await tick()
      return Object.values(readRoutes())
        .filter((v) => v.length > 0)
        .map((v) => clone(v[v.length - 1]))
    },

    async saveRoute(id) {
      await tick()
      const routes = readRoutes()
      routes[id] = versionsOf(id).map((r) => ({ ...r, saved: true }))
      writeRoutes(routes)
      return current(id)
    },

    async deleteRoute(id) {
      await tick()
      const routes = readRoutes()
      delete routes[id]
      writeRoutes(routes)
      const ratings = storage.read<Record<string, Rating>>(STORAGE_KEYS.ratings, {})
      delete ratings[id]
      storage.write(STORAGE_KEYS.ratings, ratings)
    },

    async rateRoute(id, rating) {
      await tick()
      versionsOf(id)
      const ratings = storage.read<Record<string, Rating>>(STORAGE_KEYS.ratings, {})
      ratings[id] = rating
      storage.write(STORAGE_KEYS.ratings, ratings)
    },

    async getPlace(id) {
      await tick()
      const place = findPlace(id)
      if (!place) throw new Error(t('data.placeNotFound'))
      return toPlace(place)
    },

    async getAlternatives(routeId, order) {
      await tick()
      const route = current(routeId)
      const stop = route.stops.find((s) => s.order === order)
      const base = stop ? findPlace(stop.placeId) : undefined
      const inRoute = new Set(route.stops.map((s) => s.placeId))
      const catalog = getCityCatalog(route.request.city)
      return catalog.places
        .filter((p) => p.kind !== 'pause' && !inRoute.has(p.id))
        .sort((a, b) => {
          const shared = (p: CatalogPlace) => p.categories.filter((c) => base?.categories.includes(c)).length
          return shared(b) - shared(a) || a.order - b.order
        })
        .slice(0, 3)
        .map(toPlace)
    },
  }
}

function toPlace(p: CatalogPlace): Place {
  return { id: p.id, name: p.name, categories: [...p.categories], why: p.why, hours: p.hours, price: p.price, photo: p.photo }
}

/** Default instance backed by window.localStorage. */
export const dataModule: DataModule = createDataModule()
