import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { createDataModule } from '../data/mockData'
import { STORAGE_KEYS, createStorage, memoryBackend, type JsonStorage } from '../data/storage'
import { AppStateProvider, useAppState, useChat } from './AppState'
import { DEAD_EPOCH, THREAD_LIMIT, capThread, modeView, restoreThread, type ThreadItem } from './thread'

type Api = ReturnType<typeof useAppState> & { request: ReturnType<typeof useChat> }
let api: Api

function Probe() {
  const state = useAppState()
  const request = useChat('request')
  api = { ...state, request }
  return <output data-testid="n">{state.thread.length}</output>
}

function mount(storage: JsonStorage) {
  const data = createDataModule(storage, { latency: 0 })
  return render(
    <MemoryRouter>
      <AppStateProvider data={data} storage={storage} assistantDelay={() => Promise.resolve()} stepMs={1}>
        <Probe />
      </AppStateProvider>
    </MemoryRouter>,
  )
}

const user = (n: number): ThreadItem => ({ id: `u${n}`, mode: 'request', epoch: 1, kind: 'user', text: `m${n}` })

describe('thread model', () => {
  it('caps at 200 items, keeping the newest', () => {
    const many = Array.from({ length: 250 }, (_, i) => user(i))
    const capped = capThread(many)
    expect(capped).toHaveLength(THREAD_LIMIT)
    expect(capped[0].id).toBe('u50')
  })

  it('restored items are dead history; a running progress becomes cancelled', () => {
    const restored = restoreThread([
      user(1),
      { id: 'p', mode: 'request', epoch: 3, kind: 'progress', status: 'running', request: {} },
      'junk',
    ])
    expect(restored.map((i) => i.epoch)).toEqual([DEAD_EPOCH, DEAD_EPOCH])
    expect(restored[1]).toMatchObject({ status: 'cancelled' })
    expect(modeView(restored, 'request', 0)).toEqual([])
    expect(restoreThread('nope')).toEqual([])
  })
})

describe('single thread in the provider', () => {
  it('mobile mode view equals the previous per-mode transcript; older epochs stay in the thread', async () => {
    const storage = createStorage(memoryBackend())
    storage.write(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES)
    mount(storage)
    await screen.findByTestId('n')

    act(() => api.request.start({ key: 'one' }))
    await act(async () => {
      await api.request.send({ text: 'Marbella' })
    })
    expect(api.request.messages.map((m) => m.kind)).toEqual(['user', 'assistant'])

    // A new request (new epoch): the mobile view starts empty, nothing is deleted.
    act(() => api.request.start({ key: 'two' }))
    expect(api.request.messages).toEqual([])
    expect(api.thread).toHaveLength(2)
    await act(async () => {
      await api.request.send({ text: 'hola' })
    })
    expect(api.request.messages.map((m) => (m.kind === 'user' ? m.text : m.kind))).toEqual(['hola', 'assistant'])
    expect(api.thread).toHaveLength(4)
    // Desktop history: earlier epochs keep their items with their own epoch.
    const epochsInThread = [...new Set(api.thread.map((i) => i.epoch))]
    expect(epochsInThread).toEqual([1, 2])
    expect(api.epochs.request).toBe(2)
  })

  it('persists the thread and restores it as history after a reload', async () => {
    const storage = createStorage(memoryBackend())
    storage.write(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES)
    const first = mount(storage)
    await screen.findByTestId('n')
    act(() => api.request.start({ key: 'one' }))
    await act(async () => {
      await api.request.send({ text: '5 horas en Marbella' })
    })
    await waitFor(() => expect(storage.read<ThreadItem[]>(STORAGE_KEYS.thread, [])).toHaveLength(2))
    first.unmount()

    mount(storage)
    await screen.findByTestId('n')
    expect(api.thread.map((i) => i.kind)).toEqual(['user', 'assistant'])
    expect(api.thread.every((i) => i.epoch === DEAD_EPOCH)).toBe(true)
    // Restored items are never part of a live (mobile) view.
    expect(api.request.messages).toEqual([])
  })

  it('creation runs in the provider: progress item, then done with the route and change mode armed', async () => {
    const storage = createStorage(memoryBackend())
    storage.write(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES)
    mount(storage)
    await screen.findByTestId('n')
    act(() =>
      api.startCreation({
        city: 'Marbella',
        date: '2026-12-05',
        timeWindow: { from: '10:00', to: '15:00' },
        start: { label: 'Plaza de los Naranjos' },
        mustInclude: [],
      }),
    )
    expect(api.creation?.status).toBe('running')
    expect(api.thread.map((i) => i.kind)).toEqual(['user', 'progress'])
    await waitFor(() => expect(api.creation?.status).toBe('done'))
    const progress = api.thread.find((i) => i.kind === 'progress')
    expect(progress).toMatchObject({ status: 'done', routeId: api.creation?.route?.id })
    expect(api.chatKey('change')).toBe(api.creation?.route?.id)
    const notice = api.thread[api.thread.length - 1]
    expect(notice).toMatchObject({ kind: 'notice', mode: 'change', desktopOnly: true })
    expect(notice.kind === 'notice' && notice.text[0]).toMatch(/^Ruta creada: \d paradas, de 10:00 a \d\d:\d\d\. La tienes a la derecha\.$/)
    // Desktop-only items never reach the mobile views.
    expect(api.request.messages).toEqual([])
  })
})
