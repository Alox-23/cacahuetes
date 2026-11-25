/** Minimal key-value backend (window.localStorage satisfies it). */
export interface KeyValueBackend {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface JsonStorage {
  read<T>(key: string, fallback: T): T
  write(key: string, value: unknown): void
  remove(key: string): void
}

export const STORAGE_KEYS = {
  preferences: 'rt.preferences',
  session: 'rt.session',
  routes: 'rt.routes',
  ratings: 'rt.ratings',
  /** Saved route id → account email (routes belong to the account). */
  owners: 'rt.routeOwners',
  currentRoute: 'rt.currentRoute',
  /** Feature 3: the conversation (last 200 items), restored as read-only history. */
  thread: 'rt.thread',
  /** Feature 4: emails registered in this browser (register refuses them again). */
  accounts: 'rt.accounts',
  /** Feature 4: the demo verification link `{ token, email }` (one at a time). */
  verifyToken: 'rt.verifyToken',
} as const

/** In-memory backend: used in tests and when localStorage is unavailable. */
export function memoryBackend(initial: Record<string, string> = {}): KeyValueBackend {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

/** window.localStorage when usable (private mode / blocked storage fall back to memory). */
export function browserBackend(): KeyValueBackend {
  try {
    const ls = window.localStorage
    const probe = '__rt_probe__'
    ls.setItem(probe, probe)
    ls.removeItem(probe)
    return ls
  } catch {
    return memoryBackend()
  }
}

/** JSON wrapper that never throws: bad or missing data returns the fallback. */
export function createStorage(backend: KeyValueBackend = browserBackend()): JsonStorage {
  return {
    read<T>(key: string, fallback: T): T {
      try {
        const raw = backend.getItem(key)
        return raw === null ? fallback : (JSON.parse(raw) as T)
      } catch {
        return fallback
      }
    },
    write(key, value) {
      try {
        backend.setItem(key, JSON.stringify(value))
      } catch {
        // Quota exceeded or storage blocked: keep working in memory only.
      }
    },
    remove(key) {
      try {
        backend.removeItem(key)
      } catch {
        // ignore
      }
    },
  }
}
