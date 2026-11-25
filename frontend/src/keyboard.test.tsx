/*
 * Keyboard pass over the desktop flows (feature 3 §11: every action by keyboard, Esc and focus return on
 * every dialog). Each dialog is opened from the keyboard, Tab must stay inside it, Esc must close it and
 * focus must land back on the control that opened it.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { RouteRequest } from './contract/types'
import { DEFAULT_PREFERENCES } from './data/defaults'
import { createDataModule } from './data/mockData'
import { createStorage, memoryBackend } from './data/storage'
import { LayoutProvider } from './lib/useLayout'
import { currentPath, renderApp } from './test/renderApp'

const desktop = (children: ReactNode) => <LayoutProvider value="desktop">{children}</LayoutProvider>

const marbella: RouteRequest = {
  city: 'Marbella',
  date: '2027-01-09',
  timeWindow: { from: '10:00', to: '15:00' },
  start: { label: 'Plaza de los Naranjos' },
  mustInclude: ['Plaza de los Naranjos', 'Tapas'],
  overrides: { interests: ['arquitectura', 'gastronomia'] },
}

function prefsStorage() {
  const storage = createStorage(memoryBackend())
  storage.write('rt.preferences', DEFAULT_PREFERENCES)
  return storage
}

/** Tab to `target` (at most 60 presses); fails if it is never reached. */
async function tabTo(user: UserEvent, target: HTMLElement) {
  for (let i = 0; i < 60 && document.activeElement !== target; i++) await user.tab()
  expect(target).toHaveFocus()
}

/** Tab and Shift+Tab around the whole dialog: focus never leaves it. */
async function expectTrapped(user: UserEvent, dialog: HTMLElement) {
  const count = dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea').length
  for (let i = 0; i < count + 2; i++) {
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
  }
  for (let i = 0; i < 3; i++) {
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
  }
}

/** Open with Enter from `opener`, check the trap, close with Esc, focus back on `opener`. */
async function dialogRoundTrip(user: UserEvent, opener: HTMLElement, name: string | RegExp) {
  await tabTo(user, opener)
  await user.keyboard('{Enter}')
  const dialog = await screen.findByRole('dialog', { name })
  expect(dialog.contains(document.activeElement)).toBe(true)
  await expectTrapped(user, dialog)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(opener).toHaveFocus())
}

