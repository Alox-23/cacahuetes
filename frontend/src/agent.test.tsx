/*
 * Feature 5 (agente conversacional), frontend side: the app in API mode with a data module that exposes
 * `agent` (scripted per test, routes computed by the mock planner), wired exactly as App.tsx does
 * (`apiAssistantFactory`). Mock mode (no `agent`) is covered by the existing suites, unchanged.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
import { AppStateProvider, errorReply } from './state/AppState'

type AgentFn = NonNullable<DataModule['agent']>

const request: RouteRequest = {
  city: 'Marbella',
  date: '2027-01-09',
  timeWindow: { from: '10:00', to: '13:00' },
  start: { label: 'Plaza de los Naranjos' },
  mustInclude: [],
}

/** Every path the router visited (the Creando screen can be quick with short steps). */
let visited: string[] = []
function Location() {
  const { pathname } = useLocation()
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

async function setup(
  at: string | ((mock: DataModule) => Promise<string>),
  script: (mock: DataModule) => AgentFn,
  opts: { desktop?: boolean } = {},
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
      <AppStateProvider data={data} storage={storage} assistantFactory={apiAssistantFactory(agent)} assistantDelay={() => Promise.resolve()} stepMs={40}>
        {opts.desktop ? <LayoutProvider value="desktop">{routes}</LayoutProvider> : routes}
        <Location />
      </AppStateProvider>
    </MemoryRouter>,
  )
  return { agent, createRoute, mock, storage }
}

afterEach(() => {
  vi.unstubAllGlobals()
  visited = []
})

