import type { DataModule, Session } from '../contract/types'
import type { AssistantDeps } from '../assistant/types'

type Account = { email: string }
type AuthResult = { token: string; account: Account }
const asSession = (account: Account | null): Session => account
  ? { kind: 'account', email: account.email, name: account.email.split('@')[0] }
  : { kind: 'guest' }

type ConnectedData = DataModule & Required<Pick<AssistantDeps, 'interpretRequest' | 'refineConversation'>>

/** Pass the full /api/cacahuete URL (local or deployed) to use the PostgreSQL backend. */
export function createHttpDataModule(endpoint: string, storage: Storage = window.localStorage): ConnectedData {
  const base = new URL(endpoint, globalThis.location?.origin)
  const prefix = 'rt.api.' + base.href
  const tokenKey = prefix + '.session'
  const guestKey = prefix + '.guest'

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

  async function signIn(action: string, email: string, password: string) {
    const { account, token } = await call<AuthResult>(action, 'POST', { email, password })
    storage.setItem(tokenKey, token)
    storage.removeItem(guestKey)
    return asSession(account)
  }

  return {
    interpretRequest: text => call('interpretRequest', 'POST', { text }),
    refineConversation: (route, changes) => call('refineConversation', 'POST', { changes, version: route.version }, route.id),
    getPreferences: () => call('getPreferences'),
    savePreferences: p => call('savePreferences', 'PUT', p),
    getSession: async () => asSession((await call<{ account: Account | null }>('status')).account),
    register: (email, password) => signIn('register', email, password),
    login: (email, password) => signIn('login', email, password),
    logout: async () => {
      if (storage.getItem(tokenKey)) await call('logout', 'POST')
      storage.removeItem(tokenKey)
    },
    createRoute: request => call('createRoute', 'POST', request),
    refineRoute: (id, action) => call('refineRoute', 'POST', action, id),
    undo: id => call('undo', 'POST', undefined, id),
    getRoute: id => call('getRoute', 'GET', undefined, id),
    listRoutes: () => call('listRoutes'),
    saveRoute: id => call('saveRoute', 'POST', undefined, id),
    deleteRoute: id => call('deleteRoute', 'DELETE', undefined, id),
    rateRoute: (id, rating) => call('rateRoute', 'PUT', rating, id),
    getPlace: id => call('getPlace', 'GET', undefined, id),
    getAlternatives: (id, order) => call('getAlternatives', 'GET', undefined, id, order),
  }
}
