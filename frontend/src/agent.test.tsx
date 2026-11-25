/*
 * Feature 5 (agente conversacional), frontend side: the app in API mode with a data module that exposes
 * `agent` (scripted per test, routes computed by the mock planner), wired exactly as App.tsx does
 * (`apiAssistantFactory`). Mock mode (no `agent`) is covered by the existing suites, unchanged.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentAssistant, toRichReply } from './assistant/agentAssistant'
import { describeEvent } from './assistant/agentFormat'
import { apiAssistantFactory } from './assistant/factory'
import type { AgentReply, DataModule, Route, RouteRequest } from './contract/types'
import { DEFAULT_PREFERENCES } from './data/defaults'
import { ApiClientError } from './data/errors'
import { createHttpDataModule } from './data/httpData'
import { createDataModule } from './data/mockData'
import { STORAGE_KEYS, createStorage, memoryBackend } from './data/storage'
import { LayoutProvider } from './lib/useLayout'
import { AppRoutes } from './router'
import { AppStateProvider, errorReply, reuseRequest } from './state/AppState'

type AgentFn = NonNullable<DataModule['agent']>

const request: RouteRequest = {
  city: 'Marbella',
  date: '2027-01-09',
  timeWindow: { from: '10:00', to: '13:00' },
  start: { label: 'Plaza de los Naranjos' },
  mustInclude: [],
}

const GREETING = 'Aquí tienes tu ruta. Dime qué cambio quieres, por ejemplo quitar una parada, acabar antes o añadir un café.'

/**
 * Steps long enough for the hand-over to commit: router navigations are transitions, and with very short
 * steps a loaded machine can finish the creation before /creating ever renders (the route still opens).
 */
const HANDOVER_STEP_MS = 250

/** Every path the router visited (the Creando screen can be quick with short steps). */
let visited: string[] = []
/** The router's navigate, for the browser's Back (`navigate(-1)`). */
let nav: NavigateFunction | null = null
function Location() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    nav = navigate
  }, [navigate])
  useEffect(() => {
    if (visited[visited.length - 1] !== pathname) visited.push(pathname)
  }, [pathname])
  return <output data-testid="location">{pathname}</output>
}
const location = () => screen.getByTestId('location').textContent

const answered = (text: string, suggestions: string[] = [], source: AgentReply['source'] = 'agent'): AgentReply => ({
  text,
  suggestions,
  events: [{ type: 'answered' }],
  source,
})

const createdReply = (route: Route, text: string, suggestions: string[] = []): AgentReply => ({
  text,
  suggestions,
  route,
  routeId: route.id,
  events: [{ type: 'route_created', routeId: route.id, assumptions: ['hoy'] }],
  source: 'agent',
})

/** A promise the test settles by hand (a turn still in flight). */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function setup(
  at: string | ((mock: DataModule) => Promise<string>),
  script: (mock: DataModule) => AgentFn,
  opts: { desktop?: boolean; stepMs?: number } = {},
) {
  const storage = createStorage(memoryBackend())
  storage.write(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES)
  const mock = createDataModule(storage, { latency: 0 })
  const path = typeof at === 'string' ? at : await at(mock)
  const agent = vi.fn(script(mock))
  const createRoute = vi.fn(mock.createRoute)
  const data: DataModule = { ...mock, createRoute, agent }
  const routes = <AppRoutes />
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppStateProvider
        data={data}
        storage={storage}
        assistantFactory={apiAssistantFactory(agent)}
        assistantDelay={() => Promise.resolve()}
        stepMs={opts.stepMs ?? 40}
      >
        {opts.desktop ? <LayoutProvider value="desktop">{routes}</LayoutProvider> : routes}
        <Location />
      </AppStateProvider>
    </MemoryRouter>,
  )
  return { agent, createRoute, mock, storage }
}

/** The text of the newest user bubble (without its visually hidden "Tú:"). */
const lastUserBubble = () => screen.getAllByTestId('user-bubble').at(-1)?.textContent?.replace(/^Tú:\s*/, '')

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  visited = []
  nav = null
})

