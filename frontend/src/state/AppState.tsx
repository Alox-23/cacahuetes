/* eslint-disable react-refresh/only-export-components -- provider and its hooks live together */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createAssistant, type MockAssistant } from '../assistant/mockAssistant'
import type { AssistantDeps, AssistantMode, RichReply } from '../assistant/types'
import { Toast } from '../components/Toast/Toast'
import type { DataModule, Preferences, Route, RouteRequest, Session } from '../contract/types'
import { dataModule } from '../data/mockData'
import { STORAGE_KEYS, createStorage, type JsonStorage } from '../data/storage'
import { t } from '../i18n'
import { routeEnd } from '../lib/route'
import { isoDate, nextWeekday, parseIsoDate } from '../lib/time'
import {
  capThread,
  markChosen,
  modeView,
  restoreThread,
  type CreationStatus,
  type Epochs,
  type NoticeQuick,
  type ThreadItem,
} from './thread'

export type { ThreadItem } from './thread'

type SendInput = { text?: string; option?: string }

type StartOpts = { key?: string; route?: Route; request?: RouteRequest; greet?: boolean }

type EnsureOpts = {
  key: string
  route?: Route
  greet?: boolean
  /**
   * Greet even when the mode already runs for `key` but this screen would be
   * empty (mobile change chat after a desktop creation or a reload). The
   * desktop chat never sets it, so restored history is not greeted again.
   */
  greetIfEmpty?: boolean
}

export const TOAST_MS = 2500

/** Time between two creation steps. */
export const STEP_MS = 600
export const CREATION_STEPS = 4

/** A stored request ready to reuse: a past date moves to the next same weekday. */
export function reuseRequest(request: RouteRequest, today: Date = new Date()): RouteRequest {
  const copy: RouteRequest = JSON.parse(JSON.stringify(request))
  if (copy.date < isoDate(today)) copy.date = isoDate(nextWeekday(today, parseIsoDate(copy.date).getDay()))
  return copy
}

/** Route creation in progress (feature 3 §4.4): shared by /creating (mobile) and the chat (desktop). */
export type Creation = {
  id: string
  request: RouteRequest
  /** Steps completed (0–4). */
  step: number
  status: CreationStatus
  route?: Route
  /** The route view has been shown: the creation is over. */
  seen?: boolean
}

