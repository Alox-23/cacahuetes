/*
 * The three example saved routes seeded when an "existing account" logs in
 * (tech spec feature 2 §3 and §6). Dates are relative to today so Próximas
 * and Pasadas always have content. Never seeded on register or for guests.
 * All of them are Marbella routes starting from a catalog place (the only
 * destination the catalog knows, see `data/catalog.ts`).
 */
import type { Rating, RouteRequest } from '../contract/types'
import { t } from '../i18n'
import { addDays, isoDate } from '../lib/time'

export type SeedRoute = {
  request: RouteRequest
  /** Overrides the generated route name. */
  name?: string
  favorite: boolean
  rating?: Rating
}

export function exampleRoutes(today: Date): SeedRoute[] {
  return [
    {
      request: {
        city: 'Marbella',
        date: isoDate(addDays(today, 12)),
        timeWindow: { from: '10:00', to: '15:00' },
        start: { label: 'Plaza de los Naranjos' },
        mustInclude: ['Plaza de los Naranjos', 'Tapas'],
        overrides: { interests: ['arquitectura', 'gastronomia'] },
      },
      favorite: false,
    },
    {
      request: {
        city: 'Marbella',
        date: isoDate(addDays(today, 26)),
        timeWindow: { from: '09:30', to: '18:00' },
        start: { label: 'Puerto Banús' },
        mustInclude: [],
        overrides: { company: 'con_ninos' },
      },
      name: t('seeds.banus'),
      favorite: false,
    },
    {
      request: {
        city: 'Marbella',
        date: isoDate(addDays(today, -10)),
        timeWindow: { from: '16:00', to: '20:00' },
        start: { label: 'Parque de la Alameda' },
        mustInclude: [],
        overrides: { pace: 'relajado', transport: ['a_pie'] },
      },
      name: t('seeds.alameda'),
      favorite: true,
      rating: { stars: 4, stops: { 1: true, 2: true, 3: false } },
    },
  ]
}
