import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { DataModule, Route, RouteRequest } from './contract/types'
import { DEFAULT_PREFERENCES } from './data/defaults'
import { createDataModule } from './data/mockData'
import { createStorage, memoryBackend } from './data/storage'
import { LayoutProvider, type Layout } from './lib/useLayout'
import { currentPath, renderApp } from './test/renderApp'

const as = (layout: Layout) => (children: ReactNode) => <LayoutProvider value={layout}>{children}</LayoutProvider>
const desktop = as('desktop')

const marbella: RouteRequest = {
  city: 'Marbella',
  date: '2027-01-09',
  timeWindow: { from: '10:00', to: '15:00' },
  start: { label: 'Plaza de los Naranjos' },
  mustInclude: ['Plaza de los Naranjos', 'Tapas'],
  overrides: { interests: ['arquitectura', 'gastronomia'] },
}

async function withRoute(): Promise<{ storage: ReturnType<typeof createStorage>; route: Route }> {
  const storage = createStorage(memoryBackend())
  storage.write('rt.preferences', DEFAULT_PREFERENCES)
  const route = await createDataModule(storage, { latency: 0 }).createRoute(marbella)
  return { storage, route }
}

/** The data module as the HTTP adapter exposes it: no optional `capabilities` (no move_stop). */
const withoutCapabilities = (data: DataModule): DataModule => {
  const copy = { ...data } as DataModule & { capabilities?: unknown }
  delete copy.capabilities
  return copy
}

const chat = () => screen.getByRole('region', { name: 'Chat con el asistente' })
const panel = () => screen.queryByRole('region', { name: 'Ruta' })
const stopList = async () => within(await screen.findByRole('region', { name: 'Ruta' })).findByRole('list', { name: 'Paradas' })

