import type { AccountSettings, DataModule, Rating, Route, Session } from '../contract/types'
import type { AssistantDeps } from '../assistant/types'
import { DEFAULT_ACCOUNT_SETTINGS } from './defaults'

type Account = { email: string }
type AuthResult = { token: string; account: Account }
/** Name and settings the server does not store yet (see TODO(backend) below). */
type LocalAccount = { name?: string; settings?: AccountSettings }

type ConnectedData = DataModule & Required<Pick<AssistantDeps, 'interpretRequest' | 'refineConversation'>>

/** Pass the full /api/cacahuete URL (local or deployed) to use the PostgreSQL backend. */
export function createHttpDataModule(endpoint: string, storage: Storage = window.localStorage): ConnectedData {
  const base = new URL(endpoint, globalThis.location?.origin)
  const prefix = 'rt.api.' + base.href
  const tokenKey = prefix + '.session'
  const guestKey = prefix + '.guest'
  const accountKey = prefix + '.account'
  const favoritesKey = prefix + '.favorites'
  const ratingsKey = prefix + '.ratings'

  function readJson<T>(key: string, fallback: T): T {
    try {
      const raw = storage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  }
  const writeJson = (key: string, value: unknown) => storage.setItem(key, JSON.stringify(value))

  function guestToken() {
    let token = storage.getItem(guestKey)
    if (!token) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
      storage.setItem(guestKey, token)
    }
    return token
  }

  async function call<T>(action: string, method = 'GET', body?: unknown, id?: string, order?: number): Promise<T> {
    const url = new URL(base)
    url.searchParams.set('action', action)
    if (id !== undefined) url.searchParams.set('id', id)
    if (order !== undefined) url.searchParams.set('order', String(order))
    const token = storage.getItem(tokenKey)
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = 'Bearer ' + token
    else headers['X-Guest-Token'] = guestToken()
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(url, { method, headers, body: JSON.stringify(body) })
    if (!response.ok) {
      const problem = await response.json().catch(() => null)
      if (token && response.status === 401 && problem?.error?.code === 'UNAUTHENTICATED') {
        if (storage.getItem(tokenKey) === token) storage.removeItem(tokenKey)
        if (action === 'status' || action === 'getPreferences') return call<T>(action)
      }
      throw new Error(problem?.error?.message ?? `Error HTTP ${response.status}`)
    }
    return response.status === 204 ? undefined as T : response.json()
  }

  function asSession(account: Account | null): Session {
    if (!account) return { kind: 'guest' }
    const local = readJson<LocalAccount>(accountKey, {})
    return {
      kind: 'account',
      email: account.email,
      name: local.name ?? account.email.split('@')[0],
      settings: local.settings ?? { ...DEFAULT_ACCOUNT_SETTINGS },
    }
  }

  async function signIn(action: string, email: string, password: string) {
    const { account, token } = await call<AuthResult>(action, 'POST', { email, password })
    storage.setItem(tokenKey, token)
    storage.removeItem(guestKey)
    return asSession(account)
  }

  // TODO(backend): the API has no favourite flag yet; it is kept per browser and
  // overlaid on every route the server returns.
  const favorites = () => readJson<Record<string, boolean>>(favoritesKey, {})
  const withFavorite = (route: Route): Route => ({ ...route, favorite: favorites()[route.id] ?? route.favorite ?? false })
  const routeCall = (...args: Parameters<typeof call>) => call<Route>(...args).then(withFavorite)

  return {
    interpretRequest: text => call('interpretRequest', 'POST', { text }),
    refineConversation: (route, changes) =>
      call<Route[]>('refineConversation', 'POST', { changes, version: route.version }, route.id).then(steps => steps.map(withFavorite)),
    getPreferences: () => call('getPreferences'),
    savePreferences: p => call('savePreferences', 'PUT', p),
    getSession: async () => asSession((await call<{ account: Account | null }>('status')).account),
    register: (email, password) => signIn('register', email, password),
    login: (email, password) => signIn('login', email, password),
    logout: async () => {
      if (storage.getItem(tokenKey)) await call('logout', 'POST')
      storage.removeItem(tokenKey)
    },
    createRoute: request => routeCall('createRoute', 'POST', request),
    refineRoute: (id, action) => routeCall('refineRoute', 'POST', action, id),
    undo: id => routeCall('undo', 'POST', undefined, id),
    getRoute: id => routeCall('getRoute', 'GET', undefined, id),
    listRoutes: () =>
      call<Route[]>('listRoutes').then(routes => routes.filter(r => r.saved).map(withFavorite)
        .sort((a, b) => b.request.date.localeCompare(a.request.date))),
    saveRoute: id => routeCall('saveRoute', 'POST', undefined, id),
    deleteRoute: async id => {
      await call('deleteRoute', 'DELETE', undefined, id)
      const favs = { ...favorites() }
      delete favs[id]
      writeJson(favoritesKey, favs)
      const ratings = { ...readJson<Record<string, Rating>>(ratingsKey, {}) }
      delete ratings[id]
      writeJson(ratingsKey, ratings)
    },
    rateRoute: async (id, rating) => {
      await call('rateRoute', 'PUT', rating, id)
      // TODO(backend): no getRating action yet; keep a copy to show the saved rating.
      writeJson(ratingsKey, { ...readJson<Record<string, Rating>>(ratingsKey, {}), [id]: rating })
    },
    getPlace: id => call('getPlace', 'GET', undefined, id),
    getAlternatives: (id, order) => call('getAlternatives', 'GET', undefined, id, order),

    // Feature 2 additions (contract `// Añadido en feature 2`). The backend has no
    // actions for them yet, so they are served from this browser's storage.
    setFavorite: async (id, favorite) => {
      const route = await call<Route>('getRoute', 'GET', undefined, id)
      writeJson(favoritesKey, { ...favorites(), [id]: favorite })
      return { ...route, favorite }
    },
    getRating: async id => readJson<Record<string, Rating>>(ratingsKey, {})[id] ?? null,
    updateAccount: async patch => {
      const session = await call<{ account: Account | null }>('status').then(r => asSession(r.account))
      if (session.kind !== 'account') throw new Error('NOT_AN_ACCOUNT')
      // TODO(backend): name and settings are not stored server side; the email cannot change yet.
      const local = readJson<LocalAccount>(accountKey, {})
      writeJson(accountKey, {
        name: patch.name ?? local.name,
        settings: patch.settings ?? local.settings,
      } satisfies LocalAccount)
      return { ...session, name: patch.name ?? session.name, settings: patch.settings ?? session.settings }
    },
    deleteAccount: async () => {
      // TODO(backend): no deleteAccount action yet; this only signs out and clears local data.
      if (storage.getItem(tokenKey)) await call('logout', 'POST')
      for (const key of [tokenKey, accountKey, favoritesKey, ratingsKey]) storage.removeItem(key)
    },
  }
}
