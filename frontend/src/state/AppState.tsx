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
import { createAssistant, type MockAssistant } from '../assistant/mockAssistant'
import type { AssistantDeps, AssistantMode, RichReply } from '../assistant/types'
import type { DataModule, Preferences, Route, RouteRequest, Session } from '../contract/types'
import { dataModule } from '../data/mockData'
import { STORAGE_KEYS, createStorage, type JsonStorage } from '../data/storage'
import { Toast } from '../components/Toast/Toast'
import { t } from '../i18n'
import { isoDate, nextWeekday, parseIsoDate } from '../lib/time'

export type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; reply: RichReply }

export type ChatState = {
  messages: ChatMessage[]
  pending: boolean
  /** What this transcript belongs to (route id in change mode). */
  key?: string
}

type SendInput = { text?: string; option?: string }

type StartOpts = { key?: string; route?: Route; request?: RouteRequest; greet?: boolean }

export const TOAST_MS = 2500

/** A stored request ready to reuse: a past date moves to the next same weekday. */
export function reuseRequest(request: RouteRequest, today: Date = new Date()): RouteRequest {
  const copy: RouteRequest = JSON.parse(JSON.stringify(request))
  if (copy.date < isoDate(today)) copy.date = isoDate(nextWeekday(today, parseIsoDate(copy.date).getDay()))
  return copy
}