describe('desktop smoke tests (layout forced to desktop)', () => {
  it('(a) onboarding in the chat → request → summary → progress with no panel → route in the panel, chat still there', async () => {
    const user = userEvent.setup()
    renderApp('/onboarding', { wrap: desktop, stepMs: 5 })
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    // The sidebar replaces the bottom tab bar: "Mis rutas" is a disclosure button, not a tab link.
    expect(within(nav).getByRole('button', { name: 'Mis rutas' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Mis rutas' })).not.toBeInTheDocument()
    await screen.findByText('Pregunta 1 de 4')
    await user.click(screen.getByRole('button', { name: 'Omitir' }))
    await waitFor(() => expect(currentPath()).toBe('/chat'))

    // Empty request: the mobile Chat content at the bottom of the thread; preferences in a collapsible strip.
    expect(await screen.findByRole('heading', { name: '¿Qué te apetece hacer en Marbella?' })).toBeInTheDocument()
    const strip = screen.getByRole('button', { name: 'Tus preferencias guardadas' })
    expect(strip).toHaveAttribute('aria-expanded', 'false')
    await user.click(strip)
    expect(strip).toHaveAttribute('aria-expanded', 'true')
    // The onboarding stays in the same conversation as history.
    expect(within(chat()).getByText('Pregunta 1 de 4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Casco antiguo y tapas en Marbella, 5 horas' }))
    await waitFor(() => expect(currentPath()).toBe('/chat/conversation'))
    await user.click(await screen.findByRole('button', { name: 'Este sábado' }))
    await user.click(await screen.findByRole('button', { name: 'Parque de la Alameda' }))
    expect(await screen.findByText('Esto es lo que entendí')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Crear ruta' }))

    expect(await screen.findByText('Estoy creando tu ruta')).toBeInTheDocument()
    expect(currentPath()).toBe('/creating')
    expect(panel()).not.toBeInTheDocument()

    await waitFor(() => expect(currentPath()).toMatch(/^\/route\//))
    expect(await within(await screen.findByRole('region', { name: 'Ruta' })).findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(chat()).toBeInTheDocument()
    expect(within(chat()).getByText(/^Ruta creada: \d paradas, de 10:00 a \d\d:\d\d\. La tienes a la derecha\.$/)).toBeInTheDocument()
    expect(within(chat()).getByText('Esto es lo que entendí')).toBeInTheDocument()
  })

  it('(b) a change sent by chat updates the stop list in the panel without a URL change', async () => {
    const user = userEvent.setup()
    const { storage, route } = await withRoute()
    renderApp(`/route/${route.id}`, { storage, wrap: desktop })
    const list = await stopList()
    expect(within(list).queryByText('Pausa para café')).not.toBeInTheDocument()
    await screen.findByText(/¿Qué quieres cambiar de la ruta\?/)
    await user.type(within(chat()).getByRole('textbox'), 'Añade una pausa para café{Enter}')
    expect(await within(chat()).findByText('Hecho. He cambiado una cosa:')).toBeInTheDocument()
    expect(within(chat()).queryByRole('link', { name: 'Ver ruta actualizada' })).not.toBeInTheDocument()
    expect(await within(list).findByText('Pausa para café')).toBeInTheDocument()
    expect(currentPath()).toBe(`/route/${route.id}`)
    await user.click(within(chat()).getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(within(list).queryByText('Pausa para café')).not.toBeInTheDocument())
  })

  it('(c) "Guardar ruta" as guest opens a dialog; registering saves it and it appears in the sidebar dropdown', async () => {
    const user = userEvent.setup()
    const { storage, route } = await withRoute()
    renderApp(`/route/${route.id}`, { storage, wrap: desktop })
    await user.click(await screen.findByRole('button', { name: 'Guardar ruta' }))
    await screen.findByRole('dialog', { name: 'Crea una cuenta para guardarla' })
    expect(panel()).toBeInTheDocument() // the route stays behind
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(currentPath()).toBe(`/route/${route.id}`)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar ruta' })).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Guardar ruta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Crea una cuenta para guardarla' })
    await user.type(within(dialog).getByLabelText('Correo electrónico'), 'ana@correo.com')
    await user.type(within(dialog).getByLabelText('Contraseña'), 'secreto123')
    await user.click(within(dialog).getByLabelText('Acepto los términos y la política de privacidad'))
    await user.click(within(dialog).getByRole('button', { name: 'Crear cuenta y guardar' }))
    await waitFor(() => expect(currentPath()).toBe(`/my-routes/${route.id}`))
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('button', { name: 'Mis rutas' })).toHaveAttribute('aria-expanded', 'true')
    expect(await within(nav).findByRole('link', { name: new RegExp(route.name) })).toHaveAttribute('aria-current', 'true')
    expect(within(nav).getByText('ana@correo.com')).toBeInTheDocument()
  })

  it('(d) Mis rutas is a sidebar disclosure; with no saved routes it reads "Aún no tienes rutas"', async () => {
    const user = userEvent.setup()
    const storage = createStorage(memoryBackend())
    storage.write('rt.preferences', DEFAULT_PREFERENCES)
    renderApp('/chat', { storage, wrap: desktop })
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    const toggle = within(nav).getByRole('button', { name: 'Mis rutas' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(nav).getByText('Aún no tienes rutas')).toBeInTheDocument()
    expect(currentPath()).toBe('/chat')
    expect(chat()).toBeInTheDocument()
  })

  it('(d) choosing a saved route opens it in the panel with the chat notice; Valorar is a dialog', async () => {
    const user = userEvent.setup()
    const storage = createStorage(memoryBackend())
    storage.write('rt.preferences', DEFAULT_PREFERENCES)
    const seeded = createDataModule(storage, { latency: 0 })
    await seeded.login('eva@correo.com', 'secreto123')
    const [first] = await seeded.listRoutes()
    renderApp('/my-routes', { storage, wrap: desktop })
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('button', { name: 'Mis rutas' })).toHaveAttribute('aria-expanded', 'true')
    expect(chat()).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ruta guardada' })).not.toBeInTheDocument()
    await user.click(await within(nav).findByRole('link', { name: new RegExp(first.name) }))
    const saved = await screen.findByRole('region', { name: 'Ruta guardada' })
    expect(within(saved).getByRole('heading', { name: first.name })).toBeInTheDocument()
    expect(within(saved).getByText(/^Guardada · /)).toBeInTheDocument()
    expect(await within(chat()).findByText(new RegExp(`^Has abierto «${first.name}», guardada para el `))).toBeInTheDocument()
    expect(within(chat()).getByRole('button', { name: 'Pedir otra ruta' })).toBeEnabled()

    const rate = within(saved).getByRole('button', { name: 'Valorar' })
    await user.click(rate)
    expect(await screen.findByRole('dialog', { name: '¿Qué tal la ruta?' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ruta guardada' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(currentPath()).toBe(`/my-routes/${first.id}`)
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Ruta guardada' })).getByRole('button', { name: 'Valorar' })).toHaveFocus())
  })

  it('(e) /preferences shows the settings tabs with the chat still visible', async () => {
    const storage = createStorage(memoryBackend())
    storage.write('rt.preferences', DEFAULT_PREFERENCES)
    renderApp('/preferences', { storage, wrap: desktop })
    const settings = await screen.findByRole('region', { name: 'Perfil' })
    const tabs = within(settings).getByRole('navigation', { name: 'Secciones del perfil' })
    expect(within(tabs).getByRole('link', { name: 'Preferencias' })).toHaveAttribute('aria-current', 'page')
    expect(within(settings).getByText('Cacahuete aplica estas preferencias a cada ruta.')).toBeInTheDocument()
    expect(within(settings).getByRole('button', { name: 'Transporte público' })).toBeInTheDocument()
    expect(chat()).toBeInTheDocument()
    expect(await within(chat()).findByText('Aquí sigo. ¿Qué ruta te preparo hoy?')).toBeInTheDocument()
  })

  it('(f) switching from desktop to mobile on /route/:id keeps the route and the conversation', async () => {
    const user = userEvent.setup()
    const { storage, route } = await withRoute()
    const { rewrap } = renderApp(`/route/${route.id}`, { storage, wrap: desktop })
    await screen.findByText(/¿Qué quieres cambiar de la ruta\?/)
    await user.type(within(chat()).getByRole('textbox'), 'Añade una pausa{Enter}')
    expect(await within(chat()).findByText('Hecho. He cambiado una cosa:')).toBeInTheDocument()

    act(() => rewrap(as('mobile')))
    expect(currentPath()).toBe(`/route/${route.id}`)
    expect(await screen.findByRole('heading', { name: route.name })).toBeInTheDocument()
    expect(screen.getByText('Pausa para café')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Chat con el asistente' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Pide un cambio al asistente' }))
    expect(await screen.findByText('Hecho. He cambiado una cosa:')).toBeInTheDocument()
    expect(screen.getByText('Añade una pausa')).toBeInTheDocument()

    // And back: /route/:id/change becomes /route/:id on desktop.
    act(() => rewrap(desktop))
    await waitFor(() => expect(currentPath()).toBe(`/route/${route.id}`))
    expect(within(chat()).getByText('Añade una pausa')).toBeInTheDocument()
  })

  it('map and list are linked; stops reorder with buttons; detail is a slide-over; Cambiar is a dialog', async () => {
    const user = userEvent.setup()
    const { storage, route } = await withRoute()
    const names = route.stops.map((s) => s.name)
    const { data, container } = renderApp(`/route/${route.id}`, { storage, wrap: desktop })
    const region = await screen.findByRole('region', { name: 'Ruta' })
    const list = await stopList()
    const rows = () => within(list).getAllByRole('listitem')
    const marker = (order: number) => container.ownerDocument.querySelector(`g[data-order="${order}"]`) as Element

    await user.hover(rows()[1])
    expect(marker(2)).toHaveAttribute('data-highlighted', 'true')
    await user.unhover(rows()[1])
    expect(marker(2)).not.toHaveAttribute('data-highlighted')
    await user.hover(marker(3))
    expect(rows()[2].className).toMatch(/highlighted/)

    // Keyboard alternative to drag and drop: up / down buttons, announced.
    expect(within(list).getByRole('button', { name: `Subir ${names[0]}` })).toBeDisabled()
    await user.click(within(list).getByRole('button', { name: `Bajar ${names[0]}` }))
    await waitFor(async () => expect((await data.getRoute(route.id)).stops[1].name).toBe(names[0]))
    expect(await within(region).findByText(`${names[0]} pasa a la posición 2.`)).toBeInTheDocument()
    await waitFor(() => expect(within(rows()[0]).getByText(names[1])).toBeInTheDocument())
    await user.click(within(region).getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(within(rows()[0]).getByText(names[0])).toBeInTheDocument())

    // Stop detail slides over the list; the map stays.
    await user.click(within(list).getByRole('link', { name: names[1] }))
    const detail = await screen.findByRole('complementary', { name: 'Detalle de la parada' })
    expect(within(detail).getByRole('heading', { name: names[1] })).toBeInTheDocument()
    expect(within(region).getByRole('img', { name: /^Mapa de la ruta/ })).toBeInTheDocument()
    await user.click(within(detail).getByRole('button', { name: 'Cambiar' }))
    const dialog = await screen.findByRole('dialog', { name: `Alternativas a ${names[1]}` })
    await user.click(await within(dialog).findByRole('button', { name: 'Usar esta parada' }))
    await waitFor(() => expect(currentPath()).toBe(`/route/${route.id}`))
    await waitFor(async () => expect((await data.getRoute(route.id)).stops[1].name).not.toBe(names[1]))
    expect(screen.queryByRole('complementary', { name: 'Detalle de la parada' })).not.toBeInTheDocument()

    await user.click(within(list).getByRole('link', { name: names[0] }))
    await screen.findByRole('complementary', { name: 'Detalle de la parada' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(currentPath()).toBe(`/route/${route.id}`))
  })

  it('without the move_stop capability (HTTP adapter) the reorder controls are hidden', async () => {
    const { storage, route } = await withRoute()
    renderApp(`/route/${route.id}`, { storage, wrap: desktop, mapData: withoutCapabilities })
    const list = await stopList()
    expect(within(list).getAllByRole('listitem').length).toBe(route.stops.length)
    expect(within(list).queryByRole('button', { name: /^Subir / })).not.toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: /^Bajar / })).not.toBeInTheDocument()
    expect(within(list).getAllByRole('listitem')[0]).not.toHaveAttribute('draggable', 'true')
  })

  it('Entrar from Inicio opens the login dialog over Inicio; login lands in Mis rutas', async () => {
    const user = userEvent.setup()
    renderApp('/', { wrap: desktop })
    await user.click(await screen.findByRole('link', { name: 'Entrar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Hola de nuevo' })
    expect(screen.getByRole('heading', { level: 1, name: 'Marbella a tu ritmo' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Continuar con Google' }))
    await waitFor(() => expect(currentPath()).toBe('/my-routes'))
    expect(await screen.findByText('google@ejemplo.com')).toBeInTheDocument()
  })

  it('after a reload the conversation comes back as read-only history and the route view does not greet again', async () => {
    const { storage, route } = await withRoute()
    storage.write('rt.currentRoute', route.id)
    storage.write('rt.thread', [
      { id: 'h1', mode: 'change', epoch: 4, kind: 'user', text: 'Añade una pausa' },
      { id: 'h2', mode: 'change', epoch: 4, kind: 'assistant', reply: { kind: 'change', text: 'Hecho. He cambiado una cosa:', changes: ['Pausa'] } },
    ])
    renderApp(`/route/${route.id}`, { storage, wrap: desktop })
    expect(await within(await screen.findByRole('region', { name: 'Chat con el asistente' })).findByText('Hecho. He cambiado una cosa:')).toBeInTheDocument()
    expect(within(chat()).getByText('Añade una pausa')).toBeInTheDocument()
    // History is never interactive, and no new greeting is appended under it.
    expect(within(chat()).queryByRole('button', { name: 'Deshacer' })).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(within(chat()).queryByText(/¿Qué quieres cambiar de la ruta\?/)).not.toBeInTheDocument()
  })
})
