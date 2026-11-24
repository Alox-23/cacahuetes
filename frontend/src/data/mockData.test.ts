import { describe, expect, it } from 'vitest'
import type { RouteRequest } from '../contract/types'
import { routeEnd } from '../lib/route'
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
    expect(route.stops.map(s => s.placeId)).toContain('grabado')
    const next = await data.refineRoute(route.id, { type: 'quick', value: 'mas_barato' })
    expect(next.stops.map(s => s.placeId)).not.toContain('grabado')
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
    expect(await reopened.getSession()).toEqual({ kind: 'account', email: 'ana@example.com', name: 'ana' })
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
