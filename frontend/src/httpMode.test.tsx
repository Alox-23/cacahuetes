/*
 * The desktop shell on the HTTP data path (VITE_CACAHUETE_API_URL set): the real createHttpDataModule and the
 * assistant wiring of App.tsx, against a stubbed fetch that plays a minimal Cacahuete API. No backend runs here;
 * this checks the frontend side of the seam (requests, capabilities, panel refresh after a chat change).
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssistant } from './assistant/mockAssistant'
import type { AssistantDeps } from './assistant/types'
import type { Route } from './contract/types'
import { DEFAULT_PREFERENCES } from './data/defaults'
import { createHttpDataModule } from './data/httpData'
import { createDataModule } from './data/mockData'
import { createStorage, memoryBackend } from './data/storage'
import { LayoutProvider } from './lib/useLayout'
import { AppRoutes } from './router'
import { AppStateProvider } from './state/AppState'

function memoryLocalStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('desktop on the HTTP data module (stubbed API)', () => {
  it('shows the route panel without reorder controls and refreshes it after a change made by chat', async () => {
    // Realistic route objects from the mock, served by the fake API.
    const mock = createDataModule(createStorage(memoryBackend()), { latency: 0 })
    await mock.savePreferences(DEFAULT_PREFERENCES)
    let route: Route = await mock.createRoute({
      city: 'Marbella',
      date: '2027-01-09',
      timeWindow: { from: '10:00', to: '15:00' },
      start: { label: 'Plaza de los Naranjos' },
      mustInclude: ['Plaza de los Naranjos'],
    })
    const calls: string[] = []
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input))
        const action = url.searchParams.get('action') ?? ''
        calls.push(action)
        switch (action) {
          case 'status':
            return json({ account: null })
          case 'getPreferences':
            return json(DEFAULT_PREFERENCES)
          case 'getRoute':
            return json(route)
          case 'getPlace':
            return json(await mock.getPlace(url.searchParams.get('id') ?? ''))
          case 'refineConversation': {
            const { changes } = JSON.parse(String(init?.body)) as { changes: string[] }
            const steps: Route[] = []
            for (const value of changes) {
              route = await mock.refineRoute(route.id, { type: 'quick', value: value as 'anadir_pausa' })
              steps.push(route)
            }
            return json(steps)
          }
          default:
            return new Response(JSON.stringify({ error: { message: `no stub for ${action}` } }), { status: 500 })
        }
      }),
    )

    const data = createHttpDataModule('http://api.test/api/cacahuete', memoryLocalStorage())
    // Same wiring as App.tsx in API mode.
    const assistantFactory = (deps: AssistantDeps) =>
      createAssistant({ ...deps, interpretRequest: data.interpretRequest, refineConversation: data.refineConversation, delay: () => Promise.resolve() })

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[`/route/${route.id}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppStateProvider data={data} storage={createStorage(memoryBackend())} assistantFactory={assistantFactory}>
          <LayoutProvider value="desktop">
            <AppRoutes />
          </LayoutProvider>
        </AppStateProvider>
      </MemoryRouter>,
    )

    const region = await screen.findByRole('region', { name: 'Ruta' })
    const list = await within(region).findByRole('list', { name: 'Paradas' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(route.stops.length)
    // No move_stop endpoint yet: the reorder controls are hidden in API mode.
    expect(within(list).queryByRole('button', { name: /^Subir / })).not.toBeInTheDocument()

    const chat = screen.getByRole('region', { name: 'Chat con el asistente' })
    await within(chat).findByText(/¿Qué quieres cambiar de la ruta\?/)
    const before = within(list).getAllByRole('listitem').length
    await user.type(within(chat).getByRole('textbox'), 'Añade una pausa{Enter}')
    expect(await within(chat).findByText('Hecho. He cambiado una cosa:')).toBeInTheDocument()
    // The change went through refineConversation (not the provider's refineRoute); the panel still refreshes.
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(before + 1))
    expect(within(list).getByText('Pausa para café')).toBeInTheDocument()
    expect(calls).toContain('refineConversation')
    expect(calls).not.toContain('refineRoute')
  })
})
