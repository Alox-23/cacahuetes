/*
 * Mock implementation of the shared DataModule (docs/contract/types.ts).
 * Everything lives in localStorage through `JsonStorage`; no network calls.
 * Spec 2 owns this module long term; spec 1 needs it to run the flows.
 * The destination is always Marbella (shared scope with the backend).
 */
import { isMarbella, localStart } from '../../../backend/lib/marbella-scope.js'
import type {
  AuthProvider,
  DataModule,
  Place,
  Preferences,
  Rating,
  RefineAction,
  Route,
  RouteRequest,
  Session,
  Stop,
} from '../contract/types'
import { t } from '../i18n'
import { formatDuration } from '../assistant/format'
import type { PlaceWithHints } from '../lib/placeHints'
import { parseRefineText, type QuickRefine } from '../lib/refineKeywords'
import { capitalize } from '../lib/text'
import { fromMinutes, toMinutes, wait } from '../lib/time'
import {
  PAUSE_LEG,
  activityOf,
  findPlace,
  getCityCatalog,
  legBetween,
  matchesMustInclude,
  type CatalogPlace,
  type CityCatalog,
} from './catalog'
import { DEFAULT_ACCOUNT_SETTINGS, DEFAULT_PREFERENCES } from './defaults'
import { ApiClientError } from './errors'
import { exampleRoutes } from './seeds'
import type { DataCapabilities } from './capabilities'
import { STORAGE_KEYS, createStorage, type JsonStorage } from './storage'

type RouteStore = Record<string, Route[]>
type DemoVerification = { token: string; email: string }

/** Fake provider accounts of the demo's "Continuar con Google/Apple" (an existing account each). */
const DEMO_PROVIDER_EMAILS: Record<AuthProvider, string> = {
  google: 'google@ejemplo.com',
  apple: 'apple@ejemplo.com',
}

function demoToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(4))
  return 'demo-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Error codes (not UI copy) thrown by the mock; screens never trigger them. */
export const DATA_ERRORS = {
  guestCannotSave: 'GUEST_CANNOT_SAVE',
  notAnAccount: 'NOT_AN_ACCOUNT',
} as const


export type DataModuleOptions = {
  /** Simulated latency per call in ms (default 30; tests pass 0). */
  latency?: number
  newId?: () => string
  /** Clock for the example routes seeded on login (tests pin it). */
  now?: () => Date
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
  // Alternative-only places join only when the request names them.
  if (place.altOnly && !must) score -= 1000
  if (prefs.company === 'con_ninos' && place.kids) score += 5
  if (prefs.budget === 'bajo' && place.paid) score -= 3
  return score
}

