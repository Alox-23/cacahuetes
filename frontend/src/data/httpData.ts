import catalog from '../../../backend/lib/marbella.json' with { type: 'json' }
import type { AccountSettings, AgentReply, AuthProvider, DataModule, Place, Rating, Route, Session } from '../contract/types'
import type { AssistantDeps } from '../assistant/types'
import { DEFAULT_ACCOUNT_SETTINGS } from './defaults.ts'
import { ApiClientError } from './errors.ts'

type Account = { email: string; emailVerified?: boolean }
type AuthResult = { token: string; account: Account }
/** `status.auth` (feature 4): configured providers and whether email verification is in play. */
type AuthInfo = { providers: AuthProvider[]; mail: boolean }
type StatusResult = { account: Account | null; auth?: AuthInfo }
type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type HttpDataOptions = {
  /** Per-tab storage for the OAuth `state` (default: window.sessionStorage). */
  session?: KeyValue
  /** Leaves the app for the provider's sign-in page (default: window.location.assign). */
  navigate?: (url: string) => void
}
/** Name and settings the server does not store yet (see TODO(backend) below), kept per email. */
type LocalAccount = { name?: string; settings?: AccountSettings }
type LocalAccounts = Record<string, LocalAccount>

type ConnectedData = DataModule &
  Required<Pick<AssistantDeps, 'interpretRequest' | 'refineConversation' | 'routeQuestion'>> &
  Required<Pick<DataModule, 'agent'>>