describe('agent assistant in the app (API mode, mobile)', () => {
  it('examples prefill, free text gets the model chips, a chip sends its text, a created route plays Creando then opens', async () => {
    const user = userEvent.setup()
    let created: Route | undefined
    const { agent, createRoute, storage } = await setup('/chat', (mock) => async ({ text }) => {
      if (text.startsWith('Casco antiguo')) return answered('¿Cuánto tiempo tienes?', ['Tengo 3 horas', 'Toda la mañana'])
      if (text !== 'Tengo 3 horas') return answered('Vale.')
      created = await mock.createRoute(request)
      return {
        text: 'Te he preparado una ruta de tres horas.',
        suggestions: ['Menos caminar', 'Acabar media hora antes'],
        route: created,
        routeId: created.id,
        events: [{ type: 'route_created', routeId: created.id, assumptions: ['hoy', 'salida desde Plaza de los Naranjos'] }],
        source: 'agent',
      }
    }, { stepMs: HANDOVER_STEP_MS })

    // The three scripted suggestions are examples now: they prefill instead of sending.
    expect(await screen.findByText(/Cuéntame tu plan con tus palabras/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Sugerencias' })).not.toBeInTheDocument()
    const examples = screen.getByRole('list', { name: 'Ejemplos' })
    expect(examples).toHaveAccessibleDescription('Al pulsar un ejemplo se copia en el cuadro de texto para que lo edites.')
    await user.click(within(examples).getByRole('button', { name: 'Casco antiguo y tapas en Marbella, 5 horas' }))
    expect(screen.getByRole('textbox')).toHaveValue('Casco antiguo y tapas en Marbella, 5 horas')
    expect(location()).toBe('/chat')
    expect(agent).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox'), '{Enter}')
    await waitFor(() => expect(location()).toBe('/chat/conversation'))
    expect(await screen.findByText('¿Cuánto tiempo tienes?')).toBeInTheDocument()
    expect(agent).toHaveBeenLastCalledWith({ text: 'Casco antiguo y tapas en Marbella, 5 horas' })
    // No scripted slot questions, no summary card; the agent's own note.
    expect(screen.queryByRole('button', { name: 'Este sábado' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Cuéntame más o pídeme un cambio')
    expect(screen.getByText('Cacahuete decide los cambios con lo que le cuentas; puedes corregirle en la siguiente frase.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tengo 3 horas' }))
    expect(agent).toHaveBeenLastCalledWith({ text: 'Tengo 3 horas' })
    // Conversation → Creando (chase animation, the four steps) → the route. The Creando screen can be gone before
    // a query sees it (short steps), so the visited paths are the evidence.
    await waitFor(() => expect(location()).toBe(`/route/${created?.id}`), { timeout: 6000 })
    expect(visited.slice(-3)).toEqual(['/chat/conversation', '/creating', `/route/${created?.id}`])
    // The provider never creates the route itself: the agent already did.
    expect(createRoute).not.toHaveBeenCalled()
    expect(storage.read(STORAGE_KEYS.currentRoute, null)).toBe(created?.id)
    expect((await screen.findAllByText('Plaza de los Naranjos')).length).toBeGreaterThan(0)

    // The creation turn's chips come back in the change greeting, which is still local.
    const calls = agent.mock.calls.length
    await user.click(screen.getByRole('link', { name: /Pide un cambio al asistente/ }))
    await waitFor(() => expect(location()).toBe(`/route/${created?.id}/change`))
    const log = await screen.findByRole('log')
    expect(await within(log).findByText(GREETING)).toBeInTheDocument()
    expect(agent).toHaveBeenCalledTimes(calls)
    expect(within(log).getAllByRole('button').map((b) => b.textContent)).toEqual(['Menos caminar', 'Acabar media hora antes'])
    await user.click(within(log).getByRole('button', { name: 'Acabar media hora antes' }))
    await waitFor(() => expect(agent).toHaveBeenLastCalledWith({ text: 'Acabar media hora antes', routeId: created?.id }))
  })

  it('a route the agent created cannot be cancelled on Creando, and Back does not reopen it', async () => {
    const user = userEvent.setup()
    let created: Route | undefined
    const { storage } = await setup(
      '/chat',
      (mock) => async () => {
        created = await mock.createRoute(request)
        return createdReply(created, 'Ruta lista.')
      },
      // Long steps: the creation is still running while the test looks at it.
      { stepMs: 10_000 },
    )
    await user.type(await screen.findByRole('textbox'), 'Tengo 3 horas{Enter}')
    await waitFor(() => expect(location()).toBe('/creating'))
    expect(await screen.findByRole('heading', { name: 'Cacahuete está creando tu ruta' })).toBeInTheDocument()
    // The route already exists: no Cancel, and a reload now would find it as the current route.
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    expect(storage.read(STORAGE_KEYS.currentRoute, null)).toBe(created?.id)

    // Browser Back during the steps returns to the conversation and stays there.
    act(() => {
      nav?.(-1)
    })
    await waitFor(() => expect(location()).toBe('/chat/conversation'))
    expect(await screen.findByText('Ruta lista.')).toBeInTheDocument()
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)))
    expect(location()).toBe('/chat/conversation')
    expect(visited.filter((p) => p === '/creating')).toHaveLength(1)
  })

  it('change mode: local greeting without chips, then the change bullets, the model chips and the rules hint', async () => {
    const user = userEvent.setup()
    const { agent } = await setup(
      async (mock) => `/route/${(await mock.createRoute(request)).id}/change`,
      (mock) => async ({ text, routeId }) => {
        if (!routeId) throw new Error('no route')
        const undo = text === 'Deshacer'
        const after = undo ? await mock.undo(routeId) : await mock.refineRoute(routeId, { type: 'remove_stop', order: 2 })
        return {
          text: undo ? 'Vuelve a estar como antes.' : 'He quitado la segunda parada.',
          suggestions: ['Añade una pausa para café'],
          route: after,
          routeId,
          events: [undo ? { type: 'undone', routeId } : { type: 'route_changed', routeId, change: 'remove_stop' }],
          source: 'rules',
        }
      },
    )
    const log = await screen.findByRole('log')
    expect(await within(log).findByText(/^Aquí tienes tu ruta\. Dime qué cambio quieres/)).toBeInTheDocument()
    // No quick:* chips in API mode, and the greeting is local (no agent call).
    expect(within(log).queryByRole('button')).not.toBeInTheDocument()
    expect(agent).not.toHaveBeenCalled()

    const id = location()?.split('/')[2]
    await user.type(screen.getByRole('textbox'), 'Quita la segunda parada{Enter}')
    expect(await within(log).findByText('He quitado la segunda parada.')).toBeInTheDocument()
    expect(agent).toHaveBeenLastCalledWith({ text: 'Quita la segunda parada', routeId: id })
    expect(within(log).getByText('He quitado una parada.')).toBeInTheDocument()
    expect(within(log).getByText(/^La ruta termina ahora a las \d\d:\d\d\.$/)).toBeInTheDocument()
    expect(within(log).getByText('Modo sin IA: he respondido con reglas sencillas.')).toBeInTheDocument()
    expect(within(log).getByRole('link', { name: 'Ver ruta actualizada' })).toHaveAttribute('href', `/route/${id}`)

    // "Deshacer" under the change is sent to the agent as text.
    await user.click(within(log).getByRole('button', { name: 'Deshacer' }))
    expect(await within(log).findByText('Vuelve a estar como antes.')).toBeInTheDocument()
    expect(agent).toHaveBeenLastCalledWith({ text: 'Deshacer', routeId: id })

    // A model chip sends its text; the echo is the chip label.
    await user.click(within(log).getAllByRole('button', { name: 'Añade una pausa para café' }).at(-1) as HTMLElement)
    await waitFor(() => expect(agent).toHaveBeenLastCalledWith({ text: 'Añade una pausa para café', routeId: id }))
    expect(lastUserBubble()).toBe('Añade una pausa para café')
  })

  it('change mode: "hazme otra ruta" plays Creando and opens the new route', async () => {
    const user = userEvent.setup()
    let first = ''
    let created: Route | undefined
    const { agent, storage } = await setup(
      async (mock) => {
        first = (await mock.createRoute(request)).id
        return `/route/${first}/change`
      },
      (mock) => async () => {
        created = await mock.createRoute({ ...request, timeWindow: { from: '16:00', to: '19:00' } })
        return createdReply(created, 'Otra ruta lista para la tarde.')
      },
      { stepMs: HANDOVER_STEP_MS },
    )
    const log = await screen.findByRole('log')
    expect(await within(log).findByText(GREETING)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox'), 'Hazme otra ruta por la tarde{Enter}')
    expect(agent).toHaveBeenLastCalledWith({ text: 'Hazme otra ruta por la tarde', routeId: first })
    await waitFor(() => expect(location()).toBe(`/route/${created?.id}`), { timeout: 6000 })
    expect(created?.id).not.toBe(first)
    expect(visited).toEqual([`/route/${first}/change`, '/creating', `/route/${created?.id}`])
    expect(storage.read(STORAGE_KEYS.currentRoute, null)).toBe(created?.id)
  })

  it('preferences changed by the agent show up in the /chat chips', async () => {
    const user = userEvent.setup()
    await setup('/chat', (mock) => async () => {
      // The server stored the new budget during the turn.
      await mock.savePreferences({ ...DEFAULT_PREFERENCES, budget: 'alto' })
      return { text: 'Apuntado: presupuesto alto.', suggestions: [], events: [{ type: 'preferences_updated', fields: ['budget'] }], source: 'agent' }
    })
    expect(await screen.findByText('Presupuesto medio')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox'), 'Prefiero sitios caros{Enter}')
    expect(await screen.findByText('Apuntado: presupuesto alto.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Volver' }))
    await waitFor(() => expect(location()).toBe('/chat'))
    expect(await screen.findByText('Presupuesto alto')).toBeInTheDocument()
    expect(screen.queryByText('Presupuesto medio')).not.toBeInTheDocument()
  })

  it('"Reutilizar" sends the stored request to the agent as the first message', async () => {
    const user = userEvent.setup()
    let saved: Route | undefined
    const { agent } = await setup(
      async (mock) => {
        await mock.login('eva@correo.com', 'secreto123')
        saved = (await mock.listRoutes())[0]
        return `/my-routes/${saved.id}`
      },
      () => async () => answered('Vale, la preparo igual.'),
    )
    await user.click(await screen.findByRole('button', { name: 'Reutilizar' }))
    await waitFor(() => expect(location()).toBe('/chat/conversation'))
    expect(await screen.findByText('Vale, la preparo igual.')).toBeInTheDocument()
    expect(lastUserBubble()).toBe(`Quiero repetir «${saved?.name}»`)
    expect(agent).toHaveBeenCalledTimes(1)
    const [input] = agent.mock.calls[0]
    // A new request conversation: no route id; the date travels in words and as ISO.
    expect(Object.keys(input)).toEqual(['text'])
    const reused = reuseRequest(saved?.request as RouteRequest)
    expect(input.text).toMatch(/^Quiero repetir una ruta el .+ \(\d{4}-\d{2}-\d{2}\) de \d\d:\d\d a \d\d:\d\d, saliendo desde /)
    expect(input.text).toContain(`(${reused.date}) de ${reused.timeWindow.from} a ${reused.timeWindow.to}, saliendo desde ${reused.start.label}`)
  })

  it('another city: the server refusal becomes the Marbella-only reply, without options', async () => {
    const user = userEvent.setup()
    await setup('/chat', () => async () => {
      throw new ApiClientError('Cacahuete prepara rutas exclusivamente por Marbella.', 'UNSUPPORTED_CITY', 400)
    })
    await user.type(await screen.findByRole('textbox'), 'Una ruta por Málaga{Enter}')
    const log = await screen.findByRole('log')
    expect(await within(log).findByText('Cacahuete prepara rutas exclusivamente por Marbella. ¿Quieres planear una aquí?')).toBeInTheDocument()
    expect(within(log).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('agent assistant in the app (API mode, desktop)', () => {
  it('a route created by the agent shows the progress item in the dock and then the route panel', async () => {
    const user = userEvent.setup()
    let created: Route | undefined
    const { createRoute } = await setup(
      '/chat',
      (mock) => async () => {
        created = await mock.createRoute(request)
        return {
          text: 'Lista tu ruta.',
          suggestions: ['Menos caminar'],
          route: created,
          routeId: created.id,
          events: [{ type: 'route_created', routeId: created.id, assumptions: ['hoy'] }],
          source: 'agent',
        }
      },
      { desktop: true },
    )
    const chat = await screen.findByRole('region', { name: 'Chat con el asistente' })
    const examples = within(chat).getByRole('list', { name: 'Ejemplos' })
    expect(examples).toHaveAccessibleDescription('Al pulsar un ejemplo se copia en el cuadro de texto para que lo edites.')
    await user.type(within(chat).getByRole('textbox'), 'Tengo 3 horas y me gusta la historia{Enter}')
    expect(await within(chat).findByText('Lista tu ruta.')).toBeInTheDocument()
    expect(within(chat).getByText('Estoy creando tu ruta')).toBeInTheDocument()
    // A creation bubble has nothing to undo.
    expect(within(chat).queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument()
    const region = await screen.findByRole('region', { name: 'Ruta' }, { timeout: 4000 })
    await waitFor(() => expect(location()).toBe(`/route/${created?.id}`))
    expect(await within(region).findByRole('list', { name: 'Paradas' })).toBeInTheDocument()
    expect(createRoute).not.toHaveBeenCalled()
    expect(await within(chat).findByText(/La tienes a la derecha\./)).toBeInTheDocument()
  })
})

describe('mock mode (no agent)', () => {
  it('keeps the scripted suggestions that send at once', async () => {
    const user = userEvent.setup()
    const storage = createStorage(memoryBackend())
    storage.write(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES)
    render(
      <MemoryRouter initialEntries={['/chat']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppStateProvider data={createDataModule(storage, { latency: 0 })} storage={storage} assistantDelay={() => Promise.resolve()}>
          <AppRoutes />
          <Location />
        </AppStateProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('list', { name: 'Ejemplos' })).not.toBeInTheDocument()
    await user.click(within(await screen.findByRole('list', { name: 'Sugerencias' })).getByRole('button', { name: 'Casco antiguo y tapas en Marbella, 5 horas' }))
    await waitFor(() => expect(location()).toBe('/chat/conversation'))
    expect(await screen.findByRole('button', { name: 'Este sábado' })).toBeInTheDocument()
  })
})

describe('agent pieces', () => {
  it('errorReply maps UNSUPPORTED_CITY by mode and ROUTE_NOT_FOUND to "route gone", without options', () => {
    const city = new ApiClientError('Cacahuete prepara rutas exclusivamente por Marbella.', 'UNSUPPORTED_CITY', 400)
    expect(errorReply(city, 'guest')).toEqual({ kind: 'question', text: 'Cacahuete prepara rutas exclusivamente por Marbella. ¿Quieres planear una aquí?' })
    expect(errorReply(city, 'guest', 'change')).toEqual({ kind: 'question', text: 'Esta ruta recorre Marbella. ¿Qué parada de Marbella quieres cambiar?' })
    expect(errorReply(new ApiClientError('Ruta no encontrada', 'ROUTE_NOT_FOUND', 404), 'account', 'change')).toEqual({
      kind: 'question',
      text: 'Esa ruta ya no está disponible. Pídeme otra cuando quieras.',
    })
  })

  it('describeEvent covers every backend change value, with a fallback; assumptions only on the rules path', async () => {
    const values = ['add_stop', 'remove_stop', 'replace_stop', 'lock_stop', 'reschedule', 'menos_caminar', 'mas_comida', 'mas_barato', 'anadir_pausa']
    const texts = values.map((change) => describeEvent({ type: 'route_changed', routeId: 'r', change }))
    for (const text of texts) expect(text).not.toMatch(/^agent\./)
    expect(new Set(texts).size).toBe(values.length)
    expect(describeEvent({ type: 'route_changed', routeId: 'r', change: 'algo_nuevo' })).toBe('He cambiado la ruta.')
    expect(describeEvent({ type: 'undone', routeId: 'r' })).toBe('He deshecho el último cambio.')

    const createdEvent = { type: 'route_created' as const, routeId: 'r', assumptions: ['hoy'] }
    // Without the route the bullet still says a route was created.
    expect(describeEvent(createdEvent)).toBe('He creado una ruta nueva.')
    expect(describeEvent(createdEvent, undefined, 'rules')).toBe('He creado una ruta nueva. He supuesto: hoy.')
    const mock = createDataModule(createStorage(memoryBackend()), { latency: 0 })
    await mock.savePreferences(DEFAULT_PREFERENCES)
    const route = await mock.createRoute(request)
    // With the model, the narrator already states the assumptions in the reply text.
    expect(describeEvent({ ...createdEvent, routeId: route.id }, route, 'agent')).toMatch(/^Ruta creada: [^.]+\.$/)
  })

  it('maps a reply: chips are say:<text> (trimmed, unique), rules add the hint, a creation carries the route', async () => {
    const mock = createDataModule(createStorage(memoryBackend()), { latency: 0 })
    await mock.savePreferences(DEFAULT_PREFERENCES)
    const route = await mock.createRoute(request)
    const reply = toRichReply({
      text: 'Hecho.',
      suggestions: ['Menos caminar', ' ', ' Menos caminar ', 'Acabar media hora antes', 'Otra', 'Una cuarta'],
      route,
      routeId: route.id,
      events: [{ type: 'route_created', routeId: route.id, assumptions: ['hoy', 'salida a las 11:45', '3 horas'] }],
      source: 'rules',
    })
    expect(reply.kind).toBe('change')
    expect(reply.options).toEqual([
      { label: 'Menos caminar', value: 'say:Menos caminar' },
      { label: 'Acabar media hora antes', value: 'say:Acabar media hora antes' },
      { label: 'Otra', value: 'say:Otra' },
    ])
    expect(reply.changes?.[0]).toMatch(new RegExp(`^Ruta creada: ${route.name}, \\d+ paradas de 10:00 a \\d\\d:\\d\\d\\. He supuesto: hoy, salida a las 11:45 y 3 horas\\.$`))
    // The thread keeps only the id; the route rides on the turn for the Creando hand-over. No "ends now at".
    expect(reply.display).toEqual({ hint: 'Modo sin IA: he respondido con reglas sencillas.', createdRouteId: route.id, routeId: route.id })
    expect(reply.createdRoute).toBe(route)
    expect(toRichReply({ text: 'Hola', suggestions: [], events: [{ type: 'answered' }], source: 'agent' })).toEqual({ kind: 'question', text: 'Hola', options: [] })
  })

  it('assistant: say: chips, Deshacer, route id tracking, preferences, reuse and the local change greeting', async () => {
    const agent = vi.fn<AgentFn>(async () => answered('Vale.'))
    const preferencesChanged = vi.fn()
    const a = createAgentAssistant({ getPreferences: async () => null, agent, preferencesChanged })
    a.reset('change', { route: { id: 'r1' } as Route })
    expect(await a.sendMessage({})).toEqual({ kind: 'question', text: GREETING })
    expect(agent).not.toHaveBeenCalled()
    await a.sendMessage({ option: 'say:Acaba a las 14:00' })
    expect(agent).toHaveBeenLastCalledWith({ text: 'Acaba a las 14:00', routeId: 'r1' })
    await a.sendMessage({ option: 'undo' })
    expect(agent).toHaveBeenLastCalledWith({ text: 'Deshacer', routeId: 'r1' })

    agent.mockResolvedValueOnce({ text: 'Nueva.', suggestions: [], routeId: 'r2', events: [{ type: 'route_created', routeId: 'r2', assumptions: [] }], source: 'agent' })
    await a.sendMessage({ text: 'Hazme otra ruta' })
    await a.sendMessage({ text: 'Quita el museo' })
    expect(agent).toHaveBeenLastCalledWith({ text: 'Quita el museo', routeId: 'r2' })

    agent.mockResolvedValueOnce({ text: 'Apuntado.', suggestions: [], events: [{ type: 'preferences_updated', fields: ['budget'] }], source: 'agent' })
    expect((await a.sendMessage({ text: 'Prefiero algo barato' })).kind).toBe('question')
    expect(preferencesChanged).toHaveBeenCalledTimes(1)

    // Request mode starts without a route; "Reutilizar" sends the stored request as the first message.
    a.reset('request', { request: { ...request, mustInclude: ['Plaza de los Naranjos', 'Mercado Municipal de Marbella'] } })
    await a.sendMessage({})
    expect(agent).toHaveBeenLastCalledWith({
      text: 'Quiero repetir una ruta el sábado 9 de enero (2027-01-09) de 10:00 a 13:00, saliendo desde Plaza de los Naranjos, con Mercado Municipal de Marbella.',
    })
    expect(await a.sendMessage({})).toEqual({ kind: 'question', text: 'Cuéntame tu plan con tus palabras: cuánto tiempo tienes, desde dónde sales y qué te apetece.' })

    // Per-route overrides are spelled out after the request.
    a.reset('request', {
      request: { ...request, overrides: { interests: ['historia', 'gastronomia'], pace: 'relajado', budget: 'bajo', company: 'pareja' } },
    })
    await a.sendMessage({})
    expect(agent).toHaveBeenLastCalledWith({
      text:
        'Quiero repetir una ruta el sábado 9 de enero (2027-01-09) de 10:00 a 13:00, saliendo desde Plaza de los Naranjos. ' +
        'Para esta ruta: intereses historia y gastronomía, ritmo relajado, presupuesto bajo, voy en pareja.',
    })
  })

  it('assistant: a reply that lands after reset() does not touch the new conversation', async () => {
    const pending = deferred<AgentReply>()
    const agent = vi.fn<AgentFn>(async () => answered('Vale.'))
    const getRoute = vi.fn(async (id: string) => ({ id }) as Route)
    const a = createAgentAssistant({ getPreferences: async () => null, agent, getRoute })
    a.reset('change', { route: { id: 'r1' } as Route })
    agent.mockReturnValueOnce(pending.promise)
    const late = a.sendMessage({ text: 'Hazme otra ruta' })
    expect(agent).toHaveBeenLastCalledWith({ text: 'Hazme otra ruta', routeId: 'r1' })

    // The visitor starts a new request while that turn is still in flight.
    a.reset('request')
    pending.resolve({ text: 'Nueva.', suggestions: [], routeId: 'r2', events: [{ type: 'route_created', routeId: 'r2', assumptions: [] }], source: 'agent' })
    await late
    expect(a.getState().routeId).toBeUndefined()
    expect(getRoute).not.toHaveBeenCalled()
    await a.sendMessage({ text: 'Tengo 3 horas' })
    expect(agent).toHaveBeenLastCalledWith({ text: 'Tengo 3 horas' })
  })

  it('assistant: ROUTE_NOT_FOUND forgets the route and is rethrown for errorReply', async () => {
    const gone = new ApiClientError('Ruta no encontrada', 'ROUTE_NOT_FOUND', 404)
    const agent = vi.fn<AgentFn>(async () => answered('Vale.'))
    const a = createAgentAssistant({ getPreferences: async () => null, agent })
    a.reset('change', { route: { id: 'r1' } as Route })
    agent.mockRejectedValueOnce(gone)
    await expect(a.sendMessage({ text: 'Quita el museo' })).rejects.toBe(gone)
    expect(a.getState().routeId).toBeUndefined()
    await a.sendMessage({ text: 'Hazme una ruta nueva' })
    expect(agent).toHaveBeenLastCalledWith({ text: 'Hazme una ruta nueva' })

    // A late ROUTE_NOT_FOUND from before a reset leaves the new route alone.
    const pending = deferred<AgentReply>()
    agent.mockReturnValueOnce(pending.promise)
    const late = a.sendMessage({ text: 'Quita el museo' })
    a.reset('change', { route: { id: 'r3' } as Route })
    pending.reject(gone)
    await expect(late).rejects.toBe(gone)
    expect(a.getState().routeId).toBe('r3')
  })

  it('assistant: the change greeting offers the creation turn chips, and no options without them', async () => {
    const agent = vi.fn<AgentFn>(async () => answered('Vale.'))
    const a = createAgentAssistant({ getPreferences: async () => null, agent })
    a.reset('change', { route: { id: 'r1' } as Route, suggestions: [' Menos caminar ', 'Menos caminar', 'Acabar media hora antes'] })
    expect(await a.sendMessage({})).toEqual({
      kind: 'question',
      text: GREETING,
      options: [
        { label: 'Menos caminar', value: 'say:Menos caminar' },
        { label: 'Acabar media hora antes', value: 'say:Acabar media hora antes' },
      ],
    })
    a.reset('change', { route: { id: 'r1' } as Route })
    expect(await a.sendMessage({})).toEqual({ kind: 'question', text: GREETING })
    expect(agent).not.toHaveBeenCalled()
  })

  it('httpData.agent posts text, routeId and the local clock, and returns the contract fields only', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        expect(new URL(String(input)).searchParams.get('action')).toBe('agent')
        bodies.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({
          text: 'Hola', suggestions: ['Uno'], events: [{ type: 'answered' }], source: 'rules',
          quota: { plan: 'guest', remainingSeconds: 100, expiresAt: null },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }),
    )
    const values = new Map<string, string>()
    const data = createHttpDataModule('http://api.test/api/cacahuete', {
      getItem: (k) => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v), removeItem: (k) => void values.delete(k),
    })
    expect(await data.agent({ text: 'Hola', routeId: 'abc' })).toEqual({ text: 'Hola', suggestions: ['Uno'], events: [{ type: 'answered' }], source: 'rules' })
    expect(bodies[0]).toMatchObject({ text: 'Hola', routeId: 'abc', client: { today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), now: expect.stringMatching(/^\d{2}:\d{2}$/) } })
  })

  it('httpData.agent sends the visitor wall clock, zero padded', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 0, 7))
    const bodies: Array<{ client?: unknown }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: URL | string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)))
        // A reply without text still yields a string.
        return new Response(JSON.stringify({ suggestions: [], events: [{ type: 'answered' }], source: 'agent' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
    const values = new Map<string, string>()
    const data = createHttpDataModule('http://api.test/api/cacahuete', {
      getItem: (k) => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v), removeItem: (k) => void values.delete(k),
    })
    expect((await data.agent({ text: 'Hola' })).text).toBe('')
    expect(bodies[0].client).toEqual({ today: '2026-01-05', now: '00:07' })
  })

  it('httpData.agent keeps the local favourite on the route and forgets ratings of changed routes', async () => {
    const endpoint = 'http://api.test/api/cacahuete'
    const prefix = 'rt.api.' + new URL(endpoint).href
    const mock = createDataModule(createStorage(memoryBackend()), { latency: 0 })
    await mock.savePreferences(DEFAULT_PREFERENCES)
    const route = { ...(await mock.createRoute(request)), id: 'r1', favorite: false }
    const values = new Map<string, string>([
      [prefix + '.favorites', JSON.stringify({ r1: true })],
      [prefix + '.ratings', JSON.stringify({ r1: { stars: 4, stops: {} }, r2: { stars: 5, stops: {} } })],
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({
          text: 'He quitado una parada.',
          suggestions: [],
          route,
          routeId: 'r1',
          events: [{ type: 'route_changed', routeId: 'r1', change: 'remove_stop' }],
          source: 'agent',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ),
    )
    const data = createHttpDataModule(endpoint, {
      getItem: (k) => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v), removeItem: (k) => void values.delete(k),
    })
    const reply = await data.agent({ text: 'Quita una parada', routeId: 'r1' })
    expect(reply.route?.favorite).toBe(true)
    expect(await data.getRating('r1')).toBeNull()
    expect(await data.getRating('r2')).toEqual({ stars: 5, stops: {} })
  })
})
