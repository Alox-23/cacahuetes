import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useEffect, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteRequest } from '../contract/types'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { createDataModule } from '../data/mockData'
import { createStorage, memoryBackend } from '../data/storage'
import type { PeanutRunState } from '../game/PeanutRunGame'
import { AppStateProvider, usePendingRequest } from '../state/AppState'
import { CreatingPage, STEP_MS } from './CreatingPage'

type GameProps = { onStateChange?: (s: PeanutRunState) => void; onExit?: (score: number) => void }

// The real engine needs a canvas; this stand-in lets each test drive the game state.
const game = vi.hoisted(() => ({ props: null as GameProps | null, mounted: 0 }))
vi.mock('../game/PeanutRunGame', () => ({
  PeanutRunGame: forwardRef<unknown, GameProps>(function FakeGame(props, ref) {
    void ref // no imperative handle: the page falls back to the reported state
    game.props = props
    useEffect(() => {
      game.mounted += 1
      props.onStateChange?.('ready')
      return () => {
        game.mounted -= 1
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- report once, like the real wrapper
    }, [])
    return <div data-testid="game" />
  }),
}))

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

function renderCreating() {
  const storage = createStorage(memoryBackend())
  storage.write('rt.preferences', DEFAULT_PREFERENCES)
  const data = createDataModule(storage, { latency: 0 })
  render(
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
}

const location = () => screen.getByTestId('location').textContent
async function finishSteps() {
  // One act per step: each step's timer is scheduled by an effect after the previous render.
  for (let i = 0; i < 5; i += 1) await act(() => vi.advanceTimersByTimeAsync(STEP_MS))
}
const emit = (state: PeanutRunState) => act(() => game.props?.onStateChange?.(state))
// The provider renders after an async load (outside act), so the fake's mount effect, which
// reports "ready", can run late: wait for it before emitting, or it would overwrite the emitted state.
async function gameMounted() {
  await screen.findByTestId('game')
  await waitFor(() => expect(game.mounted).toBe(1))
}

describe('Creating screen with Peanut Run', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    game.props = null
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the steps, the game, the hint and Cancel', async () => {
    renderCreating()
    expect(await screen.findByRole('heading', { name: 'Cacahuete está creando tu ruta' })).toBeInTheDocument()
    expect(screen.getByText('Lugares seleccionados')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mientras tanto, juega' })).toContainElement(screen.getByTestId('game'))
    expect(screen.getByText('Toca el juego para saltar. Tu ruta sigue en marcha.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('auto-navigates to the route when the game was never started', async () => {
    renderCreating()
    await gameMounted()
    await finishSteps()
    expect(location()).toMatch(/^\/route\/.+/)
    expect(game.mounted).toBe(0)
  })

  it('while a run is going it waits, shows the banner, and "Ver ruta" navigates', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderCreating()
    await gameMounted()
    await emit('running')
    await finishSteps()
    expect(location()).toBe('/creating')
    // The banner sits in a role="status" region (the app's toast region is another one).
    const banner = screen.getByRole('button', { name: 'Ver ruta' }).closest('[role="status"]')
    expect(banner).not.toBeNull()
    expect(banner).toHaveTextContent('Tu ruta está lista')
    expect(screen.getByRole('heading', { name: 'Tu ruta está lista' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    // The game keeps going: a later state change does not navigate either.
    await emit('gameover')
    expect(location()).toBe('/creating')
    await user.click(screen.getByRole('button', { name: 'Ver ruta' }))
    expect(location()).toMatch(/^\/route\/.+/)
  })

  it('"No" in the game dialog goes to the route once it is ready, and does nothing before', async () => {
    renderCreating()
    await gameMounted()
    await emit('running')
    await emit('gameover')
    await emit('exited')
    act(() => game.props?.onExit?.(42))
    expect(location()).toBe('/creating')
    await finishSteps()
    expect(location()).toBe('/creating')
    expect(screen.getByRole('button', { name: 'Ver ruta' })).toBeInTheDocument()
    await emit('running')
    await emit('gameover')
    act(() => game.props?.onExit?.(7))
    expect(location()).toMatch(/^\/route\/.+/)
  })

  it('Cancel returns to the conversation and unmounts the game', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderCreating()
    await gameMounted()
    await emit('running')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(location()).toBe('/chat/conversation')
    expect(game.mounted).toBe(0)
  })
})
