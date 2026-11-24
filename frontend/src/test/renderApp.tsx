/* eslint-disable react-refresh/only-export-components -- test helper, not a hot-reloaded module */
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { DataModule } from '../contract/types'
import { createDataModule } from '../data/mockData'
import { createStorage, memoryBackend, type JsonStorage } from '../data/storage'
import { AppRoutes } from '../router'
import { AppStateProvider } from '../state/AppState'

function Location() {
  const loc = useLocation()
  return <output data-testid="location">{loc.pathname}</output>
}

export type RenderOptions = {
  storage?: JsonStorage
  /** Wraps the routes (e.g. a forced layout). */
  wrap?: (children: ReactNode) => ReactNode
  /** Time between creation steps (default the real 600 ms). */
  stepMs?: number
  /** Replace the data module (e.g. one without optional capabilities, like the HTTP adapter). */
  mapData?: (data: DataModule) => DataModule
}

/** Full app on a memory router and an in-memory storage, assistant without delay. */
export function renderApp(path: string, { storage = createStorage(memoryBackend()), wrap = (c) => c, stepMs, mapData = (d) => d }: RenderOptions = {}) {
  const data = mapData(createDataModule(storage, { latency: 0 }))
  const tree = (routes: ReactNode) => (
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppStateProvider data={data} storage={storage} assistantDelay={() => Promise.resolve()} stepMs={stepMs}>
        {routes}
        <Location />
      </AppStateProvider>
    </MemoryRouter>
  )
  const result = render(tree(wrap(<AppRoutes />)))
  return {
    data,
    storage,
    ...result,
    /** Re-render the same tree with another wrapper (state is kept). */
    rewrap: (next: (children: ReactNode) => ReactNode) => result.rerender(tree(next(<AppRoutes />))),
  }
}

export const currentPath = () => screen.getByTestId('location').textContent