type AppStateValue = {
  /** The data module, with every mutation bumping `routeRevision`. */
  data: DataModule
  preferences: Preferences | null
  savePreferences: (p: Preferences) => Promise<void>
  session: Session
  setSession: (s: Session) => void
  /** Re-read the session from the data module (after login, register, logout, account changes). */
  refreshSession: () => Promise<Session>
  currentRouteId: string | null
  setCurrentRouteId: (id: string | null) => void
  thread: ThreadItem[]
  epochs: Epochs
  pending: Record<AssistantMode, boolean>
  /** Reset a mode (new epoch, fresh assistant) and optionally ask for the opening message. Nothing is deleted. */
  startChat: (mode: AssistantMode, opts?: StartOpts) => void
  /** Like startChat, but only if this mode is not already running for `key`. */
  ensureChat: (mode: AssistantMode, opts: EnsureOpts) => void
  /** The key the mode currently runs for (route id in change mode). */
  chatKey: (mode: AssistantMode) => string | undefined
  /** Send to the assistant; `echo` is the user bubble text (defaults to input.text). */
  send: (mode: AssistantMode, input: SendInput, echo?: string) => Promise<RichReply | undefined>
  /** Assistant text produced by the UI, not the script. */
  addNotice: (mode: AssistantMode, text: string[], opts?: { hint?: string; quick?: NoticeQuick[]; desktopOnly?: boolean }) => void
  /** "Reutilizar": a new request conversation whose first reply is the summary of `request`. */
  startReuse: (request: RouteRequest, echo?: string) => void
  creation: Creation | null
  /** "Crear ruta": starts creating once (event handler, StrictMode-safe). */
  startCreation: (request: RouteRequest) => void
  cancelCreation: () => void
  /** The route view is on screen: the finished creation is over. */
  acknowledgeCreation: (routeId: string) => void
  /** Epoch of the request whose summary already produced a route (desktop starts a fresh request after it). */
  usedRequestEpoch: number | null
  /** Bumped by every mutation through `data` and by change replies; route views refetch on it. */
  routeRevision: number
  /** Short message in the bottom toast (auto-hides). */
  showToast: (message: string) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

let seq = 0
const nextId = () => `${Date.now().toString(36)}-${++seq}`

export type AssistantFactory = (deps: AssistantDeps) => MockAssistant

type ProviderProps = {
  children: ReactNode
  data?: DataModule
  /** Where the current route id and the thread are remembered (default: localStorage). */
  storage?: JsonStorage
  assistantFactory?: AssistantFactory
  /** Override the simulated thinking delay (tests). */
  assistantDelay?: (ms: number) => Promise<void>
  /** Override the time between creation steps (tests). */
  stepMs?: number
}

const noModes = <T,>(value: T): Record<AssistantMode, T> => ({ onboarding: value, request: value, change: value })

/** Mutations that change what a route view or the saved list shows. */
const MUTATIONS = [
  'refineRoute',
  'undo',
  'saveRoute',
  'deleteRoute',
  'setFavorite',
  'rateRoute',
  'register',
  'login',
  'logout',
  'updateAccount',
  'deleteAccount',
] as const

/** The same module (extra fields such as API helpers or capabilities kept), mutations bump the revision. */
function trackMutations(data: DataModule, bump: () => void): DataModule {
  const tracked: Record<string, unknown> = { ...data }
  for (const name of MUTATIONS) {
    const fn = data[name] as (...args: unknown[]) => Promise<unknown>
    tracked[name] = async (...args: unknown[]) => {
      const result = await fn.apply(data, args)
      bump()
      return result
    }
  }
  return tracked as unknown as DataModule
}

export function AppStateProvider({
  children,
  data: rawData = dataModule,
  storage,
  assistantFactory = createAssistant,
  assistantDelay,
  stepMs = STEP_MS,
}: ProviderProps) {
  const store = useMemo(() => storage ?? createStorage(), [storage])
  const [loaded, setLoaded] = useState(false)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [session, setSession] = useState<Session>({ kind: 'guest' })
  const [currentRouteId, setCurrentRouteIdState] = useState<string | null>(() =>
    store.read<string | null>(STORAGE_KEYS.currentRoute, null),
  )
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null)
  const [routeRevision, setRouteRevision] = useState(0)
  const bump = useCallback(() => setRouteRevision((r) => r + 1), [])
  const data = useMemo(() => trackMutations(rawData, bump), [rawData, bump])

  // ---------- thread ----------
  const [thread, setThreadState] = useState<ThreadItem[]>(() => restoreThread(store.read<unknown>(STORAGE_KEYS.thread, [])))
  const threadRef = useRef(thread)
  const setThread = useCallback((update: (prev: ThreadItem[]) => ThreadItem[]) => {
    setThreadState((prev) => {
      const next = capThread(update(prev))
      threadRef.current = next
      return next
    })
  }, [])
  useEffect(() => {
    store.write(STORAGE_KEYS.thread, thread)
  }, [store, thread])

  const [epochs, setEpochs] = useState<Epochs>(noModes(0))
  const epochsRef = useRef<Epochs>(noModes(0))
  const [pending, setPending] = useState<Record<AssistantMode, boolean>>(noModes(false))
  const busy = useRef<Record<AssistantMode, boolean>>(noModes(false))
  const keys = useRef<Record<AssistantMode, string | undefined>>(noModes(undefined))

  const append = useCallback((items: ThreadItem[]) => setThread((prev) => [...prev, ...items]), [setThread])

  const savePreferences = useCallback(
    async (p: Preferences) => {
      await data.savePreferences(p)
      // Re-read so every screen (e.g. /chat) reflects the stored value.
      setPreferences(await data.getPreferences())
    },
    [data],
  )

  const refreshSession = useCallback(async () => {
    const s = await data.getSession()
    setSession(s)
    return s
  }, [data])

  const showToast = useCallback((message: string) => {
    setToast((prev) => ({ message, id: (prev?.id ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const setCurrentRouteId = useCallback(
    (id: string | null) => {
      setCurrentRouteIdState(id)
      store.write(STORAGE_KEYS.currentRoute, id)
    },
    [store],
  )

  // One scripted assistant per mode, all behind the same sendMessage seam.
  const assistants = useRef<Record<AssistantMode, MockAssistant> | null>(null)
  if (assistants.current === null) {
    const deps: AssistantDeps = {
      getPreferences: () => data.getPreferences(),
      savePreferences: (p) => savePreferences(p),
      getRoute: (id) => data.getRoute(id),
      refineRoute: (id, action) => data.refineRoute(id, action),
      undo: (id) => data.undo(id),
      delay: assistantDelay,
    }
    const make = (mode: AssistantMode) => {
      const a = assistantFactory(deps)
      a.reset(mode)
      return a
    }
    assistants.current = { onboarding: make('onboarding'), request: make('request'), change: make('change') }
  }
  const assistantFor = (mode: AssistantMode) => (assistants.current as Record<AssistantMode, MockAssistant>)[mode]

  const send = useCallback(
    async (mode: AssistantMode, input: SendInput, echo?: string) => {
      if (busy.current[mode]) return undefined
      busy.current[mode] = true
      const epoch = epochsRef.current[mode]
      const userText = echo ?? input.text
      setThread((prev) => [
        ...markChosen(prev, mode, epoch, input.option),
        ...(userText ? [{ id: nextId(), mode, epoch, kind: 'user' as const, text: userText }] : []),
      ])
      setPending((p) => ({ ...p, [mode]: true }))
      let reply: RichReply
      try {
        reply = await assistantFor(mode).sendMessage(input)
      } catch {
        reply = { kind: 'question', text: t('assistant.error') }
      }
      // A change reply may have edited the route through a path the provider does not see
      // (the API's refineConversation): route views refetch either way.
      if (mode === 'change') bump()
      if (epochsRef.current[mode] !== epoch) return undefined // the mode was reset meanwhile
      busy.current[mode] = false
      setPending((p) => ({ ...p, [mode]: false }))
      append([{ id: nextId(), mode, epoch, kind: 'assistant', reply }])
      return reply
    },
    [append, setThread, bump],
  )

  const startChat = useCallback(
    (mode: AssistantMode, opts: StartOpts = {}) => {
      const next = { ...epochsRef.current, [mode]: epochsRef.current[mode] + 1 }
      epochsRef.current = next
      setEpochs(next)
      busy.current[mode] = false
      setPending((p) => ({ ...p, [mode]: false }))
      keys.current[mode] = opts.key
      assistantFor(mode).reset(mode, { route: opts.route, request: opts.request })
      if (opts.greet) void send(mode, {})
    },
    [send],
  )

  const ensureChat = useCallback(
    (mode: AssistantMode, opts: EnsureOpts) => {
      if (keys.current[mode] === opts.key) {
        const visible = modeView(threadRef.current, mode, epochsRef.current[mode])
        if (opts.greetIfEmpty && visible.length === 0 && !busy.current[mode]) void send(mode, {})
        return
      }
      startChat(mode, opts)
    },
    [startChat, send],
  )

  const chatKey = useCallback((mode: AssistantMode) => keys.current[mode], [])

  const addNotice = useCallback(
    (mode: AssistantMode, text: string[], opts: { hint?: string; quick?: NoticeQuick[]; desktopOnly?: boolean } = {}) =>
      append([{ id: nextId(), mode, epoch: epochsRef.current[mode], kind: 'notice', text, ...opts }]),
    [append],
  )

  const startReuse = useCallback(
    (request: RouteRequest, echo?: string) => {
      startChat('request', { key: `reuse-${Date.now()}`, request: reuseRequest(request) })
      void send('request', {}, echo)
    },
    [startChat, send],
  )

  // Load persisted state once; render nothing until then (avoids redirect flicker).
  useEffect(() => {
    let alive = true
    const routeId = store.read<string | null>(STORAGE_KEYS.currentRoute, null)
    Promise.all([data.getPreferences(), data.getSession(), routeId ? data.getRoute(routeId).catch(() => null) : Promise.resolve(null)])
      .then(([p, s, route]) => {
        if (!alive) return
        setPreferences(p)
        setSession(s)
        // The conversation comes back as history; change mode is re-armed for the route, silently.
        if (route && keys.current.change === undefined) startChat('change', { key: route.id, route })
      })
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [data, store, startChat])

  // ---------- route creation ----------
  const [creation, setCreation] = useState<Creation | null>(null)
  const [usedRequestEpoch, setUsedRequestEpoch] = useState<number | null>(null)

  const setProgress = useCallback(
    (creationId: string, status: CreationStatus, routeId?: string) =>
      setThread((prev) => prev.map((i) => (i.id === creationId && i.kind === 'progress' ? { ...i, status, routeId } : i))),
    [setThread],
  )

  const startCreation = useCallback(
    (request: RouteRequest) => {
      if (creation?.status === 'running') return
      const id = nextId()
      const epoch = epochsRef.current.request
      append([
        { id: nextId(), mode: 'request', epoch, kind: 'user', text: t('summary.create'), desktopOnly: true },
        { id, mode: 'request', epoch, kind: 'progress', request, status: 'running', desktopOnly: true },
      ])
      setCreation({ id, request, step: 0, status: 'running' })
      data.createRoute(request).then(
        (route) => setCreation((c) => (c && c.id === id ? { ...c, route } : c)),
        () => {
          setCreation((c) => (c && c.id === id ? { ...c, status: 'failed' } : c))
          setProgress(id, 'failed')
        },
      )
    },
    [creation, append, data, setProgress],
  )

  // Advance the four steps; finish once they are shown and the route exists.
  useEffect(() => {
    if (!creation || creation.status !== 'running') return
    if (creation.step < CREATION_STEPS) {
      const timer = setTimeout(() => setCreation((c) => (c && c.id === creation.id ? { ...c, step: c.step + 1 } : c)), stepMs)
      return () => clearTimeout(timer)
    }
    const route = creation.route
    if (!route) return
    setCreation({ ...creation, status: 'done' })
    setProgress(creation.id, 'done', route.id)
    setUsedRequestEpoch(epochsRef.current.request)
    setCurrentRouteId(route.id)
    // The route is the context now: change mode is armed for it without its greeting.
    startChat('change', { key: route.id, route })
    addNotice('change', [t('desktop.routeCreated', { count: route.stops.length, from: route.request.timeWindow.from, to: routeEnd(route) })], {
      desktopOnly: true,
    })
  }, [creation, stepMs, setProgress, setCurrentRouteId, startChat, addNotice])

  const cancelCreation = useCallback(() => {
    if (creation?.status === 'running') setProgress(creation.id, 'cancelled')
    setCreation(null)
  }, [creation, setProgress])

  const acknowledgeCreation = useCallback((routeId: string) => {
    setCreation((c) => (c && c.status === 'done' && c.route?.id === routeId ? null : c))
  }, [])

  const value = useMemo<AppStateValue>(
    () => ({
      data,
      preferences,
      savePreferences,
      session,
      setSession,
      refreshSession,
      currentRouteId,
      setCurrentRouteId,
      thread,
      epochs,
      pending,
      startChat,
      ensureChat,
      chatKey,
      send,
      addNotice,
      startReuse,
      creation,
      startCreation,
      cancelCreation,
      acknowledgeCreation,
      usedRequestEpoch,
      routeRevision,
      showToast,
    }),
    [
      data,
      preferences,
      savePreferences,
      session,
      refreshSession,
      currentRouteId,
      setCurrentRouteId,
      thread,
      epochs,
      pending,
      startChat,
      ensureChat,
      chatKey,
      send,
      addNotice,
      startReuse,
      creation,
      startCreation,
      cancelCreation,
      acknowledgeCreation,
      usedRequestEpoch,
      routeRevision,
      showToast,
    ],
  )

  if (!loaded) return null
  return (
    <AppStateContext.Provider value={value}>
      {children}
      <CreationWatcher />
      <Toast key={toast?.id} message={toast?.message ?? null} />
    </AppStateContext.Provider>
  )
}

/** When a creation finishes, both layouts open the route (once per creation). */
function CreationWatcher() {
  const { creation } = useAppState()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (creation?.status !== 'done' || !creation.route || done.current === creation.id) return
    done.current = creation.id
    navigate(`/route/${creation.route.id}`, { replace: pathname === '/creating' })
  }, [creation, navigate, pathname])
  return null
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}

export function useData(): DataModule {
  return useAppState().data
}

export function usePreferences() {
  const { preferences, savePreferences } = useAppState()
  return { preferences, savePreferences }
}

export function useSession() {
  const { session, setSession, refreshSession } = useAppState()
  return { session, setSession, refreshSession, isAccount: session.kind === 'account' }
}

export function useToast() {
  const { showToast } = useAppState()
  return { show: showToast }
}

export function useReuse() {
  return useAppState().startReuse
}

export function useCurrentRoute() {
  const { currentRouteId, setCurrentRouteId } = useAppState()
  return { currentRouteId, setCurrentRouteId }
}

export function useCreation() {
  const { creation, startCreation, cancelCreation, acknowledgeCreation } = useAppState()
  return { creation, startCreation, cancelCreation, acknowledgeCreation }
}

/** Saved routes (Mis rutas, sidebar), refetched on every route mutation or session change. */
export function useSavedRoutes() {
  const { data, routeRevision, session } = useAppState()
  const [routes, setRoutes] = useState<Route[] | null>(null)
  useEffect(() => {
    let alive = true
    data.listRoutes().then(
      (list) => alive && setRoutes(list),
      () => alive && setRoutes([]),
    )
    return () => {
      alive = false
    }
  }, [data, routeRevision, session])
  return { routes: routes ?? [], loaded: routes !== null }
}

/** Mobile view of one mode: its live epoch, as before the single thread (feature 1 behaviour). */
export function useChat(mode: AssistantMode) {
  const { thread, epochs, pending, send, startChat, ensureChat, chatKey } = useAppState()
  const messages = useMemo(
    () => modeView(thread, mode, epochs[mode]).filter((i) => i.kind === 'user' || i.kind === 'assistant'),
    [thread, mode, epochs],
  )
  return {
    messages,
    pending: pending[mode],
    chatKey: chatKey(mode),
    send: useCallback((input: SendInput, echo?: string) => send(mode, input, echo), [send, mode]),
    start: useCallback((opts?: StartOpts) => startChat(mode, opts), [startChat, mode]),
    ensure: useCallback((opts: EnsureOpts) => ensureChat(mode, opts), [ensureChat, mode]),
  }
}
