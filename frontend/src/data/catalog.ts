/*
 * Catalog: the Marbella landmarks shared with the backend (`backend/lib/marbella.json`).
 * Place names are proper nouns and `why` texts are catalog content (not UI copy).
 * Travel legs are estimated from coordinates; see `legBetween`.
 */
import points from '../../../backend/lib/marbella.json'
import { isMarbella } from '../../../backend/lib/marbella-scope.js'
import type { Place } from '../contract/types'
import { t } from '../i18n'
import { normalize } from '../lib/text'

export type PlaceKind = 'sight' | 'food' | 'pause'

/** How a stop is described on the route ("Visita 1 h", "Paseo 45 min", "Comida 1 h", "Pausa 20 min"). */
export type PlaceActivity = 'visit' | 'walk' | 'food' | 'pause'

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
  /** Stop description; defaults from `kind` (food → food, pause → pause, otherwise visit). */
  activity?: PlaceActivity
  /** Only offered as an alternative in "Cambiar parada", never picked by createRoute. */
  altOnly?: boolean
  /** Hand-written alternatives (place ids), offered first in "Cambiar parada". */
  alternatives?: string[]
}

export type Leg = { walk: number; transit: number }

export type CityCatalog = {
  city: string
  places: CatalogPlace[]
}

/** Walk from a stop to a café next to it. */
export const PAUSE_LEG: Leg = { walk: 3, transit: 3 }
export const PAUSE_MINUTES = 20

const places: CatalogPlace[] = points.map((p, order) => ({
  ...p, city: 'Marbella', kind: p.kind === 'food' ? 'food' : 'sight',
  why: p.description, paid: p.budget !== 'gratis', order, kids: p.tags.includes('familia'),
}))
places.push({
  city: 'Marbella', id: 'marbella-cafe', name: t('data.pauseName'), categories: ['gastronomia'],
  kind: 'pause', visitMinutes: PAUSE_MINUTES, paid: true, aliases: [], order: places.length,
})
const catalog: CityCatalog = { city: 'Marbella', places }

/** The only destination is Marbella; any other city throws `request.localOnly`. */
export function getCityCatalog(city: string): CityCatalog {
  if (!isMarbella(city)) throw new Error(t('request.localOnly'))
  return catalog
}

export function findPlace(id: string): CatalogPlace | undefined {
  return places.find(p => p.id === id)
}

export function activityOf(place: CatalogPlace): PlaceActivity {
  if (place.activity) return place.activity
  return place.kind === 'food' ? 'food' : place.kind === 'pause' ? 'pause' : 'visit'
}

/** Walking estimate from coordinates (1.35 detour factor, 15 min per km); transit is half of that. */
export function legBetween(catalog: CityCatalog, from: string, to: string): Leg {
  const a = catalog.places.find(p => p.id === from)
  const b = catalog.places.find(p => p.id === to)
  if (a?.lat == null || b?.lat == null || a.lon == null || b.lon == null) return PAUSE_LEG
  const rad = Math.PI / 180
  const km = 111.2 * Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos(a.lat * rad))
  const walk = Math.ceil(km * 1.35 * 15)
  return { walk, transit: Math.max(1, Math.ceil(walk / 2)) }
}

/** Catalog places whose name or alias appears in the text. */
export function placesMentioned(text: string, ignoreAliases: Set<string> = new Set()): CatalogPlace[] {
  const norm = ' ' + normalize(text) + ' '
  return places.filter(p => p.kind !== 'pause' && [p.name, ...p.aliases.filter(a => !ignoreAliases.has(a))]
    .some(label => norm.includes(' ' + normalize(label) + ' ')))
}

/** Does a must-include label (e.g. "Tapas", "Plaza de los Naranjos") refer to this place? */
export function matchesMustInclude(place: CatalogPlace, label: string): boolean {
  return [place.name, ...place.aliases].some(alias => normalize(alias) === normalize(label))
}
