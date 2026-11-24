import { describe, expect, it } from 'vitest'
import type { RouteRequest } from '../contract/types'
import { routeEnd } from '../lib/route'
import { findPlace } from './catalog'
import { DEFAULT_PREFERENCES } from './defaults'
import { createDataModule } from './mockData'
import { STORAGE_KEYS, createStorage, memoryBackend } from './storage'

const localRequest: RouteRequest = {
  city: 'Marbella',
  date: '2026-12-05',
  timeWindow: { from: '10:00', to: '15:00' },
  start: { label: 'Plaza de los Naranjos' },
  mustInclude: ['Plaza de los Naranjos', 'Tapas'],
  overrides: { interests: ['arquitectura', 'gastronomia'] },
}

function setup(initial: Record<string, string> = {}) {
  const backend = memoryBackend(initial)
  const storage = createStorage(backend)
  let n = 0
  const data = createDataModule(storage, { latency: 0, newId: () => `r${++n}` })
  return { backend, storage, data }
}

async function withRoute() {
  const ctx = setup()
  await ctx.data.savePreferences(DEFAULT_PREFERENCES)
  const route = await ctx.data.createRoute(localRequest)
  return { ...ctx, route }
}

describe('mock data module', () => {
  it('boots cleanly from empty storage', async () => {
    const { data } = setup()
    expect(await data.getPreferences()).toBeNull()
    expect(await data.getSession()).toEqual({ kind: 'guest' })
    expect(await data.listRoutes()).toEqual([])
  })

  it('boots cleanly from corrupt storage', async () => {
    const { data } = setup({ [STORAGE_KEYS.preferences]: '{not json', [STORAGE_KEYS.routes]: '???' })
    expect(await data.getPreferences()).toBeNull()
    expect(await data.listRoutes()).toEqual([])
  })

  it('creates a scheduled Marbella route favouring must-include places', async () => {
    const { route } = await withRoute()
    expect(route.name).toBe('Marbella en 5 horas')
    expect(route.version).toBe(1)
    expect(route.saved).toBe(false)
    expect(route.favorite).toBe(false)
    expect(route.stops.map((s) => s.name)).toEqual(['Plaza de los Naranjos', 'Plaza de la Iglesia de la Encarnación', 'Muralla del castillo de Marbella', 'Mercado Municipal de Marbella'])
    expect(route.stops.map((s) => s.arrive)).toEqual(['10:00', '10:23', '10:40', '11:02'])
    expect(route.stops.map((s) => s.order)).toEqual([1, 2, 3, 4])
    expect(route.stops[1].travelToNext).toEqual({ mode: 'a_pie', minutes: 2 })
    expect(route.stops[3].travelToNext).toBeUndefined()
    expect(routeEnd(route)).toBe('11:27')
  })

  it('rejects other destinations and unknown departure points', async () => {
    const { data } = setup()
    await expect(data.createRoute({ ...localRequest, city: 'Bilbao' })).rejects.toThrow(/Marbella/)
    await expect(data.createRoute({ ...localRequest, start: { label: 'Puerta del Sol' } })).rejects.toThrow(/Marbella/)
  })

  it('names full-day routes "Un día en …" and picks five places', async () => {
    const { data } = setup()
    const route = await data.createRoute({
      ...localRequest,
      city: 'Marbella',
      timeWindow: { from: '10:00', to: '19:00' },
      mustInclude: [],
      overrides: { company: 'con_ninos' },
    })
    expect(route.name).toBe('Un día en Marbella')
    expect(route.stops).toHaveLength(5)
  })

  it('includes the local places requested for a walk from Puerto Banús', async () => {
    const { data } = setup()
    const route = await data.createRoute({ ...localRequest, start: { label: 'banus' }, mustInclude: ['Playa del Duque'] })
    expect(route.request.start.label).toBe('Puerto Banús')
    expect(route.stops.map(s => s.placeId)).toContain('playa-duque')
  })

  it('fits visits into short windows', async () => {
    const { data } = setup()
    const route = await data.createRoute({ ...localRequest, timeWindow: { from: '10:00', to: '13:00' } })
    expect(routeEnd(route) <= '13:05').toBe(true)
  })

  it('menos_caminar turns long walks into public transport', async () => {
    const { data } = setup()
    const route = await data.createRoute({ ...localRequest, mustInclude: ['Plaza de los Naranjos', 'Puerto Banús'],
      overrides: { transport: ['a_pie'] } })
    const index = route.stops.findIndex(s => s.travelToNext && s.travelToNext.minutes > 15)
    expect(index).toBeGreaterThanOrEqual(0)
    const next = await data.refineRoute(route.id, { type: 'quick', value: 'menos_caminar' })
    expect(next.version).toBe(2)
    expect(next.stops[index].travelToNext?.mode).toBe('transporte_publico')
  })

  it('anadir_pausa inserts a 20 min coffee break after stop 2', async () => {
    const { data, route } = await withRoute()
    const next = await data.refineRoute(route.id, { type: 'quick', value: 'anadir_pausa' })
    expect(next.stops).toHaveLength(5)
    expect(next.stops[2].name).toBe('Pausa para café')
    expect(next.stops[2].visitMinutes).toBe(20)
    expect(next.stops.map((s) => s.order)).toEqual([1, 2, 3, 4, 5])
  })

  it('mas_comida adds a food place', async () => {
    const { data, route } = await withRoute()
    const next = await data.refineRoute(route.id, { type: 'quick', value: 'mas_comida' })
    expect(next.stops).toHaveLength(5)
    expect(next.stops.map((s) => s.name)).toContain('Puerto Deportivo de Marbella')
  })

  it('mas_barato replaces the first paid place with a free one', async () => {
    const { data } = setup()
    const route = await data.createRoute({ ...localRequest, start: { label: 'grabado' }, mustInclude: [], overrides: { interests: ['museos'] } })
    const i = route.stops.findIndex(s => s.placeId === 'grabado')
    expect(i).toBeGreaterThanOrEqual(0)
    const next = await data.refineRoute(route.id, { type: 'quick', value: 'mas_barato' })
    expect(next.stops.map(s => s.placeId)).not.toContain('grabado')
    expect(findPlace(next.stops[i].placeId)?.paid).toBe(false)
  })

  it('mas_barato never replaces a must-include place', async () => {
    const { data } = setup()
    const route = await data.createRoute({
      ...localRequest,
      start: { label: 'grabado' },
      mustInclude: ['Museo del Grabado Español Contemporáneo'],
      overrides: { interests: ['museos'] },
    })
    expect(route.stops.map(s => s.placeId)).toContain('grabado')
    const next = await data.refineRoute(route.id, { type: 'quick', value: 'mas_barato' })
    expect(next.stops.map(s => s.placeId)).toContain('grabado')
  })

  it('a text action can apply several changes in one version', async () => {
    const { data, route } = await withRoute()
    const next = await data.refineRoute(route.id, { type: 'text', value: 'Menos caminar, y añade una pausa para café.' })
    expect(next.version).toBe(2)
    expect(next.stops.some((s) => s.name === 'Pausa para café')).toBe(true)
    expect(next.stops[1].travelToNext?.mode).toBe('a_pie') // Encarnación → pause, 3 min walk
  })

  it('lock, remove and swap stops', async () => {
    const { data, route } = await withRoute()
    let next = await data.refineRoute(route.id, { type: 'lock_stop', order: 1 })
    expect(next.stops[0].locked).toBe(true)
    next = await data.refineRoute(route.id, { type: 'remove_stop', order: 4 })
    expect(next.stops).toHaveLength(3)
    next = await data.refineRoute(route.id, { type: 'swap_stop', order: 3, placeId: 'avenida-mar' })
    expect(next.stops[2].name).toBe('Avenida del Mar')
    expect(next.version).toBe(4)
  })

  it('undo drops the last version but never the first', async () => {
    const { data, route } = await withRoute()
    await data.refineRoute(route.id, { type: 'quick', value: 'anadir_pausa' })
    const back = await data.undo(route.id)
    expect(back).toEqual(route)
    const again = await data.undo(route.id)
    expect(again.version).toBe(1)
  })

  it('persists preferences, session and routes across instances', async () => {
    const { storage, data, route } = await withRoute()
    await data.register('ana@example.com', 'x')
    await data.saveRoute(route.id)
    const reopened = createDataModule(storage, { latency: 0 })
    expect(await reopened.getPreferences()).toEqual(DEFAULT_PREFERENCES)
    // Feature 2: the name is capitalised and accounts carry reminder settings.
    expect(await reopened.getSession()).toEqual({
      kind: 'account',
      email: 'ana@example.com',
      name: 'Ana',
      settings: { remindDayBefore: true, remindToRate: true },
    })
    const list = await reopened.listRoutes()
    expect(list).toHaveLength(1)
    expect(list[0].saved).toBe(true)
    await reopened.logout()
    expect(await reopened.getSession()).toEqual({ kind: 'guest' })
    expect(await reopened.getPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('places, alternatives, rating and deletion', async () => {
    const { data, route } = await withRoute()
    const place = await data.getPlace('naranjos')
    expect(place).toMatchObject({ name: 'Plaza de los Naranjos', categories: expect.arrayContaining(['historia']) })
    const alternatives = await data.getAlternatives(route.id, 1)
    expect(alternatives).toHaveLength(3)
    expect(alternatives.map((a) => a.id)).not.toContain('naranjos')
    await data.rateRoute(route.id, { stars: 5, stops: { 1: true } })
    await data.deleteRoute(route.id)
    await expect(data.getRoute(route.id)).rejects.toThrow()
    await expect(data.getPlace('nope')).rejects.toThrow()
  })
})

/* ---------- feature 2 ---------- */

const TODAY = new Date(2026, 10, 24, 12) // Tue 24 Nov 2026

function setupAt(now = TODAY) {
  const storage = createStorage(memoryBackend())
  let n = 0
  const data = createDataModule(storage, { latency: 0, newId: () => `r${++n}`, now: () => now })
  return { storage, data }
}

describe('mock data module · feature 2', () => {
  it('login seeds three example routes relative to today (two upcoming, one past favourite with a rating)', async () => {
    const { data } = setupAt()
    await data.savePreferences(DEFAULT_PREFERENCES)
    const session = await data.login('marta@ejemplo.com', '12345678')
    expect(session).toMatchObject({ kind: 'account', name: 'Marta', settings: { remindDayBefore: true, remindToRate: true } })
    const routes = await data.listRoutes()
    expect(routes).toHaveLength(3)
    expect(routes.every((r) => r.saved)).toBe(true)
    // Newest first by request date.
    expect(routes.map((r) => r.request.date)).toEqual(['2026-12-20', '2026-12-06', '2026-11-14'])
    expect(routes.every((r) => r.request.city === 'Marbella')).toBe(true)
    const naranjos = routes[1]
    expect(naranjos.name).toBe('Marbella en 5 horas')
    expect(naranjos.stops).toHaveLength(4)
    expect(naranjos.stops[0]).toMatchObject({ name: 'Plaza de los Naranjos', arrive: '10:00' })
    expect(naranjos.stops.map((s) => s.name)).toContain('Mercado Municipal de Marbella')
    expect(routes[0].name).toBe('Puerto Banús con niños, día completo')
    expect(routes[0].request.start.label).toBe('Puerto Banús')
    expect(routes[0].stops).toHaveLength(5)
    const past = routes[2]
    expect(past.name).toBe('Paseo marítimo, tarde tranquila')
    expect(past.request.start.label).toBe('Parque de la Alameda')
    expect(routes.filter((r) => r.favorite).map((r) => r.id)).toEqual([past.id])
    expect(await data.getRating(past.id)).toMatchObject({ stars: 4 })
    expect(await data.getRating(naranjos.id)).toBeNull()
  })

  it('logging in again does not seed twice', async () => {
    const { data } = setupAt()
    await data.login('marta@ejemplo.com', '12345678')
    await data.logout()
    await data.login('marta@ejemplo.com', '12345678')
    expect(await data.listRoutes()).toHaveLength(3)
  })

  it('register does not seed; guests list nothing; unsaved routes are excluded', async () => {
    const { data } = setupAt()
    const route = await data.createRoute(localRequest)
    expect(await data.listRoutes()).toEqual([]) // guest
    await expect(data.saveRoute(route.id)).rejects.toThrow('GUEST_CANNOT_SAVE')
    await data.register('nuevo@ejemplo.com', '12345678')
    expect(await data.listRoutes()).toEqual([]) // account, but the route is not saved
    await data.saveRoute(route.id)
    expect((await data.listRoutes()).map((r) => r.id)).toEqual([route.id])
    await data.logout()
    expect(await data.listRoutes()).toEqual([])
    // Guests keep access to their route by id.
    expect((await data.getRoute(route.id)).id).toBe(route.id)
  })

  it('favourite toggle persists across versions', async () => {
    const { data } = setupAt()
    await data.register('a@ejemplo.com', '12345678')
    const route = await data.createRoute(localRequest)
    await data.refineRoute(route.id, { type: 'quick', value: 'anadir_pausa' })
    expect((await data.setFavorite(route.id, true)).favorite).toBe(true)
    expect((await data.undo(route.id)).favorite).toBe(true)
    expect((await data.setFavorite(route.id, false)).favorite).toBe(false)
  })

  it('rating round-trip and deletion removes it', async () => {
    const { data } = setupAt()
    const route = await data.createRoute(localRequest)
    expect(await data.getRating(route.id)).toBeNull()
    const rating = { stars: 3, stops: { 1: true, 3: false }, comment: 'Más tiempo en la Plaza de los Naranjos' }
    await data.rateRoute(route.id, rating)
    expect(await data.getRating(route.id)).toEqual(rating)
    await data.deleteRoute(route.id)
    expect(await data.getRating(route.id)).toBeNull()
  })

  it('updateAccount merges name, email and settings; guests cannot', async () => {
    const { data } = setupAt()
    await expect(data.updateAccount({ name: 'X' })).rejects.toThrow()
    await data.register('ana@ejemplo.com', '12345678')
    const next = await data.updateAccount({ name: 'Ana María', settings: { remindDayBefore: false, remindToRate: true } })
    expect(next).toEqual({ kind: 'account', email: 'ana@ejemplo.com', name: 'Ana María', settings: { remindDayBefore: false, remindToRate: true } })
    expect(await data.getSession()).toEqual(next)
  })

  it('deleteAccount clears session, routes, ratings and current route but keeps preferences', async () => {
    const { data, storage } = setupAt()
    await data.savePreferences(DEFAULT_PREFERENCES)
    await data.login('ana@ejemplo.com', '12345678')
    const [first] = await data.listRoutes()
    storage.write(STORAGE_KEYS.currentRoute, first.id)
    await data.deleteAccount()
    expect(await data.getSession()).toEqual({ kind: 'guest' })
    await expect(data.getRoute(first.id)).rejects.toThrow()
    expect(await data.getRating(first.id)).toBeNull()
    expect(storage.read(STORAGE_KEYS.currentRoute, 'none')).toBe('none')
    expect(await data.getPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('alternatives: three per stop, same kind first, none already in the route; pauses get none', async () => {
    const { data } = setupAt()
    await data.savePreferences(DEFAULT_PREFERENCES)
    const route = await data.createRoute(localRequest)
    const inRoute = new Set(route.stops.map((s) => s.placeId))
    for (const stop of route.stops) {
      const list = await data.getAlternatives(route.id, stop.order)
      expect(list).toHaveLength(3)
      expect(list.some((p) => inRoute.has(p.id))).toBe(false)
      for (const alt of list) expect(alt).toMatchObject({ visitMinutes: expect.any(Number), travel: { minutes: expect.any(Number) } })
    }
    // The market is the food stop: the other food place comes first.
    const market = route.stops.find((s) => s.placeId === 'mercado-central')!
    const forMarket = await data.getAlternatives(route.id, market.order)
    expect(forMarket[0].name).toBe('Puerto Deportivo de Marbella')
    const paused = await data.refineRoute(route.id, { type: 'quick', value: 'anadir_pausa' })
    const pause = paused.stops.find((s) => s.name === 'Pausa para café')
    expect(await data.getAlternatives(route.id, pause?.order ?? 0)).toEqual([])
  })

  it('only Marbella, a catalog start and known must-include places are accepted', async () => {
    const { data } = setupAt()
    await expect(data.createRoute({ ...localRequest, city: 'Valencia' })).rejects.toThrow(/Marbella/)
    await expect(data.createRoute({ ...localRequest, start: { label: 'Mi hotel' } })).rejects.toThrow(/Marbella/)
    await expect(data.createRoute({ ...localRequest, mustInclude: ['Sagrada Família'] })).rejects.toThrow('Lugar no encontrado')
    // Aliases work as a start and are normalised to the catalog name.
    const route = await data.createRoute({ ...localRequest, start: { label: 'salgo de la alameda' } })
    expect(route.request.start.label).toBe('Parque de la Alameda')
  })

  it('swapping a stop recalculates the following times', async () => {
    const { data } = setupAt()
    await data.savePreferences(DEFAULT_PREFERENCES)
    const route = await data.createRoute(localRequest)
    expect(route.stops.map((s) => s.arrive)).toEqual(['10:00', '10:23', '10:40', '11:02'])
    const swapped = await data.refineRoute(route.id, { type: 'swap_stop', order: 2, placeId: 'alameda' })
    expect(swapped.stops[1].name).toBe('Parque de la Alameda')
    expect(swapped.stops[1].visitMinutes).toBe(15)
    // Every arrival = previous arrival + visit + leg (legs around the swapped stop are re-linked).
    const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
    for (let i = 1; i < swapped.stops.length; i++) {
      const prev = swapped.stops[i - 1]
      expect(toMin(swapped.stops[i].arrive)).toBe(toMin(prev.arrive) + prev.visitMinutes + (prev.travelToNext?.minutes ?? 0))
    }
    expect(swapped.stops.map((s) => s.arrive)).not.toEqual(route.stops.map((s) => s.arrive))
  })
})

describe('mock data module · saved routes belong to the account', () => {
  it('another account does not see them and still gets the examples; deleting a route frees it', async () => {
    const { data } = setupAt()
    const route = await data.createRoute(localRequest)
    await data.register('ana@ejemplo.com', '12345678')
    await data.saveRoute(route.id)
    await data.logout()
    await data.login('marta@ejemplo.com', '12345678')
    const marta = await data.listRoutes()
    expect(marta).toHaveLength(3)
    expect(marta.map((r) => r.id)).not.toContain(route.id)
    await data.logout()
    await data.login('ana@ejemplo.com', '12345678')
    expect((await data.listRoutes()).map((r) => r.id)).toEqual([route.id])
    const renamed = await data.updateAccount({ email: 'ana.m@ejemplo.com' })
    expect(renamed.email).toBe('ana.m@ejemplo.com')
    expect((await data.listRoutes()).map((r) => r.id)).toEqual([route.id])
  })
})
