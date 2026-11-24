/*
 * The three example saved routes seeded when an "existing account" logs in
 * (tech spec feature 2 §3 and §6). Dates are relative to today so Próximas
 * and Pasadas always have content. Never seeded on register or for guests.
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
        city: 'Barcelona',
        date: isoDate(addDays(today, 12)),
        timeWindow: { from: '10:00', to: '15:00' },
        start: { label: t('request.opt_start_hotel') },
        mustInclude: ['Sagrada Família'],
        overrides: { interests: ['arquitectura', 'gastronomia'] },
      },
      favorite: false,
    },
    {
      request: {
        city: 'Valencia',
        date: isoDate(addDays(today, 26)),
        timeWindow: { from: '09:30', to: '18:00' },
        start: { label: t('request.opt_start_current') },
        mustInclude: [],
        overrides: { company: 'con_ninos' },
      },
      name: t('seeds.valencia'),
      favorite: false,
    },
    {
      request: {
        city: 'Sevilla',
        date: isoDate(addDays(today, -10)),
        timeWindow: { from: '16:00', to: '20:00' },
        start: { label: t('request.opt_start_hotel') },
        mustInclude: [],
        overrides: { pace: 'relajado', transport: ['a_pie'] },
      },
      name: t('seeds.sevilla'),
      favorite: true,
      rating: { stars: 4, stops: { 1: true, 2: true, 3: false } },
    },
  ]
}
