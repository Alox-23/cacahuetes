import points from '../../../backend/lib/marbella.json'
import { isMarbella } from '../../../backend/lib/marbella-scope.js'
import type { Place } from '../contract/types'
import { t } from '../i18n'
import { normalize } from '../lib/text'

export type PlaceKind = 'sight' | 'food' | 'pause'

export type CatalogPlace = Place & {
  city: string
  lat?: number
  lon?: number
  kind: PlaceKind
  visitMinutes: number
  paid: boolean
  /** Extra normalized phrases that identify the place in free text. */
  aliases: string[]
  /** Rough geographic order inside the city, keeps routes sensible. */
  order: number
  /** Good for families (company "con_ninos"). */
  kids?: boolean
}

export type Leg = { walk: number; transit: number }

export type CityCatalog = {
  city: string
  places: CatalogPlace[]

}


export const PAUSE_LEG: Leg = { walk: 3, transit: 3 }

const places: CatalogPlace[] = points.map((p, order) => ({
  ...p, city: 'Marbella', kind: p.kind === 'food' ? 'food' : 'sight',
  why: p.description, paid: p.budget !== 'gratis', order, kids: p.tags.includes('familia'),
}))
places.push({
  city: 'Marbella', id: 'marbella-cafe', name: t('data.pauseName'), categories: ['gastronomia'],
  kind: 'pause', visitMinutes: 20, paid: true, aliases: [], order: places.length,
})
const catalog = { city: 'Marbella', places }

export function getCityCatalog(city: string): CityCatalog {
  if (!isMarbella(city)) throw new Error(t('request.localOnly'))
  return catalog
}

export function findPlace(id: string) {
  return places.find(p => p.id === id)
}

export function legBetween(catalog: CityCatalog, from: string, to: string): Leg {
  const a = catalog.places.find(p => p.id === from)
  const b = catalog.places.find(p => p.id === to)
  if (a?.lat == null || b?.lat == null || a.lon == null || b.lon == null) return PAUSE_LEG
  const rad = Math.PI / 180
  const km = 111.2 * Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos(a.lat * rad))
  const walk = Math.ceil(km * 1.35 * 15)
  return { walk, transit: Math.max(1, Math.ceil(walk / 2)) }
}

export function placesMentioned(text: string, ignoreAliases: Set<string> = new Set()): CatalogPlace[] {
  const norm = ' ' + normalize(text) + ' '
  return places.filter(p => p.kind !== 'pause' && [p.name, ...p.aliases.filter(a => !ignoreAliases.has(a))]
    .some(label => norm.includes(' ' + normalize(label) + ' ')))
}

export function matchesMustInclude(place: CatalogPlace, label: string): boolean {
  return [place.name, ...place.aliases].some(alias => normalize(alias) === normalize(label))
}
