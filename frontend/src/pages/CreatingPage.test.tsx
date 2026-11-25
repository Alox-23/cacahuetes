import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteRequest } from '../contract/types'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { createDataModule } from '../data/mockData'
import { createStorage, memoryBackend } from '../data/storage'
import { AppStateProvider, usePendingRequest } from '../state/AppState'
import { CreatingPage, STEP_MS } from './CreatingPage'

const request: RouteRequest = {
  city: 'Marbella',
  date: '2027-01-09',
  timeWindow: { from: '10:00', to: '15:00' },
  start: { label: 'Plaza de los Naranjos' },
  mustInclude: [],
}

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function WithPendingRequest({ children }: { children: ReactNode }) {
  const { pendingRequest, setPendingRequest } = usePendingRequest()
  useEffect(() => setPendingRequest(request), [setPendingRequest])
  return pendingRequest ? children : null
}

function renderCreating({ fail = false } = {}) {
  const storage = createStorage(memoryBackend())
  storage.write('rt.preferences', DEFAULT_PREFERENCES)
  const data = createDataModule(storage, { latency: 0 })
  if (fail) vi.spyOn(data, 'createRoute').mockRejectedValue(new Error('offline'))
  const { container } = render(
    <MemoryRouter initialEntries={['/creating']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppStateProvider data={data} storage={storage} assistantDelay={() => Promise.resolve()}>
        <WithPendingRequest>
          <Routes>
            <Route path="/creating" element={<CreatingPage />} />
            <Route path="/route/:id" element={<p>route screen</p>} />
            <Route path="/chat/conversation" element={<p>conversation</p>} />
          </Routes>
          <Location />
        </WithPendingRequest>
      </AppStateProvider>
    </MemoryRouter>,
  )
  return container
}

const location = () => screen.getByTestId('location').textContent
async function finishSteps() {
  // One act per step: each step's timer is scheduled by an effect after the previous render.
  for (let i = 0; i < 5; i += 1) await act(() => vi.advanceTimersByTimeAsync(STEP_MS))
}

describe('Creating screen with the chase animation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the title, the steps, a decorative animation and Cancel', async () => {
    const container = renderCreating()
    expect(await screen.findByRole('heading', { name: 'Cacahuete está creando tu ruta' })).toBeInTheDocument()
    expect(screen.getByText('Lugares seleccionados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    // The title mascot is an <svg> too: the animation is the one with a viewBox wider than tall.
    const animation = container.querySelector('svg[viewBox="0 0 320 120"]')
    expect(animation).not.toBeNull()
    expect(animation).toHaveAttribute('aria-hidden', 'true')
    expect(animation).toHaveAttribute('focusable', 'false')
    expect(animation?.querySelector('button, a, [tabindex], canvas')).toBeNull()
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('goes to the route as soon as it is ready, with no banner', async () => {
    renderCreating()
    await screen.findByRole('heading', { name: 'Cacahuete está creando tu ruta' })
    await finishSteps()
    expect(location()).toMatch(/^\/route\/.+/)
    expect(screen.getByText('route screen')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver ruta' })).not.toBeInTheDocument()
    expect(screen.queryByText('Tu ruta está lista')).not.toBeInTheDocument()
  })

  it('Cancel returns to the conversation', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderCreating()
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(location()).toBe('/chat/conversation')
    expect(screen.getByText('conversation')).toBeInTheDocument()
  })

  it('shows the error when the creation fails, and stays on the screen', async () => {
    renderCreating({ fail: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('No he podido crear la ruta.')
    await finishSteps()
    expect(location()).toBe('/creating')
    expect(screen.queryByText('Lugares seleccionados')).not.toBeInTheDocument()
  })
})