type AppStateValue = {
  data: DataModule
  preferences: Preferences | null
  savePreferences: (p: Preferences) => Promise<void>
  session: Session
  setSession: (s: Session) => void
  /** Re-read the session from the data module (after login, register, logout, account changes). */
  refreshSession: () => Promise<Session>
  currentRouteId: string | null
  setCurrentRouteId: (id: string | null) => void
  pendingRequest: RouteRequest | null
  setPendingRequest: (r: RouteRequest | null) => void
  chats: Record<AssistantMode, ChatState>
  /** Reset a transcript (and its assistant) and optionally ask for the opening message. */
  startChat: (mode: AssistantMode, opts?: StartOpts) => void
  /** Like startChat, but only if this mode is not already running for `key`. */
  ensureChat: (mode: AssistantMode, opts: { key: string; route?: Route; greet?: boolean }) => void
  /** Send to the assistant; `echo` is the user bubble text (defaults to input.text). */
  send: (mode: AssistantMode, input: SendInput, echo?: string) => Promise<RichReply | undefined>
  /** "Reutilizar": a new request conversation whose first reply is the summary of `request`. */
  startReuse: (request: RouteRequest, echo?: string) => void
  /** Short message in the bottom toast (auto-hides). */
  showToast: (message: string) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

const emptyChat = (): ChatState => ({ messages: [], pending: false })

let messageSeq = 0
const nextId = () => `m${++messageSeq}`

export type AssistantFactory = (deps: AssistantDeps) => MockAssistant

type ProviderProps = {
  children: ReactNode
  data?: DataModule
  /** Where the current route id is remembered (default: localStorage). */
  storage?: JsonStorage
  assistantFactory?: AssistantFactory
  /** Override the simulated thinking delay (tests). */
  assistantDelay?: (ms: number) => Promise<void>
}

export function AppStateProvider({
  children,
  data = dataModule,
  storage,
  assistantFactory = createAssistant,
  assistantDelay,
}: ProviderProps) {
  const store = useMemo(() => storage ?? createStorage(), [storage])
  const [loaded, setLoaded] = useState(false)
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [session, setSession] = useState<Session>({ kind: 'guest' })
  const [currentRouteId, setCurrentRouteIdState] = useState<string | null>(() =>
    store.read<string | null>(STORAGE_KEYS.currentRoute, null),
  )
  const [pendingRequest, setPendingRequest] = useState<RouteRequest | null>(null)
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null)
  const [chats, setChats] = useState<Record<AssistantMode, ChatState>>({
    onboarding: emptyChat(),
    request: emptyChat(),
    change: emptyChat(),
  })

  // Load persisted state once; render nothing until then (avoids redirect flicker).
  useEffect(() => {
    let alive = true
    Promise.all([data.getPreferences(), data.getSession()])
      .then(([p, s]) => {
        if (!alive) return
        setPreferences(p)
        setSession(s)
      })
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [data])

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

  const epochs = useRef<Record<AssistantMode, number>>({ onboarding: 0, request: 0, change: 0 })
  const busy = useRef<Record<AssistantMode, boolean>>({ onboarding: false, request: false, change: false })
  const keys = useRef<Record<AssistantMode, string | undefined>>({ onboarding: undefined, request: undefined, change: undefined })

  const send = useCallback(async (mode: AssistantMode, input: SendInput, echo?: string) => {
    if (busy.current[mode]) return undefined
    busy.current[mode] = true
    const epoch = epochs.current[mode]
    const userText = echo ?? input.text
    setChats((prev) => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        pending: true,
        messages: userText ? [...prev[mode].messages, { id: nextId(), role: 'user', text: userText }] : prev[mode].messages,
      },
    }))
    let reply: RichReply
    try {
      reply = await (assistants.current as Record<AssistantMode, MockAssistant>)[mode].sendMessage(input)
    } catch {
      reply = { kind: 'question', text: t('assistant.error') }
    }
    if (epochs.current[mode] !== epoch) return undefined // transcript was reset meanwhile
    busy.current[mode] = false
    setChats((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], pending: false, messages: [...prev[mode].messages, { id: nextId(), role: 'assistant', reply }] },
    }))
    return reply
  }, [])

  const startChat = useCallback(
    (mode: AssistantMode, opts: StartOpts = {}) => {
      epochs.current[mode] += 1
      busy.current[mode] = false
      keys.current[mode] = opts.key
      ;(assistants.current as Record<AssistantMode, MockAssistant>)[mode].reset(mode, { route: opts.route, request: opts.request })
      setChats((prev) => ({ ...prev, [mode]: { messages: [], pending: false, key: opts.key } }))
      if (opts.greet) void send(mode, {})
    },
    [send],
  )

  const ensureChat = useCallback(
    (mode: AssistantMode, opts: { key: string; route?: Route; greet?: boolean }) => {
      if (keys.current[mode] === opts.key) return
      startChat(mode, opts)
    },
    [startChat],
  )

  const startReuse = useCallback(
    (request: RouteRequest, echo?: string) => {
      startChat('request', { key: `reuse-${Date.now()}`, request: reuseRequest(request) })
      void send('request', {}, echo)
    },
    [startChat, send],
  )

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
      pendingRequest,
      setPendingRequest,
      chats,
      startChat,
      ensureChat,
      send,
      startReuse,
      showToast,
    }),
    [data, preferences, savePreferences, session, refreshSession, currentRouteId, setCurrentRouteId, pendingRequest, chats, startChat, ensureChat, send, startReuse, showToast],
  )

  if (!loaded) return null
  return (
    <AppStateContext.Provider value={value}>
      {children}
      <Toast key={toast?.id} message={toast?.message ?? null} />
    </AppStateContext.Provider>
  )
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

export function usePendingRequest() {
  const { pendingRequest, setPendingRequest } = useAppState()
  return { pendingRequest, setPendingRequest }
}

export function useChat(mode: AssistantMode) {
  const { chats, send, startChat, ensureChat } = useAppState()
  const chat = chats[mode]
  return {
    messages: chat.messages,
    pending: chat.pending,
    chatKey: chat.key,
    send: useCallback((input: SendInput, echo?: string) => send(mode, input, echo), [send, mode]),
    start: useCallback((opts?: StartOpts) => startChat(mode, opts), [startChat, mode]),
    ensure: useCallback((opts: { key: string; route?: Route; greet?: boolean }) => ensureChat(mode, opts), [ensureChat, mode]),
  }
}