export function createDataModule(
  storage: JsonStorage = createStorage(),
  options: DataModuleOptions = {},
): DataModule & DataCapabilities {
  const latency = options.latency ?? 30
  const newId = options.newId ?? defaultId
  const now = options.now ?? (() => new Date())
  const tick = () => (latency > 0 ? wait(latency) : Promise.resolve())

  const readRoutes = () => storage.read<RouteStore>(STORAGE_KEYS.routes, {})
  const writeRoutes = (routes: RouteStore) => storage.write(STORAGE_KEYS.routes, routes)
  const readPrefs = () => storage.read<Preferences | null>(STORAGE_KEYS.preferences, null)
  const readSession = () => storage.read<Session>(STORAGE_KEYS.session, { kind: 'guest' })
  const readRatings = () => storage.read<Record<string, Rating>>(STORAGE_KEYS.ratings, {})
  const writeRatings = (ratings: Record<string, Rating>) => storage.write(STORAGE_KEYS.ratings, ratings)
  const readOwners = () => storage.read<Record<string, string>>(STORAGE_KEYS.owners, {})
  const setOwner = (id: string, email: string | undefined) => {
    const owners = readOwners()
    if (email) owners[id] = email
    else delete owners[id]
    storage.write(STORAGE_KEYS.owners, owners)
  }

  /** Saved routes of an account (routes saved before owners existed are visible to any account). */
  function savedRoutesOf(email: string | undefined): Route[] {
    const owners = readOwners()
    return Object.values(readRoutes())
      .filter((v) => v.length > 0 && v[v.length - 1].saved)
      .map((v) => v[v.length - 1])
      .filter((r) => owners[r.id] === undefined || owners[r.id] === email)
  }

  /** New account session: name from the part before "@", capitalised; reminders on. */
  function accountSession(email: string): Session {
    const local = email.split('@')[0] ?? ''
    return { kind: 'account', email, name: capitalize(local), settings: { ...DEFAULT_ACCOUNT_SETTINGS } }
  }

  /** Apply a change to every version, so undo never loses saved/favourite. */
  function updateAllVersions(id: string, patch: Partial<Route>) {
    const routes = readRoutes()
    routes[id] = versionsOf(id).map((r) => ({ ...r, ...patch }))
    writeRoutes(routes)
  }

  function effectivePrefs(request: RouteRequest): Preferences {
    return { ...DEFAULT_PREFERENCES, ...(readPrefs() ?? {}), ...(request.overrides ?? {}) }
  }

  function isLocalRoute(route: Route) {
    return isMarbella(route.request.city) && route.stops.every(stop => findPlace(stop.placeId))
  }

  function versionsOf(id: string): Route[] {
    const versions = readRoutes()[id]
    if (!versions?.length || !isLocalRoute(versions[versions.length - 1])) throw new Error(t('data.routeNotFound'))
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
        const isMust = (s: Stop) => {
          const place = findPlace(s.placeId)
          return !!place && route.request.mustInclude.some((m) => matchesMustInclude(place, m))
        }
        const index = route.stops.findIndex(
          (s) => !s.locked && !isMust(s) && findPlace(s.placeId)?.paid && findPlace(s.placeId)?.kind === 'sight',
        )
        if (index < 0) return
        const old = findPlace(route.stops[index].placeId)
        const free = catalog.places
          .filter((p) => p.kind === 'sight' && !p.paid && !p.altOnly && !inRoute.has(p.id))
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
      case 'move_stop': {
        // Feature 3: move a stop to position `to` (1-based); legs and times are recomputed.
        const from = route.stops.findIndex((s) => s.order === action.order)
        const to = Math.max(0, Math.min(route.stops.length - 1, action.to - 1))
        if (from >= 0 && from !== to) {
          const [moved] = route.stops.splice(from, 1)
          route.stops.splice(to, 0, moved)
          relink(route, catalog, prefs.transport, route.stops.map((_, i) => i))
        }
        break
      }
    }
  }

  /** Pick, link and schedule the places of a new route (shared by createRoute and the login seeds). */
  function buildRoute(request: RouteRequest): Route {
    const prefs = effectivePrefs(request)
    const catalog = getCityCatalog(request.city)
    // The start must be a catalog place (name or alias); the route is scheduled from there.
    const start = localStart(request.start.label)
    if (!start) throw new Error(t('request.askOther'))
    request = { ...request, city: catalog.city, start: { label: start } }
    if (request.mustInclude.some((label) => !catalog.places.some((p) => matchesMustInclude(p, label)))) {
      throw new Error(t('data.placeNotFound'))
    }
    const window = toMinutes(request.timeWindow.to) - toMinutes(request.timeWindow.from)
    const count = window >= 7 * 60 ? 5 : 4

    const origin = catalog.places.find((p) => p.name === start)!
    const picked = catalog.places
      .filter((p) => p.kind !== 'pause')
      .map((p) => ({ p, score: scorePlace(p, request, prefs) - legBetween(catalog, origin.id, p.id).walk / 3 }))
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
    return route
  }

  const readAccounts = () => storage.read<string[]>(STORAGE_KEYS.accounts, [])
  const writeAccounts = (emails: string[]) => storage.write(STORAGE_KEYS.accounts, emails)

  /** New demo verification link for `email` (replaces the previous one), printed in dev. */
  function issueDemoLink(email: string) {
    const link: DemoVerification = { token: demoToken(), email }
    storage.write(STORAGE_KEYS.verifyToken, link)
    if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
      console.info(`[demo] Enlace de verificación: /verify-email?token=${link.token}`)
    }
  }

  /** An "existing account": verified, and it comes with three example saved routes. */
  async function login(email: string): Promise<Session> {
    await tick()
    const session: Session = { ...accountSession(email), emailVerified: true }
    storage.write(STORAGE_KEYS.session, session)
    seedExamples(session.email ?? '')
    return session
  }

  function seedExamples(email: string) {
    if (savedRoutesOf(email).some(isLocalRoute)) return
    const ratings = readRatings()
    for (const seed of exampleRoutes(now())) {
      const route = buildRoute(seed.request)
      if (seed.name) route.name = seed.name
      route.saved = true
      route.favorite = seed.favorite
      pushVersion(route)
      setOwner(route.id, email)
      if (seed.rating) ratings[route.id] = seed.rating
    }
    writeRatings(ratings)
  }

  return {
    // Feature 3: the mock understands { type: "move_stop" } (the HTTP module does not yet).
    capabilities: { moveStop: true },

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
      return readSession()
    },

    async register(email) {
      await tick()
      const accounts = readAccounts()
      if (accounts.includes(email.toLowerCase())) {
        throw new ApiClientError(t('auth.errorEmailExists'), 'EMAIL_EXISTS', 409)
      }
      writeAccounts([...accounts, email.toLowerCase()])
      const session: Session = { ...accountSession(email), emailVerified: false }
      storage.write(STORAGE_KEYS.session, session)
      issueDemoLink(email)
      return session
    },

    login: (email) => login(email),

    async logout() {
      await tick()
      storage.write(STORAGE_KEYS.session, { kind: 'guest' } satisfies Session)
    },

    async createRoute(request) {
      await tick()
      return pushVersion(buildRoute(request))
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
      // Saved routes belong to the account: guests see none. Routes from other
      // destinations (older demos) stay in storage but are not listed.
      const session = readSession()
      if (session.kind !== 'account') return []
      return savedRoutesOf(session.email)
        .filter(isLocalRoute)
        .map(clone)
        .sort((a, b) => b.request.date.localeCompare(a.request.date))
    },

    async saveRoute(id) {
      await tick()
      const session = readSession()
      if (session.kind !== 'account') throw new Error(DATA_ERRORS.guestCannotSave)
      updateAllVersions(id, { saved: true })
      setOwner(id, session.email)
      return current(id)
    },

    async deleteRoute(id) {
      await tick()
      const routes = readRoutes()
      delete routes[id]
      writeRoutes(routes)
      const ratings = readRatings()
      delete ratings[id]
      writeRatings(ratings)
      setOwner(id, undefined)
    },

    async rateRoute(id, rating) {
      await tick()
      versionsOf(id)
      const ratings = readRatings()
      ratings[id] = clone(rating)
      writeRatings(ratings)
    },

    async getRating(id) {
      await tick()
      const rating = readRatings()[id]
      return rating ? clone(rating) : null
    },

    async setFavorite(id, favorite) {
      await tick()
      updateAllVersions(id, { favorite })
      return current(id)
    },

    async updateAccount(patch) {
      await tick()
      const session = readSession()
      if (session.kind !== 'account') throw new Error(DATA_ERRORS.notAnAccount)
      const next: Session = {
        ...session,
        ...patch,
        kind: 'account',
        settings: { ...DEFAULT_ACCOUNT_SETTINGS, ...session.settings, ...patch.settings },
      }
      storage.write(STORAGE_KEYS.session, next)
      if (next.email !== session.email) {
        const owners = readOwners()
        for (const [rid, owner] of Object.entries(owners)) if (owner === session.email) owners[rid] = next.email ?? ''
        storage.write(STORAGE_KEYS.owners, owners)
        const old = session.email?.toLowerCase()
        writeAccounts(readAccounts().map((e) => (e === old ? (next.email ?? '').toLowerCase() : e)))
      }
      return next
    },

    async deleteAccount() {
      await tick()
      // The email can be registered again once its account is gone.
      const gone = readSession().email?.toLowerCase()
      writeAccounts(readAccounts().filter((e) => e !== gone))
      // Preferences stay: the four onboarding questions are asked only once.
      storage.remove(STORAGE_KEYS.session)
      storage.remove(STORAGE_KEYS.routes)
      storage.remove(STORAGE_KEYS.ratings)
      storage.remove(STORAGE_KEYS.owners)
      storage.remove(STORAGE_KEYS.currentRoute)
      storage.remove(STORAGE_KEYS.verifyToken)
    },

    // Feature 4: simulated verification and the fake Google/Apple sign-in.
    async verifyEmail(token) {
      await tick()
      const link = storage.read<DemoVerification | null>(STORAGE_KEYS.verifyToken, null)
      if (!link || link.token !== token) throw new ApiClientError(t('verify.invalidTitle'), 'INVALID_TOKEN', 400)
      storage.remove(STORAGE_KEYS.verifyToken)
      const session = readSession()
      if (session.kind === 'account' && session.email === link.email) {
        storage.write(STORAGE_KEYS.session, { ...session, emailVerified: true } satisfies Session)
      }
      return { email: link.email }
    },

    async resendVerification() {
      await tick()
      const session = readSession()
      if (session.kind !== 'account' || !session.email) throw new Error(DATA_ERRORS.notAnAccount)
      issueDemoLink(session.email)
    },

    async authProviders() {
      await tick()
      return ['google', 'apple']
    },

    signInWith: (provider) => login(DEMO_PROVIDER_EMAILS[provider]),

    async completeSignIn() {
      await tick()
      throw new ApiClientError(t('oauth.errorText'), 'NOT_SUPPORTED', 400)
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
      // Pauses have no alternatives.
      if (!base || base.kind === 'pause') return []
      const inRoute = new Set(route.stops.map((s) => s.placeId))
      const catalog = getCityCatalog(route.request.city)
      const prefs = effectivePrefs(route.request)
      const candidates = catalog.places.filter((p) => p.kind !== 'pause' && !inRoute.has(p.id))
      const shared = (p: CatalogPlace) => p.categories.filter((c) => base.categories.includes(c)).length
      const byFit = (a: CatalogPlace, b: CatalogPlace) => shared(b) - shared(a) || a.order - b.order
      const handPicked = (base.alternatives ?? [])
        .map((id) => candidates.find((p) => p.id === id))
        .filter((p): p is CatalogPlace => Boolean(p))
      const rest = candidates.filter((p) => !handPicked.includes(p))
      // Same kind first (sight for sight, food for food), then anything else to reach three.
      const ordered = [
        ...handPicked,
        ...rest.filter((p) => p.kind === base.kind).sort(byFit),
        ...rest.filter((p) => p.kind !== base.kind).sort(byFit),
      ]
      return ordered.slice(0, 3).map(
        (p): PlaceWithHints => ({ ...toPlace(p), travel: travel(catalog, base.id, p.id, prefs.transport) }),
      )
    },
  }
}

/** Contract Place plus the optional presentation hints (src/lib/placeHints.ts). */
function toPlace(p: CatalogPlace): PlaceWithHints {
  const place: Place = { id: p.id, name: p.name, categories: [...p.categories], why: p.why, hours: p.hours, price: p.price, photo: p.photo }
  return { ...place, activity: activityOf(p), visitMinutes: p.visitMinutes }
}

/** Default instance backed by window.localStorage. */
export const dataModule: DataModule = createDataModule()