const pad = (n: number) => String(n).padStart(2, '0')
/** The visitor's wall clock (feature 5 §3): the server may run on another clock. */
function clientClock(date = new Date()) {
  return {
    today: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    now: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

/** Pass the full /api/cacahuete URL (local or deployed) to use the PostgreSQL backend. */
export function createHttpDataModule(
  endpoint: string,
  storage: KeyValue = window.localStorage,
  options: HttpDataOptions = {},
): ConnectedData {
  const tabStorage = options.session ?? globalThis.sessionStorage
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url))
  const base = new URL(endpoint, globalThis.location?.origin)
  const prefix = 'rt.api.' + base.href
  const tokenKey = prefix + '.session'
  const guestKey = prefix + '.guest'
  const accountKey = prefix + '.account'
  const favoritesKey = prefix + '.favorites'
  const ratingsKey = prefix + '.ratings'
  const oauthStateKey = prefix + '.oauthState'
  // Last `status.auth`; sign-in responses carry no `auth`, so they reuse it.
  let auth: AuthInfo | null = null

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
      const { code, message, ...details } = (problem?.error ?? {}) as Record<string, unknown>
      throw new ApiClientError(
        typeof message === 'string' ? message : `Error HTTP ${response.status}`,
        typeof code === 'string' ? code : `HTTP_${response.status}`,
        response.status,
        details,
      )
    }
    return response.status === 204 ? undefined as T : response.json()
  }

  async function status() {
    const result = await call<StatusResult>('status')
    // An API without feature 4 sends no `auth`: no providers, no verification.
    auth = result.auth ?? { providers: [], mail: false }
    return result
  }

  async function loadAuth(): Promise<AuthInfo> {
    if (!auth) await status()
    return auth ?? { providers: [], mail: false }
  }

  function asSession(account: Account | null): Session {
    if (!account) return { kind: 'guest' }
    const local = readJson<LocalAccounts>(accountKey, {})[account.email] ?? {}
    return {
      kind: 'account',
      email: account.email,
      name: local.name ?? account.email.split('@')[0],
      settings: local.settings ?? { ...DEFAULT_ACCOUNT_SETTINGS },
      emailVerified: auth?.mail ? account.emailVerified : undefined,
    }
  }

  async function startSession({ account, token }: AuthResult) {
    storage.setItem(tokenKey, token)
    storage.removeItem(guestKey)
    if (!auth) await status().catch(() => undefined)
    return asSession(account)
  }

  const signIn = async (action: string, email: string, password: string) =>
    startSession(await call<AuthResult>(action, 'POST', { email, password }))

  // TODO(backend): the API has no favourite flag yet; it is kept per browser and
  // overlaid on every route the server returns.
  const favorites = () => readJson<Record<string, boolean>>(favoritesKey, {})
  const withFavorite = (route: Route): Route => ({ ...route, favorite: favorites()[route.id] ?? route.favorite ?? false })
  const routeCall = (...args: Parameters<typeof call>) => call<Route>(...args).then(withFavorite)

  // The backend clears a route's rating on every refine/undo; drop the local copy too.
  function forgetRating(id: string) {
    const ratings = { ...readJson<Record<string, Rating>>(ratingsKey, {}) }
    if (!(id in ratings)) return
    delete ratings[id]
    writeJson(ratingsKey, ratings)
  }

  return {
    routeQuestion: (id, text) => call('routeQuestion', 'POST', { text }, id),
    interpretRequest: text => call('interpretRequest', 'POST', { text }),
    refineConversation: async (route, changes) => {
      const steps = await call<Route[]>('refineConversation', 'POST', { changes, version: route.version }, route.id)
      forgetRating(route.id)
      return steps.map(withFavorite)
    },
    // Feature 5: one turn of the conversational agent (the model decides, the planner computes).
    agent: async ({ text, routeId }) => {
      const reply = await call<AgentReply>('agent', 'POST', { text, routeId, client: clientClock() })
      const touched = new Set<string>()
      for (const event of reply.events ?? []) {
        if (event.type === 'route_changed' || event.type === 'undone') touched.add(event.routeId)
      }
      for (const id of touched) forgetRating(id)
      return {
        text: reply.text,
        suggestions: Array.isArray(reply.suggestions) ? reply.suggestions : [],
        ...(reply.route ? { route: withFavorite(reply.route) } : {}),
        ...(reply.routeId ? { routeId: reply.routeId } : {}),
        events: Array.isArray(reply.events) ? reply.events : [],
        source: reply.source === 'rules' ? 'rules' : 'agent',
      }
    },
    getPreferences: () => call('getPreferences'),
    savePreferences: p => call('savePreferences', 'PUT', p),
    getSession: async () => asSession((await status()).account),
    register: (email, password) => signIn('register', email, password),
    login: (email, password) => signIn('login', email, password),
    logout: async () => {
      if (storage.getItem(tokenKey)) await call('logout', 'POST')
      storage.removeItem(tokenKey)
    },
    createRoute: request => routeCall('createRoute', 'POST', request),
    refineRoute: async (id, action) => {
      const route = await routeCall('refineRoute', 'POST', action, id)
      forgetRating(id)
      return route
    },
    undo: async id => {
      const route = await routeCall('undo', 'POST', undefined, id)
      forgetRating(id)
      return route
    },
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
      forgetRating(id)
    },
    rateRoute: async (id, rating) => {
      await call('rateRoute', 'PUT', rating, id)
      // TODO(backend): no getRating action yet; keep a copy to show the saved rating.
      writeJson(ratingsKey, { ...readJson<Record<string, Rating>>(ratingsKey, {}), [id]: rating })
    },
    getPlace: async id => {
      const place = await call<Place>('getPlace', 'GET', undefined, id)
      const entry = catalog.find(item => item.id === id)
      if (!entry) return place
      return { ...entry, ...place, photo: `/places/${encodeURIComponent(id)}.jpg` }
    },
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
      const { account } = await status()
      if (!account) throw new Error('NOT_AN_ACCOUNT')
      const session = asSession(account)
      // TODO(backend): name and settings are not stored server side; the email cannot change yet.
      const all = readJson<LocalAccounts>(accountKey, {})
      const local = all[account.email] ?? {}
      all[account.email] = { name: patch.name ?? local.name, settings: patch.settings ?? local.settings }
      writeJson(accountKey, all)
      return { ...session, name: patch.name ?? session.name, settings: patch.settings ?? session.settings }
    },
    deleteAccount: async () => {
      // TODO(backend): no deleteAccount action yet; this only signs out and clears local data.
      try {
        if (storage.getItem(tokenKey)) await call('logout', 'POST')
      } finally {
        for (const key of [tokenKey, accountKey, favoritesKey, ratingsKey]) storage.removeItem(key)
      }
    },

    // Feature 4: email verification and Google/Apple sign-in.
    verifyEmail: async token => {
      const { email } = await call<{ email: string }>('verifyEmail', 'POST', { token })
      return { email }
    },
    resendVerification: () => call('resendVerification', 'POST', {}),
    authProviders: async () => (await loadAuth()).providers,
    signInWith: async provider => {
      const { url, state } = await call<{ url: string; state: string }>('oauthStart', 'POST', { provider })
      tabStorage?.setItem(oauthStateKey, state)
      navigate(url)
      // The page is leaving for the provider; the sign-in finishes on /auth/callback.
      return new Promise<Session>(() => {})
    },
    completeSignIn: async fragment => {
      const params = new URLSearchParams(fragment.replace(/^#/, ''))
      const expected = tabStorage?.getItem(oauthStateKey) ?? null
      tabStorage?.removeItem(oauthStateKey)
      const error = params.get('error')
      if (error) throw new ApiClientError(error, error.toUpperCase(), 400)
      if (!expected || params.get('state') !== expected) throw new ApiClientError('INVALID_STATE', 'INVALID_STATE', 400)
      return startSession(await call<AuthResult>('oauthExchange', 'POST', { ticket: params.get('ticket') ?? '' }))
    },
  }
}
