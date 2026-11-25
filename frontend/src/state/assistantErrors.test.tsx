import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { MockAssistant } from '../assistant/mockAssistant'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { ApiClientError } from '../data/errors'
import { createDataModule } from '../data/mockData'
import { STORAGE_KEYS, createStorage, memoryBackend } from '../data/storage'
import { t } from '../i18n'
import { ReplyView } from '../pages/chat/ReplyView'
import { AppStateProvider, useAppState, useChat } from './AppState'

type Api = ReturnType<typeof useAppState> & { request: ReturnType<typeof useChat> }
let api: Api

/** The request chat's latest reply, rendered with the same options mechanic as the chat screens. */
function Probe() {
  const state = useAppState()
  const request = useChat('request')
  api = { ...state, request }
  const last = request.messages[request.messages.length - 1]
  return last?.kind === 'assistant' ? (
    <ReplyView reply={last.reply} interactive onOption={(o) => void request.send({ option: o.value }, o.label)} />
  ) : null
}

function Where() {
  const location = useLocation()
  return <output data-testid="where">{JSON.stringify({ path: location.pathname, state: location.state })}</output>
}

/** An assistant whose every message fails with `error` (what httpData throws for an API error). */
function failingAssistant(error: unknown) {
  const sendMessage = vi.fn(async () => {
    throw error
  })
  const factory = () => ({ reset: () => {}, sendMessage, getState: () => ({ mode: 'request' }) }) as unknown as MockAssistant
  return { factory, sendMessage }
}

async function mount(error: unknown) {
  const storage = createStorage(memoryBackend())
  storage.write(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES)
  const data = createDataModule(storage, { latency: 0 })
  const assistant = failingAssistant(error)
  render(
    <MemoryRouter initialEntries={['/chat/conversation']}>
      <AppStateProvider data={data} storage={storage} assistantFactory={assistant.factory} stepMs={1}>
        <Probe />
        <Where />
      </AppStateProvider>
    </MemoryRouter>,
  )
  await screen.findByTestId('where')
  act(() => api.request.start({ key: 'one' }))
  await act(async () => {
    await api.request.send({ text: 'Una ruta de tapas' })
  })
  return assistant
}

const where = () => JSON.parse(screen.getByTestId('where').textContent ?? '{}')
const lastReply = () => {
  const last = api.request.messages[api.request.messages.length - 1]
  return last?.kind === 'assistant' ? last.reply : undefined
}

describe('assistant errors in the chat', () => {
  it('an expired guest trial says so and offers to create an account or sign in', async () => {
    const quota = { plan: 'guest', remainingSeconds: 0, expiresAt: '2026-11-24T18:43:00.000Z' }
    const { sendMessage } = await mount(
      new ApiClientError('Se han agotado las tres horas de acceso gratuito a Cacahuete.', 'AGENT_TIME_EXPIRED', 403, { quota }),
    )
    expect(lastReply()?.text).toBe(t('assistant.trialExpired'))
    expect(screen.getByText(t('assistant.trialExpired'))).toBeTruthy()
    // The reply is over: the chat is not left waiting.
    expect(api.request.pending).toBe(false)
    expect(api.pending.request).toBe(false)
    expect(screen.getByRole('button', { name: t('assistant.trialRegister') })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: t('assistant.trialLogin') }))
    // The option opens the sign-in screen (coming back here after it) and never reaches the assistant.
    expect(where()).toEqual({ path: '/login', state: { returnTo: '/chat/conversation', background: '/chat/conversation' } })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(api.request.messages.map((m) => m.kind)).toEqual(['user', 'assistant'])
  })

  it('an expired account trial mentions premium and links to the account', async () => {
    await mount(new ApiClientError('expired', 'AGENT_TIME_EXPIRED', 403, { quota: { plan: 'free', remainingSeconds: 0 } }))
    expect(lastReply()?.text).toBe(t('assistant.trialExpiredAccount'))
    expect(screen.queryByRole('button', { name: t('assistant.trialLogin') })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: t('assistant.trialAccount') }))
    expect(where().path).toBe('/account')
  })

  it('without quota details the session decides (a guest here)', async () => {
    await mount(new ApiClientError('expired', 'AGENT_TIME_EXPIRED', 403))
    expect(lastReply()?.text).toBe(t('assistant.trialExpired'))
  })

  it('rate limited: asks to wait retryAfterSeconds, and the next message goes through again', async () => {
    const { sendMessage } = await mount(new ApiClientError('Demasiadas peticiones.', 'RATE_LIMITED', 429, { retryAfterSeconds: 45 }))
    expect(lastReply()).toEqual({ kind: 'question', text: t('assistant.rateLimited', { wait: t('assistant.waitSeconds', { count: 45 }) }) })
    expect(lastReply()?.text).toContain('45 segundos')
    expect(api.request.pending).toBe(false)
    await act(async () => {
      await api.request.send({ text: 'otra vez' })
    })
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('rate limited without retryAfterSeconds waits a minute', async () => {
    await mount(new ApiClientError('Demasiadas peticiones.', 'RATE_LIMITED', 429))
    expect(lastReply()?.text).toBe(t('assistant.rateLimited', { wait: t('assistant.waitMinute') }))
  })

  it('a network failure says the connection is down', async () => {
    await mount(new TypeError('Failed to fetch'))
    expect(lastReply()?.text).toBe(t('assistant.offline'))
  })

  it('any other API error keeps the generic reply', async () => {
    await mount(new ApiClientError('boom', 'NETWORK_UNAVAILABLE', 503))
    expect(lastReply()).toEqual({ kind: 'question', text: t('assistant.error') })
    expect(api.request.pending).toBe(false)
  })

  it('a plain Error keeps the generic reply', async () => {
    await mount(new Error('boom'))
    expect(lastReply()).toEqual({ kind: 'question', text: t('assistant.error') })
  })
})
