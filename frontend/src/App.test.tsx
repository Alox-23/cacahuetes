import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from './data/defaults'
import { createDataModule } from './data/mockData'
import { createStorage, memoryBackend } from './data/storage'
import { AppRoutes } from './router'
import { AppStateProvider } from './state/AppState'

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderApp(path: string, storage = createStorage(memoryBackend())) {
  const data = createDataModule(storage, { latency: 0 })
  const ui = (
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppStateProvider data={data} storage={storage} assistantDelay={() => Promise.resolve()}>
        <AppRoutes />
        <Location />
      </AppStateProvider>
    </MemoryRouter>
  )
  return { data, storage, ...render(ui) }
}

const location = () => screen.getByTestId('location').textContent

describe('onboarding smoke test', () => {
  it('a guest answers the four questions in the chat and lands on /chat with saved preferences', async () => {
    const user = userEvent.setup()
    const { data, storage, unmount } = renderApp('/onboarding')

    // Q1 — the assistant presents itself as an AI; every bubble carries the label.
    expect(await screen.findByText(/tu asistente de IA/)).toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getAllByText('Cacahuete · IA')).toHaveLength(2)
    await screen.findByText('Pregunta 1 de 4')
    const listo = screen.getByRole('button', { name: 'Listo' })
    expect(listo).toBeDisabled()
    const arq = screen.getByRole('button', { name: 'Arquitectura' })
    expect(arq).toHaveAttribute('aria-pressed', 'false')
    await user.click(arq)
    expect(arq).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Gastronomía' }))
    await user.click(listo)

    // Echo + Q2 (pace radio group + transport chips).
    expect(await screen.findByText('Arquitectura y gastronomía')).toBeInTheDocument()
    await screen.findByText('Apuntado.')
    const pace = screen.getByRole('radiogroup', { name: 'Ritmo' })
    await user.click(within(pace).getByRole('radio', { name: 'Relajado' }))
    expect(within(pace).getByRole('radio', { name: 'Relajado' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'A pie' }))
    await user.click(screen.getByRole('button', { name: 'Transporte público' }))
    await user.click(screen.getByRole('button', { name: 'Listo' }))

    // Q3 and Q4 are one-tap quick replies.
    expect(await screen.findByText('Relajado, a pie y en transporte público')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'En pareja' }))
    await screen.findByText('Afecta a las entradas y a los sitios para comer. Es la última pregunta.')
    await user.click(screen.getByRole('button', { name: 'Medio' }))

    await waitFor(() => expect(location()).toBe('/chat'))
    expect(await screen.findByText('Tus preferencias guardadas')).toBeInTheDocument()
    for (const chip of ['Arquitectura', 'Gastronomía', 'Relajado', 'En pareja', 'A pie y bus', 'Presupuesto medio']) {
      expect(screen.getByText(chip)).toBeInTheDocument()
    }
    expect(await data.getPreferences()).toEqual({
      interests: ['arquitectura', 'gastronomia'],
      pace: 'relajado',
      transport: ['a_pie', 'transporte_publico'],
      company: 'pareja',
      budget: 'medio',
      needs: [],
    })

    // "Reload": a fresh app on the same storage never asks again.
    unmount()
    renderApp('/onboarding', storage)
    await waitFor(() => expect(location()).toBe('/chat'))
  })

  it('"Omitir" saves the defaults and goes to /chat', async () => {
    const user = userEvent.setup()
    const { data } = renderApp('/onboarding')
    await screen.findByText('Pregunta 1 de 4')
    await user.click(screen.getByRole('button', { name: 'Omitir' }))
    await waitFor(() => expect(location()).toBe('/chat'))
    expect(await data.getPreferences()).toEqual(DEFAULT_PREFERENCES)
    expect(screen.getByText('Presupuesto medio')).toBeInTheDocument()
  })

  it('/chat redirects to /onboarding until the questions are answered', async () => {
    renderApp('/chat')
    await waitFor(() => expect(location()).toBe('/onboarding'))
  })

  it('a suggestion leads to slot questions, the summary, creation and the route', async () => {
    const user = userEvent.setup()
    const storage = createStorage(memoryBackend())
    storage.write('rt.preferences', DEFAULT_PREFERENCES)
    renderApp('/chat', storage)
    await user.click(await screen.findByRole('button', { name: 'Casco antiguo y tapas en Marbella, 5 horas' }))
    await waitFor(() => expect(location()).toBe('/chat/conversation'))
    await user.click(await screen.findByRole('button', { name: 'Este sábado' }))
    await user.click(await screen.findByRole('button', { name: 'Parque de la Alameda' }))
    expect(await screen.findByText('Esto es lo que entendí')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'De tu mensaje' })).toHaveTextContent('Desde Parque de la Alameda')
    expect(screen.getByRole('region', { name: 'De tus preferencias' })).toHaveTextContent('Presupuesto medio')
    await user.click(screen.getByRole('button', { name: 'Crear ruta' }))
    expect(location()).toBe('/creating')
    expect(await screen.findByText('Cacahuete está creando tu ruta')).toBeInTheDocument()
    await waitFor(() => expect(location()).toMatch(/^\/route\/.+/), { timeout: 4000 })
    expect(await screen.findByText('Plaza de los Naranjos')).toBeInTheDocument()
  })
})
