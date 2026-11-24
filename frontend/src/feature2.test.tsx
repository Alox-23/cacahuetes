import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { RouteRequest } from './contract/types'
import { DEFAULT_PREFERENCES } from './data/defaults'
import { createDataModule } from './data/mockData'
import { createStorage, memoryBackend } from './data/storage'
import { AppRoutes } from './router'
import { AppStateProvider } from './state/AppState'

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function setup() {
  const storage = createStorage(memoryBackend())
  storage.write('rt.preferences', DEFAULT_PREFERENCES)
  const data = createDataModule(storage, { latency: 0 })
  return { storage, data }
}

function renderApp(path: string, ctx: ReturnType<typeof setup>) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppStateProvider data={ctx.data} storage={ctx.storage} assistantDelay={() => Promise.resolve()}>
        <AppRoutes />
        <Location />
      </AppStateProvider>
    </MemoryRouter>,
  )
}

const location = () => screen.getByTestId('location').textContent

const bcn: RouteRequest = {
  city: 'Barcelona',
  date: '2027-01-09',
  timeWindow: { from: '10:00', to: '15:00' },
  start: { label: 'Mi hotel' },
  mustInclude: ['Sagrada Família', 'Tapas'],
  overrides: { interests: ['arquitectura', 'gastronomia'] },
}

describe('feature 2 smoke tests', () => {
  it('a guest saves a route: Guardar como invitado → Crear cuenta (validated) → route in Mis rutas', async () => {
    const user = userEvent.setup()
    const ctx = setup()
    const route = await ctx.data.createRoute(bcn)
    renderApp(`/route/${route.id}`, ctx)

    // Route screen: schematic map, stops with times and legs.
    expect(await screen.findByRole('img', { name: 'Mapa de la ruta con cuatro paradas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sagrada Família' })).toHaveAttribute('href', `/route/${route.id}/stop/1`)
    expect(screen.getByText('10:00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar ruta' }))
    await waitFor(() => expect(location()).toBe(`/route/${route.id}/save`))
    expect(screen.getByRole('heading', { name: 'Crea una cuenta para guardarla' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    await waitFor(() => expect(location()).toBe('/register'))

    // Invalid input blocks submission with errors next to the fields.
    const submit = screen.getByRole('button', { name: 'Crear cuenta' })
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@')
    await user.type(screen.getByLabelText('Contraseña'), 'corta')
    await user.click(submit)
    expect(location()).toBe('/register')
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Escribe un correo válido, por ejemplo nombre@correo.com.')).toBeInTheDocument()
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument()
    expect(screen.getByText('Acepta los términos para crear la cuenta.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Correo electrónico'), 'ejemplo.com')
    await user.type(screen.getByLabelText('Contraseña'), '-larga')
    await user.click(screen.getByLabelText('Acepto los términos y la política de privacidad'))
    await user.click(submit)

    await waitFor(() => expect(location()).toBe(`/my-routes/${route.id}`))
    expect(await screen.findByRole('heading', { name: 'Barcelona en 5 horas' })).toBeInTheDocument()
    expect(await ctx.data.getSession()).toMatchObject({ kind: 'account', email: 'ana@ejemplo.com', name: 'Ana' })
    expect(await ctx.data.getPreferences()).toEqual(DEFAULT_PREFERENCES)

    // A fresh account sees only this route (no example seeding on register).
    await user.click(screen.getByRole('link', { name: 'Mis rutas' }))
    await waitFor(() => expect(location()).toBe('/my-routes'))
    const list = await screen.findByRole('list', { name: 'Rutas guardadas' })
    expect(within(list).getAllByRole('link')).toHaveLength(1)
    expect(within(list).getByText('Barcelona en 5 horas')).toBeInTheDocument()
  })

  it('login seeds the examples; tabs and search; favourite toggles; delete asks for confirmation', async () => {
    const user = userEvent.setup()
    const ctx = setup()
    renderApp('/my-routes', ctx)

    // Guests see the empty state.
    expect(await screen.findByText('Aún no tienes rutas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir una ruta' })).toHaveAttribute('href', '/chat')

    await user.click(screen.getByRole('link', { name: 'Perfil' }))
    await user.click(await screen.findByRole('link', { name: 'Entrar' }))
    await waitFor(() => expect(location()).toBe('/login'))
    await user.type(screen.getByLabelText('Correo electrónico'), 'marta@ejemplo.com')
    await user.type(screen.getByLabelText('Contraseña'), '12345678')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(location()).toBe('/my-routes'))

    const cards = async () => within(await screen.findByRole('list', { name: 'Rutas guardadas' })).getAllByRole('link')
    expect(await cards()).toHaveLength(2)
    const tabs = screen.getByRole('radiogroup', { name: 'Filtrar rutas' })
    await user.click(within(tabs).getByRole('radio', { name: 'Pasadas' }))
    expect((await cards()).map((c) => c.textContent)).toEqual([expect.stringContaining('Sevilla, tarde tranquila')])
    await user.click(within(tabs).getByRole('radio', { name: 'Favoritas' }))
    expect(await cards()).toHaveLength(1)
    await user.click(within(tabs).getByRole('radio', { name: 'Próximas' }))
    await user.type(screen.getByRole('searchbox', { name: 'Buscar rutas' }), 'Val')
    expect((await cards()).map((c) => c.textContent)).toEqual([expect.stringContaining('Valencia, día completo')])
    await user.clear(screen.getByRole('searchbox', { name: 'Buscar rutas' }))

    // Open Barcelona and toggle the favourite.
    await user.click(screen.getByRole('link', { name: /Barcelona en 5 horas/ }))
    await waitFor(() => expect(location()).toMatch(/^\/my-routes\/[^/]+$/))
    const id = location()?.split('/')[2] ?? ''
    const fav = await screen.findByRole('button', { name: 'Favorita' })
    expect(fav).toHaveAttribute('aria-pressed', 'false')
    await user.click(fav)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Favorita' })).toHaveAttribute('aria-pressed', 'true'))
    expect((await ctx.data.getRoute(id)).favorite).toBe(true)

    // Delete: confirmation first; cancel keeps it, confirm removes it.
    await user.click(screen.getByRole('button', { name: 'Eliminar ruta' }))
    let dialog = screen.getByRole('dialog', { name: '¿Eliminar esta ruta?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await ctx.data.listRoutes()).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Eliminar ruta' }))
    dialog = screen.getByRole('dialog', { name: '¿Eliminar esta ruta?' })
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar ruta' }))
    await waitFor(() => expect(location()).toBe('/my-routes'))
    expect(await ctx.data.listRoutes()).toHaveLength(2)
    await expect(ctx.data.getRoute(id)).rejects.toThrow()
    expect(await cards()).toHaveLength(1)
  })
})