describe('agent assistant in the app (API mode, mobile)', () => {
  it('examples prefill, free text gets the model chips, a chip sends its text, a created route plays Creando then opens', async () => {
    const user = userEvent.setup()
    let created: Route | undefined
    const { agent, createRoute, storage } = await setup('/chat', (mock) => async ({ text }) => {
      if (text.startsWith('Casco antiguo')) return answered('¿Cuánto tiempo tienes?', ['Tengo 3 horas', 'Toda la mañana'])
      created = await mock.createRoute(request)
      return {
        text: 'Te he preparado una ruta de tres horas.',
        suggestions: ['Menos caminar', 'Guardar la ruta'],
        route: created,
        routeId: created.id,
        events: [{ type: 'route_created', routeId: created.id, assumptions: ['hoy', 'salida desde Plaza de los Naranjos'] }],
        source: 'agent',
      }
    })

    // The three scripted suggestions are examples now: they prefill instead of sending.
    expect(await screen.findByText(/Cuéntame tu plan con tus palabras/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Sugerencias' })).not.toBeInTheDocument()
    const examples = screen.getByRole('list', { name: 'Ejemplos' })
    await user.click(within(examples).getByRole('button', { name: 'Casco antiguo y tapas en Marbella, 5 horas' }))
    expect(screen.getByRole('textbox')).toHaveValue('Casco antiguo y tapas en Marbella, 5 horas')
    expect(location()).toBe('/chat')
    expect(agent).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox'), '{Enter}')
    await waitFor(() => expect(location()).toBe('/chat/conversation'))
    expect(await screen.findByText('¿Cuánto tiempo tienes?')).toBeInTheDocument()
    expect(agent).toHaveBeenLastCalledWith({ text: 'Casco antiguo y tapas en Marbella, 5 horas' })
    // No scripted slot questions, no summary card.
    expect(screen.queryByRole('button', { name: 'Este sábado' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Cuéntame más o pídeme un cambio')

    await user.click(screen.getByRole('button', { name: 'Tengo 3 horas' }))
    expect(agent).toHaveBeenLastCalledWith({ text: 'Tengo 3 horas' })
    // The provider never creates the route itself: the agent already did.
    expect(await screen.findByText('Cacahuete está creando tu ruta')).toBeInTheDocument()
    await waitFor(() => expect(location()).toBe(`/route/${created?.id}`), { timeout: 4000 })
    // Conversation → Creando (Peanut Run, the four steps) → the route.
    expect(visited.slice(-3)).toEqual(['/chat/conversation', '/creating', `/route/${created?.id}`])
    expect(createRoute).not.toHaveBeenCalled()
    expect(storage.read(STORAGE_KEYS.currentRoute, null)).toBe(created?.id)
    expect((await screen.findAllByText('Plaza de los Naranjos')).length).toBeGreaterThan(0)
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
    expect(within(log).getAllByText('Añade una pausa para café', { selector: 'div' }).length).toBeGreaterThan(0)
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
    expect(within(chat).getByRole('list', { name: 'Ejemplos' })).toBeInTheDocument()
    await user.type(within(chat).getByRole('textbox'), 'Tengo 3 horas y me gusta la historia{Enter}')
    expect(await within(chat).findByText('Lista tu ruta.')).toBeInTheDocument()
    expect(within(chat).getByText('Estoy creando tu ruta')).toBeInTheDocument()
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
  it('errorReply maps UNSUPPORTED_CITY to the Marbella-only text without options', () => {
    const reply = errorReply(new ApiClientError('Cacahuete prepara rutas exclusivamente por Marbella.', 'UNSUPPORTED_CITY', 400), 'guest')
    expect(reply).toEqual({ kind: 'question', text: 'Cacahuete prepara rutas exclusivamente por Marbella. ¿Quieres planear una aquí?' })
  })

  it('describeEvent covers every backend change value, with a fallback', () => {
    const values = ['add_stop', 'remove_stop', 'replace_stop', 'lock_stop', 'reschedule', 'menos_caminar', 'mas_comida', 'mas_barato', 'anadir_pausa']
    const texts = values.map((change) => describeEvent({ type: 'route_changed', routeId: 'r', change }))
    for (const text of texts) expect(text).not.toMatch(/^agent\./)
    expect(new Set(texts).size).toBe(values.length)
    expect(describeEvent({ type: 'route_changed', routeId: 'r', change: 'algo_nuevo' })).toBe('He cambiado la ruta.')
    expect(describeEvent({ type: 'undone', routeId: 'r' })).toBe('He deshecho el último cambio.')
  })

  it('maps a reply: chips are say:<text>, rules add the hint, a creation carries the route', async () => {
    const mock = createDataModule(createStorage(memoryBackend()), { latency: 0 })
    await mock.savePreferences(DEFAULT_PREFERENCES)
    const route = await mock.createRoute(request)
    const reply = toRichReply({
      text: 'Hecho.',
      suggestions: ['Menos caminar', ' ', 'Guardar la ruta', 'Otra', 'Una cuarta'],
      route,
      routeId: route.id,
      events: [{ type: 'route_created', routeId: route.id, assumptions: ['hoy', 'salida a las 11:45', '3 horas'] }],
      source: 'rules',
    })
    expect(reply.kind).toBe('change')
    expect(reply.options).toEqual([
      { label: 'Menos caminar', value: 'say:Menos caminar' },
      { label: 'Guardar la ruta', value: 'say:Guardar la ruta' },
      { label: 'Otra', value: 'say:Otra' },
    ])
    expect(reply.changes?.[0]).toMatch(new RegExp(`^Ruta creada: ${route.name}, \\d+ paradas de 10:00 a \\d\\d:\\d\\d\\. He supuesto: hoy, salida a las 11:45 y 3 horas\\.$`))
    expect(reply.display).toMatchObject({ hint: 'Modo sin IA: he respondido con reglas sencillas.', created: route, routeId: route.id })
    expect(toRichReply({ text: 'Hola', suggestions: [], events: [{ type: 'answered' }], source: 'agent' })).toEqual({ kind: 'question', text: 'Hola', options: [] })
  })

  it('assistant: say: chips, Deshacer, route id tracking, preferences, reuse and the local change greeting', async () => {
    const agent = vi.fn<AgentFn>(async () => answered('Vale.'))
    const preferencesChanged = vi.fn()
    const a = createAgentAssistant({ getPreferences: async () => null, agent, preferencesChanged })
    a.reset('change', { route: { id: 'r1' } as Route })
    expect(await a.sendMessage({})).toEqual({ kind: 'question', text: 'Aquí tienes tu ruta. Dime qué cambio quieres, por ejemplo quitar una parada, acabar antes o añadir un café.' })
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
      text: 'Quiero repetir una ruta el sábado 9 de enero de 10:00 a 13:00, saliendo desde Plaza de los Naranjos, con Mercado Municipal de Marbella.',
    })
    expect(await a.sendMessage({})).toEqual({ kind: 'question', text: 'Cuéntame tu plan con tus palabras: cuánto tiempo tienes, desde dónde sales y qué te apetece.' })
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
})