describe('desktop keyboard pass', () => {
  it('Tab order: sidebar (Asistente, Mis rutas, Perfil, Entrar) then the chat (strip, Cambiar, suggestions, message)', async () => {
    const user = userEvent.setup()
    renderApp('/chat', { storage: prefsStorage(), wrap: desktop })
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    // The message field takes focus when Asistente opens.
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Mensaje para el asistente' })).toHaveFocus())
    ;(document.activeElement as HTMLElement).blur()

    const order = [
      within(nav).getByRole('link', { name: 'Asistente' }),
      within(nav).getByRole('button', { name: 'Mis rutas' }),
      within(nav).getByRole('link', { name: 'Perfil' }),
      within(nav).getByRole('link', { name: 'Entrar' }),
      screen.getByRole('button', { name: 'Tus preferencias guardadas' }),
      screen.getByRole('link', { name: 'Cambiar' }),
      screen.getByRole('button', { name: 'Casco antiguo y tapas en Marbella, 5 horas' }),
    ]
    for (const el of order) {
      await user.tab()
      expect(el).toHaveFocus()
    }
    await tabTo(user, screen.getByRole('textbox', { name: 'Mensaje para el asistente' }))

    // The disclosure works from the keyboard and its list is reachable right after it.
    const toggle = within(nav).getByRole('button', { name: 'Mis rutas' })
    await tabTo(user, toggle)
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('onboarding can be answered with the keyboard only (Space on chips, Enter on Listo and quick replies)', async () => {
    const user = userEvent.setup()
    renderApp('/onboarding', { wrap: desktop })
    await screen.findByText('Pregunta 1 de 4')
    await tabTo(user, screen.getByRole('button', { name: 'Arquitectura' }))
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Arquitectura' })).toHaveAttribute('aria-pressed', 'true')
    await tabTo(user, screen.getByRole('button', { name: 'Listo' }))
    await user.keyboard('{Enter}')
    await screen.findByText('Pregunta 2 de 4')
    await tabTo(user, screen.getByRole('button', { name: 'A pie' }))
    await user.keyboard(' ')
    await tabTo(user, screen.getByRole('button', { name: 'Listo' }))
    await user.keyboard('{Enter}')
    await tabTo(user, await screen.findByRole('button', { name: 'En pareja' }))
    await user.keyboard('{Enter}')
    await tabTo(user, await screen.findByRole('button', { name: 'Medio' }))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(currentPath()).toBe('/chat'))
  })

  it('route panel: save-as-guest dialog, stop slide-over and the alternatives dialog', async () => {
    const user = userEvent.setup()
    const storage = prefsStorage()
    const route = await createDataModule(storage, { latency: 0 }).createRoute(marbella)
    renderApp(`/route/${route.id}`, { storage, wrap: desktop })
    const region = await screen.findByRole('region', { name: 'Ruta' })

    await dialogRoundTrip(user, await within(region).findByRole('button', { name: 'Guardar ruta' }), 'Crea una cuenta para guardarla')

    // Stop detail: Enter on the stop link opens the slide-over with focus inside; Esc closes it.
    const link = within(region).getByRole('link', { name: route.stops[1].name })
    await tabTo(user, link)
    await user.keyboard('{Enter}')
    const detail = await screen.findByRole('complementary', { name: 'Detalle de la parada' })
    await waitFor(() => expect(detail.contains(document.activeElement)).toBe(true))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(currentPath()).toBe(`/route/${route.id}`))

    // Alternatives dialog from the slide-over: Esc goes back to the stop detail.
    await tabTo(user, within(region).getByRole('link', { name: route.stops[1].name }))
    await user.keyboard('{Enter}')
    const again = await screen.findByRole('complementary', { name: 'Detalle de la parada' })
    const change = within(again).getByRole('button', { name: 'Cambiar' })
    await tabTo(user, change)
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: `Alternativas a ${route.stops[1].name}` })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    await expectTrapped(user, dialog)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(currentPath()).toBe(`/route/${route.id}/stop/2`))
    await waitFor(() => expect(within(screen.getByRole('complementary', { name: 'Detalle de la parada' })).getByRole('button', { name: 'Cambiar' })).toHaveFocus())
  })

  it('saved route panel: rate dialog and the delete confirmation', async () => {
    const user = userEvent.setup()
    const storage = prefsStorage()
    const seeded = createDataModule(storage, { latency: 0 })
    await seeded.login('eva@correo.com', 'secreto123')
    const [first] = await seeded.listRoutes()
    renderApp(`/my-routes/${first.id}`, { storage, wrap: desktop })
    const saved = await screen.findByRole('region', { name: 'Ruta guardada' })
    await dialogRoundTrip(user, await within(saved).findByRole('button', { name: 'Valorar' }), '¿Qué tal la ruta?')
    await dialogRoundTrip(user, within(saved).getByRole('button', { name: 'Eliminar ruta' }), /eliminar/i)
    expect(currentPath()).toBe(`/my-routes/${first.id}`)
  })

  it('settings: sign out and delete account confirmations are dialogs on desktop', async () => {
    const user = userEvent.setup()
    const storage = prefsStorage()
    await createDataModule(storage, { latency: 0 }).register('leo@correo.com', 'secreto123')
    renderApp('/profile', { storage, wrap: desktop })
    const settings = await screen.findByRole('region', { name: 'Perfil' })
    await dialogRoundTrip(user, await within(settings).findByRole('button', { name: 'Cerrar sesión' }), /sesión/i)

    await tabTo(user, within(settings).getByRole('link', { name: 'Cuenta' }))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(currentPath()).toBe('/account'))
    const panel = screen.getByRole('region', { name: 'Perfil' })
    await dialogRoundTrip(user, await within(panel).findByRole('button', { name: 'Eliminar cuenta' }), /cuenta/i)
  })

  it('Inicio: login and register dialogs from the keyboard; switching keeps the view behind', async () => {
    const user = userEvent.setup()
    renderApp('/', { wrap: desktop })
    const enter = await screen.findByRole('link', { name: 'Entrar' })
    await dialogRoundTrip(user, enter, 'Hola de nuevo')

    // Login → "Crear una" switches to the register dialog over the same view; Esc goes back to Inicio.
    await tabTo(user, enter)
    await user.keyboard('{Enter}')
    const login = await screen.findByRole('dialog', { name: 'Hola de nuevo' })
    await tabTo(user, within(login).getByRole('button', { name: /Crear una/ }))
    await user.keyboard('{Enter}')
    const register = await screen.findByRole('dialog', { name: 'Crea tu cuenta' })
    expect(register.contains(document.activeElement)).toBe(true)
    await expectTrapped(user, register)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(currentPath()).toBe('/'))
    await waitFor(() => expect(enter).toHaveFocus())
  })
})
