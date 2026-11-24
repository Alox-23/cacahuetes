import { describe, expect, it } from 'vitest'
import type { Route } from '../contract/types'
import { filterRoutes, isUpcoming } from './routeFilters'
import { routeSubtitle, routeTags, stopDetail, formatVisit } from './routeText'
import { buildShareText, shareRoute } from './share'
import { tabForPath } from './tabs'
import { reuseRequest } from '../state/AppState'
import { DEFAULT_PREFERENCES } from '../data/defaults'

const TODAY = new Date(2026, 10, 24, 12)

function route(partial: Partial<Route> & { city: string; date: string }): Route {
  return {
    id: partial.id ?? partial.city,
    name: partial.name ?? `${partial.city} en 5 horas`,
    request: {
      city: partial.city,
      date: partial.date,
      timeWindow: { from: '10:00', to: '15:00' },
      start: { label: 'Mi hotel' },
      mustInclude: [],
      ...(partial.request ?? {}),
    },
    stops: partial.stops ?? [
      { order: 1, placeId: 'a', name: 'Sagrada Família', arrive: '10:00', visitMinutes: 75, travelToNext: { mode: 'transporte_publico', minutes: 20 }, locked: false },
      { order: 2, placeId: 'b', name: 'Barri Gòtic', arrive: '11:35', visitMinutes: 45, locked: false },
    ],
    version: 1,
    saved: true,
    favorite: partial.favorite ?? false,
  }
}

describe('routeFilters', () => {
  const routes = [
    route({ city: 'Barcelona', date: '2026-12-06' }),
    route({ city: 'Valencia', date: '2026-12-20' }),
    route({ city: 'Sevilla', date: '2026-11-14', favorite: true }),
    route({ city: 'Málaga', date: '2026-11-24' }),
  ]

  it('today counts as upcoming', () => {
    expect(isUpcoming(routes[3], TODAY)).toBe(true)
    expect(isUpcoming(routes[2], TODAY)).toBe(false)
  })

  it('splits by tab and searches the city accent-insensitively', () => {
    // Upcoming routes are listed soonest first, as in MisRutas.html.
    expect(filterRoutes(routes, 'upcoming', '', TODAY).map((r) => r.request.city)).toEqual(['Málaga', 'Barcelona', 'Valencia'])
    expect(filterRoutes(routes, 'past', '', TODAY).map((r) => r.request.city)).toEqual(['Sevilla'])
    expect(filterRoutes(routes, 'favorites', '', TODAY).map((r) => r.request.city)).toEqual(['Sevilla'])
    expect(filterRoutes(routes, 'upcoming', 'Val', TODAY).map((r) => r.request.city)).toEqual(['Valencia'])
    expect(filterRoutes(routes, 'upcoming', 'mala', TODAY).map((r) => r.request.city)).toEqual(['Málaga'])
    expect(filterRoutes(routes, 'past', 'Val', TODAY)).toEqual([])
  })
})

describe('route text', () => {
  it('formats compact visits and stop details as in Ruta.html', () => {
    expect(formatVisit(75)).toBe('1 h 15')
    expect(formatVisit(60)).toBe('1 h')
    expect(formatVisit(50)).toBe('50 min')
    const r = route({ city: 'Barcelona', date: '2026-12-05' })
    expect(stopDetail(r.stops[0])).toBe('Visita 1 h 15 · luego 20 min en metro')
    expect(stopDetail(r.stops[1], 'walk')).toBe('Paseo 45 min · fin de la ruta')
    expect(stopDetail({ ...r.stops[1], visitMinutes: 60 }, 'food')).toBe('Comida 1 h · fin de la ruta')
    expect(routeSubtitle(r, DEFAULT_PREFERENCES)).toBe('2 paradas · 10:00 a 12:20 · a pie y metro')
  })

  it('card tags come from request interests, then company or transport overrides', () => {
    expect(routeTags(route({ city: 'B', date: '2026-12-05', request: { overrides: { interests: ['arquitectura', 'gastronomia'] } } as never }), null)).toBe('arquitectura, gastronomía')
    expect(routeTags(route({ city: 'V', date: '2026-12-05', request: { overrides: { company: 'con_ninos' } } as never }), null)).toBe('con niños')
    expect(routeTags(route({ city: 'S', date: '2026-12-05', request: { overrides: { pace: 'relajado', transport: ['a_pie'] } } as never }), null)).toBe('a pie')
  })
})

describe('share', () => {
  const r = route({ city: 'Barcelona', date: '2026-12-05' })

  it('builds a plain-text summary with date, window and numbered stops', () => {
    expect(buildShareText(r)).toBe(
      ['Barcelona en 5 horas', 'Sáb 5 dic · 10:00 a 12:20', '', '1. 10:00 · Sagrada Família', '2. 11:35 · Barri Gòtic', '', 'Ruta creada con [NOMBRE APP]'].join('\n'),
    )
  })

  it('uses navigator.share, falls back to the clipboard, reports cancel and failure', async () => {
    const shared: string[] = []
    expect(await shareRoute(r, { share: async (d) => void shared.push(d.text ?? '') })).toBe('shared')
    expect(shared[0]).toContain('Sagrada Família')
    const copied: string[] = []
    expect(await shareRoute(r, { clipboard: { writeText: async (t) => void copied.push(t) } })).toBe('copied')
    expect(copied[0]).toBe(buildShareText(r))
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    expect(await shareRoute(r, { share: () => Promise.reject(abort) })).toBe('cancelled')
    expect(await shareRoute(r, { share: () => Promise.reject(new Error('no')), clipboard: { writeText: async () => {} } })).toBe('copied')
    expect(await shareRoute(r, {}, () => false)).toBe('failed')
    expect(await shareRoute(r, { clipboard: { writeText: () => Promise.reject(new Error('denied')) } }, () => true)).toBe('copied')
  })
})

describe('tabs and reuse', () => {
  it('maps every section to its tab', () => {
    expect(tabForPath('/my-routes/r1/rate')).toBe('routes')
    for (const p of ['/profile', '/preferences', '/account', '/login', '/register']) expect(tabForPath(p)).toBe('profile')
    expect(tabForPath('/route/r1/save')).toBe('assistant')
    expect(tabForPath('/registered')).toBe('assistant')
  })

  it('a past date moves to the next same weekday; future dates stay', () => {
    const base = route({ city: 'Sevilla', date: '2026-11-14' }).request // a Saturday
    expect(reuseRequest(base, TODAY).date).toBe('2026-11-28')
    expect(reuseRequest({ ...base, date: '2026-12-06' }, TODAY).date).toBe('2026-12-06')
  })
})
