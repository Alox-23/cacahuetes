import { describe, expect, it } from 'vitest'
import type { RouteRequest } from '../contract/types'
import { routeEnd } from '../lib/route'
import { findPlace } from './catalog'
import { DEFAULT_PREFERENCES } from './defaults'
import { createDataModule } from './mockData'
import { STORAGE_KEYS, createStorage, memoryBackend } from './storage'

const bcnRequest: RouteRequest = {
  city: 'Barcelona',
  date: '2026-12-05',
  timeWindow: { from: '10:00', to: '15:00' },
  start: { label: 'Mi hotel' },
  mustInclude: ['Sagrada Família', 'Tapas'],
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
  const route = await ctx.data.createRoute(bcnRequest)
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

  it('creates a scheduled Barcelona route favouring must-include places', async () => {
    const { route } = await withRoute()
    expect(route.name).toBe('Barcelona en 5 horas')
    expect(route.version).toBe(1)
    expect(route.saved).toBe(false)
    expect(route.favorite).toBe(false)
    expect(route.stops.map((s) => s.name)).toEqual(['Sagrada Família', 'Casa Batlló', 'Mercat de la Boqueria', 'Bar del Pla'])
    expect(route.stops.map((s) => s.arrive)).toEqual(['10:00', '11:40', '13:00', '14:15'])
    expect(route.stops.map((s) => s.order)).toEqual([1, 2, 3, 4])
    expect(route.stops[1].travelToNext).toEqual({ mode: 'a_pie', minutes: 20 })
    expect(route.stops[3].travelToNext).toBeUndefined()
    expect(routeEnd(route)).toBe('15:00')
  })

  it('uses four generic places for cities without catalog', async () => {
    const { data } = setup()
    const route = await data.createRoute({ ...bcnRequest, city: 'Bilbao', mustInclude: [], overrides: undefined })
    expect(route.stops).toHaveLength(4)
    expect(route.stops.map((s) => s.name).sort()).toEqual(['Centro histórico', 'Mercado central', 'Mirador', 'Parque principal'].sort())
  })

  it('names full-day routes "Un día en …" and picks five places', async () => {
    const { data } = setup()
    const route = await data.createRoute({
      ...bcnRequest,
      city: 'Valencia',
      timeWindow: { from: '10:00', to: '19:00' },
      mustInclude: [],
      overrides: { company: 'con_ninos' },
    })
    expect(route.name).toBe('Un día en Valencia')
    expect(route.stops).toHaveLength(5)
  })

  it('builds the Valencia and Sevilla suggestion routes inside their windows', async () => {
    const { data } = setup()
    await data.savePreferences(DEFAULT_PREFERENCES)
    const vlc = await data.createRoute({ ...bcnRequest, city: 'Valencia', timeWindow: { from: '10:00', to: '19:00' }, mustInclude: [], overrides: { company: 'con_ninos' } })
    expect(vlc.stops.map((s) => s.name)).toContain('Oceanogràfic')
    expect(routeEnd(vlc) <= '19:00').toBe(true)
    const svq = await data.createRoute({ ...bcnRequest, city: 'Sevilla', timeWindow: { from: '16:00', to: '20:00' }, mustInclude: [], overrides: { pace: 'relajado', transport: ['a_pie'] } })
    expect(svq.name).toBe('Sevilla en 4 horas')
    expect(svq.stops).toHaveLength(4)
    expect(svq.stops.slice(0, -1).every((s) => s.travelToNext?.mode === 'a_pie')).toBe(true)
    expect(routeEnd(svq) <= '20:00').toBe(true)
  })

  it('fits visits into short windows', async () => {
    const { data } = setup()
    const route = await data.createRoute({ ...bcnRequest, timeWindow: { from: '10:00', to: '13:00' } })
    expect(routeEnd(route) <= '13:05').toBe(true)
  })

  it('menos_caminar turns long walks into public transport', async () => {
    const { data, route } = await withRoute()
    const next = await data.refineRoute(route.id, { type: 'quick', value: 'menos_caminar' })
    expect(next.version).toBe(2)
    expect(next.stops[1].travelToNext).toEqual({ mode: 'transporte_publico', minutes: 10 })
    expect(next.stops[2].arrive).toBe('12:50')
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
    expect(next.stops.map((s) => s.name)).toContain('Cal Pep')
  })

  it('mas_barato replaces the first paid place that is not a must-include with a free one', async () => {
    const { data, route } = await withRoute()
    const next = await data.refineRoute(route.id, { type: 'quick', value: 'mas_barato' })
    // Sagrada Família is in mustInclude, so it stays; Casa Batlló (paid) is the one replaced.
    expect(next.stops[0].name).toBe('Sagrada Família')
    expect(next.stops.map((s) => s.name)).not.toContain('Casa Batlló')
    expect(next.stops.some((s) => !findPlace(s.placeId)?.paid && s.order === 2)).toBe(true)
  })

  it('a text action can apply several changes in one version', async () => {
    const { data, route } = await withRoute()
    const next = await data.refineRoute(route.id, { type: 'text', value: 'Menos caminar, y añade una pausa para café.' })
    expect(next.version).toBe(2)
    expect(next.stops.some((s) => s.name === 'Pausa para café')).toBe(true)
    expect(next.stops[1].travelToNext?.mode).toBe('a_pie') // Batlló → pause, 3 min walk
  })

  it('lock, remove and swap stops', async () => {
    const { data, route } = await withRoute()
    let next = await data.refineRoute(route.id, { type: 'lock_stop', order: 1 })
    expect(next.stops[0].locked).toBe(true)
    next = await data.refineRoute(route.id, { type: 'remove_stop', order: 4 })
    expect(next.stops).toHaveLength(3)
    next = await data.refineRoute(route.id, { type: 'swap_stop', order: 3, placeId: 'bcn-barri-gotic' })
    expect(next.stops[2].name).toBe('Barri Gòtic')
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
    const place = await data.getPlace('bcn-sagrada-familia')
    expect(place).toMatchObject({ name: 'Sagrada Família', hours: '[HORARIO]', price: '[PRECIO]' })
    const alternatives = await data.getAlternatives(route.id, 1)
    expect(alternatives).toHaveLength(3)
    expect(alternatives.map((a) => a.id)).not.toContain('bcn-sagrada-familia')
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
    expect(routes.map((r) => r.request.city)).toEqual(['Valencia', 'Barcelona', 'Sevilla'])
    const bcn = routes[1]
    expect(bcn.name).toBe('Barcelona en 5 horas')
    expect(bcn.stops.map((s) => s.name)).toEqual(['Sagrada Família', 'Casa Batlló', 'Mercat de la Boqueria', 'Barri Gòtic'])
    expect(bcn.stops[0].arrive).toBe('10:00')
    expect(routes[0].name).toBe('Valencia, día completo')
    const past = routes[2]
    expect(past.name).toBe('Sevilla, tarde tranquila')
    expect(routes.filter((r) => r.favorite).map((r) => r.id)).toEqual([past.id])
    expect(await data.getRating(past.id)).toMatchObject({ stars: 4 })
    expect(await data.getRating(bcn.id)).toBeNull()
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
    const route = await data.createRoute(bcnRequest)
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
    const route = await data.createRoute(bcnRequest)
    await data.refineRoute(route.id, { type: 'quick', value: 'anadir_pausa' })
    expect((await data.setFavorite(route.id, true)).favorite).toBe(true)
    expect((await data.undo(route.id)).favorite).toBe(true)
    expect((await data.setFavorite(route.id, false)).favorite).toBe(false)
  })

  it('rating round-trip and deletion removes it', async () => {
    const { data } = setupAt()
    const route = await data.createRoute(bcnRequest)
    expect(await data.getRating(route.id)).toBeNull()
    const rating = { stars: 3, stops: { 1: true, 3: false }, comment: 'Más tiempo en la Sagrada Família' }
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

  it('alternatives: Casa Batlló gets the hand-written three, none already in the route; pauses get none', async () => {
    const { data } = setupAt()
    await data.savePreferences(DEFAULT_PREFERENCES)
    const route = await data.createRoute(bcnRequest)
    const alts = await data.getAlternatives(route.id, 2)
    expect(alts.map((p) => p.name)).toEqual(['Casa Milà, La Pedrera', 'Palau de la Música Catalana', 'Casa Vicens'])
    expect(alts[0]).toMatchObject({ visitMinutes: 50, travel: { mode: 'a_pie', minutes: 6 } })
    expect(alts[2]).toMatchObject({ visitMinutes: 45, travel: { mode: 'transporte_publico', minutes: 12 } })
    const inRoute = new Set(route.stops.map((s) => s.placeId))
    for (const order of [1, 3, 4]) {
      const list = await data.getAlternatives(route.id, order)
      expect(list).toHaveLength(3)
      expect(list.some((p) => inRoute.has(p.id))).toBe(false)
    }
    const paused = await data.refineRoute(route.id, { type: 'quick', value: 'anadir_pausa' })
    const pause = paused.stops.find((s) => s.name === 'Pausa para café')
    expect(await data.getAlternatives(route.id, pause?.order ?? 0)).toEqual([])
  })

  it('alternative-only places never join a new route unless asked for', async () => {
    const { data } = setupAt()
    const route = await data.createRoute({ ...bcnRequest, mustInclude: [], timeWindow: { from: '10:00', to: '19:00' } })
    expect(route.stops.map((s) => s.placeId)).not.toContain('bcn-casa-mila')
    const asked = await data.createRoute({ ...bcnRequest, mustInclude: ['La Pedrera'] })
    expect(asked.stops.map((s) => s.placeId)).toContain('bcn-casa-mila')
  })

  it('swapping a stop recalculates the following times', async () => {
    const { data } = setupAt()
    await data.savePreferences(DEFAULT_PREFERENCES)
    const route = await data.createRoute(bcnRequest)
    expect(route.stops.map((s) => s.arrive)).toEqual(['10:00', '11:40', '13:00', '14:15'])
    const swapped = await data.refineRoute(route.id, { type: 'swap_stop', order: 2, placeId: 'bcn-casa-mila' })
    expect(swapped.stops[1].name).toBe('Casa Milà, La Pedrera')
    expect(swapped.stops[1].visitMinutes).toBe(50)
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
    const route = await data.createRoute(bcnRequest)
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
