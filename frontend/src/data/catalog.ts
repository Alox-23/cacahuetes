/*
 * Mock catalog: cities, places, travel legs.
 * Place names are proper nouns and `why` texts are sample content (not UI copy).
 * Hours and prices stay as the package placeholders [HORARIO] / [PRECIO].
 */
import type { Place } from '../contract/types'
import { t } from '../i18n'
import { normalize } from '../lib/text'

export type PlaceKind = 'sight' | 'food' | 'pause'

export type CatalogPlace = Place & {
  city: string
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
  /** Keyed "idA|idB" (either direction). */
  legs: Record<string, Leg>
}

export const DEFAULT_LEG: Leg = { walk: 15, transit: 8 }
/** Walk from a stop to a café next to it. */
export const PAUSE_LEG: Leg = { walk: 3, transit: 3 }
export const PAUSE_MINUTES = 20

const H = '[HORARIO]'
const P = '[PRECIO]'

type PlaceSeed = Omit<CatalogPlace, 'city' | 'hours' | 'price'>

function city(name: string, seeds: PlaceSeed[], legs: Record<string, Leg>): CityCatalog {
  return {
    city: name,
    places: seeds.map((s) => ({ ...s, city: name, hours: H, price: P })),
    legs,
  }
}

const barcelona = city(
  'Barcelona',
  [
    { id: 'bcn-sagrada-familia', name: 'Sagrada Família', categories: ['arquitectura', 'historia'], why: 'La obra maestra de Gaudí, imprescindible por dentro y por fuera.', kind: 'sight', visitMinutes: 90, paid: true, aliases: ['sagrada familia', 'sagrada'], order: 1 },
    { id: 'bcn-casa-batllo', name: 'Casa Batlló', categories: ['arquitectura', 'museos'], why: 'Fachada modernista única en el paseo de Gràcia.', kind: 'sight', visitMinutes: 60, paid: true, aliases: ['casa batllo', 'batllo'], order: 2 },
    { id: 'bcn-boqueria', name: 'Mercat de la Boqueria', categories: ['gastronomia', 'compras'], why: 'El mercado más famoso de la ciudad, junto a la Rambla.', kind: 'sight', visitMinutes: 60, paid: false, aliases: ['boqueria', 'mercat de la boqueria'], order: 3 },
    { id: 'bcn-bar-del-pla', name: 'Bar del Pla', categories: ['gastronomia'], why: 'Tapas de temporada en el Born.', kind: 'food', visitMinutes: 45, paid: true, aliases: ['bar del pla', 'tapas'], order: 4 },
    { id: 'bcn-barri-gotic', name: 'Barri Gòtic', categories: ['historia', 'arquitectura'], why: 'Callejuelas medievales, la catedral y plazas escondidas.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['barri gotic', 'barrio gotico', 'gotico'], order: 5, kids: true },
    { id: 'bcn-museu-picasso', name: 'Museu Picasso', categories: ['museos', 'arte_urbano'], why: 'La colección más completa de los años de formación de Picasso.', kind: 'sight', visitMinutes: 60, paid: true, aliases: ['museu picasso', 'museo picasso', 'picasso'], order: 6 },
    { id: 'bcn-cal-pep', name: 'Cal Pep', categories: ['gastronomia'], why: 'Barra clásica de pescado y marisco.', kind: 'food', visitMinutes: 45, paid: true, aliases: ['cal pep'], order: 6.5 },
    { id: 'bcn-ciutadella', name: 'Parc de la Ciutadella', categories: ['naturaleza'], why: 'Un respiro verde con lago y cascada monumental.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['ciutadella', 'ciudadela', 'parc de la ciutadella'], order: 7, kids: true },
    { id: 'bcn-cafe', name: t('data.pauseName'), categories: ['gastronomia'], why: 'Un café tranquilo para recargar.', kind: 'pause', visitMinutes: PAUSE_MINUTES, paid: true, aliases: [], order: 99 },
  ],
  {
    'bcn-sagrada-familia|bcn-casa-batllo': { walk: 30, transit: 10 },
    'bcn-casa-batllo|bcn-boqueria': { walk: 20, transit: 10 },
    'bcn-boqueria|bcn-bar-del-pla': { walk: 15, transit: 8 },
    'bcn-boqueria|bcn-barri-gotic': { walk: 10, transit: 6 },
    'bcn-barri-gotic|bcn-bar-del-pla': { walk: 8, transit: 6 },
    'bcn-bar-del-pla|bcn-museu-picasso': { walk: 5, transit: 5 },
    'bcn-museu-picasso|bcn-ciutadella': { walk: 10, transit: 6 },
    'bcn-barri-gotic|bcn-museu-picasso': { walk: 8, transit: 6 },
    'bcn-sagrada-familia|bcn-barri-gotic': { walk: 35, transit: 15 },
    'bcn-casa-batllo|bcn-barri-gotic': { walk: 22, transit: 10 },
    'bcn-barri-gotic|bcn-ciutadella': { walk: 15, transit: 8 },
  },
)

const valencia = city(
  'Valencia',
  [
    { id: 'vlc-barrio-carmen', name: 'Barrio del Carmen', categories: ['historia', 'arte_urbano'], why: 'Casco antiguo con murales y torres medievales.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['barrio del carmen', 'el carmen'], order: 1 },
    { id: 'vlc-catedral', name: 'Catedral y Miguelete', categories: ['historia', 'arquitectura'], why: 'Sube al Miguelete para ver toda la ciudad.', kind: 'sight', visitMinutes: 45, paid: true, aliases: ['catedral', 'miguelete'], order: 2 },
    { id: 'vlc-mercado-central', name: 'Mercado Central', categories: ['gastronomia', 'compras', 'arquitectura'], why: 'Modernismo valenciano lleno de producto local.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['mercado central'], order: 3, kids: true },
    { id: 'vlc-horchateria', name: 'Horchatería Santa Catalina', categories: ['gastronomia'], why: 'Horchata y fartons de toda la vida.', kind: 'food', visitMinutes: 30, paid: true, aliases: ['horchateria', 'horchata'], order: 3.5, kids: true },
    { id: 'vlc-turia', name: 'Jardín del Turia', categories: ['naturaleza'], why: 'Un parque de nueve kilómetros en el antiguo cauce del río.', kind: 'sight', visitMinutes: 60, paid: false, aliases: ['turia', 'jardin del turia'], order: 4, kids: true },
    { id: 'vlc-ciudad-artes', name: 'Ciudad de las Artes y las Ciencias', categories: ['arquitectura', 'museos'], why: 'La Valencia futurista de Calatrava.', kind: 'sight', visitMinutes: 120, paid: true, aliases: ['ciudad de las artes', 'ciutat de les arts'], order: 5, kids: true },
    { id: 'vlc-oceanografic', name: 'Oceanogràfic', categories: ['naturaleza', 'museos'], why: 'El acuario más grande de Europa.', kind: 'sight', visitMinutes: 150, paid: true, aliases: ['oceanografic', 'acuario'], order: 6, kids: true },
    { id: 'vlc-la-pepica', name: 'La Pepica', categories: ['gastronomia'], why: 'Paella frente a la playa de la Malvarrosa.', kind: 'food', visitMinutes: 60, paid: true, aliases: ['la pepica', 'paella'], order: 7, kids: true },
    { id: 'vlc-cafe', name: t('data.pauseName'), categories: ['gastronomia'], why: 'Un café tranquilo para recargar.', kind: 'pause', visitMinutes: PAUSE_MINUTES, paid: true, aliases: [], order: 99 },
  ],
  {
    'vlc-barrio-carmen|vlc-catedral': { walk: 8, transit: 6 },
    'vlc-catedral|vlc-mercado-central': { walk: 8, transit: 6 },
    'vlc-mercado-central|vlc-turia': { walk: 15, transit: 8 },
    'vlc-turia|vlc-ciudad-artes': { walk: 25, transit: 12 },
    'vlc-ciudad-artes|vlc-oceanografic': { walk: 10, transit: 6 },
    'vlc-oceanografic|vlc-la-pepica': { walk: 40, transit: 20 },
    'vlc-mercado-central|vlc-ciudad-artes': { walk: 35, transit: 15 },
  },
)

const sevilla = city(
  'Sevilla',
  [
    { id: 'svq-setas', name: 'Metropol Parasol', categories: ['arquitectura', 'arte_urbano'], why: 'Las Setas: madera y vistas sobre los tejados.', kind: 'sight', visitMinutes: 30, paid: true, aliases: ['setas', 'metropol parasol'], order: 1 },
    { id: 'svq-catedral', name: 'Catedral y Giralda', categories: ['historia', 'arquitectura'], why: 'La catedral gótica más grande del mundo.', kind: 'sight', visitMinutes: 75, paid: true, aliases: ['catedral', 'giralda'], order: 2 },
    { id: 'svq-alcazar', name: 'Real Alcázar', categories: ['historia', 'arquitectura', 'naturaleza'], why: 'Palacios mudéjares y jardines de cuento.', kind: 'sight', visitMinutes: 90, paid: true, aliases: ['alcazar', 'real alcazar'], order: 3 },
    { id: 'svq-santa-cruz', name: 'Barrio de Santa Cruz', categories: ['historia'], why: 'La antigua judería, blanca y laberíntica.', kind: 'sight', visitMinutes: 40, paid: false, aliases: ['santa cruz', 'barrio de santa cruz'], order: 4, kids: true },
    { id: 'svq-bodega', name: 'Bodega Santa Cruz', categories: ['gastronomia'], why: 'Tapas de pie, como manda la tradición.', kind: 'food', visitMinutes: 40, paid: true, aliases: ['bodega santa cruz', 'tapas'], order: 4.5 },
    { id: 'svq-maria-luisa', name: 'Parque de María Luisa', categories: ['naturaleza'], why: 'Sombra, fuentes y glorietas.', kind: 'sight', visitMinutes: 40, paid: false, aliases: ['maria luisa', 'parque de maria luisa'], order: 5, kids: true },
    { id: 'svq-plaza-espana', name: 'Plaza de España', categories: ['arquitectura', 'historia'], why: 'Cerámica, canales y puentes de 1929.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['plaza de espana'], order: 6, kids: true },
    { id: 'svq-triana', name: 'Triana', categories: ['gastronomia', 'historia', 'vida_nocturna'], why: 'Al otro lado del río: cerámica, mercado y flamenco.', kind: 'sight', visitMinutes: 45, paid: false, aliases: ['triana'], order: 7 },
    { id: 'svq-cafe', name: t('data.pauseName'), categories: ['gastronomia'], why: 'Un café tranquilo para recargar.', kind: 'pause', visitMinutes: PAUSE_MINUTES, paid: true, aliases: [], order: 99 },
  ],
  {
    'svq-setas|svq-catedral': { walk: 15, transit: 8 },
    'svq-catedral|svq-alcazar': { walk: 5, transit: 5 },
    'svq-alcazar|svq-santa-cruz': { walk: 5, transit: 5 },
    'svq-santa-cruz|svq-maria-luisa': { walk: 15, transit: 8 },
    'svq-maria-luisa|svq-plaza-espana': { walk: 5, transit: 5 },
    'svq-plaza-espana|svq-triana': { walk: 25, transit: 12 },
    'svq-santa-cruz|svq-bodega': { walk: 3, transit: 3 },
  },
)

/** Cities the assistant recognizes. Only some have a detailed catalog. */
export const KNOWN_CITIES = ['Barcelona', 'Valencia', 'Sevilla', 'Madrid', 'Granada', 'Málaga', 'Bilbao', 'Marbella'] as const

/** Extra spellings (already normalized) that map to a known city. */
export const CITY_ALIASES: Record<string, string> = {
  seville: 'Sevilla',
  malaga: 'Málaga',
  bilbo: 'Bilbao',
}

const CATALOGS: CityCatalog[] = [barcelona, valencia, sevilla]

function genericCatalog(cityName: string): CityCatalog {
  const seeds: PlaceSeed[] = [
    { id: 'gen-centro', name: t('data.genericOld'), categories: ['historia', 'arquitectura'], why: t('data.genericWhy'), kind: 'sight', visitMinutes: 60, paid: false, aliases: [], order: 1, kids: true },
    { id: 'gen-mercado', name: t('data.genericMarket'), categories: ['gastronomia', 'compras'], why: t('data.genericWhy'), kind: 'sight', visitMinutes: 45, paid: false, aliases: [], order: 2, kids: true },
    { id: 'gen-mirador', name: t('data.genericViewpoint'), categories: ['naturaleza', 'arquitectura'], why: t('data.genericWhy'), kind: 'sight', visitMinutes: 45, paid: true, aliases: [], order: 3 },
    { id: 'gen-parque', name: t('data.genericPark'), categories: ['naturaleza'], why: t('data.genericWhy'), kind: 'sight', visitMinutes: 45, paid: false, aliases: [], order: 4, kids: true },
    { id: 'gen-restaurante', name: t('data.genericFood'), categories: ['gastronomia'], why: t('data.genericWhy'), kind: 'food', visitMinutes: 60, paid: true, aliases: [], order: 2.5 },
    { id: 'gen-cafe', name: t('data.pauseName'), categories: ['gastronomia'], why: t('data.genericWhy'), kind: 'pause', visitMinutes: PAUSE_MINUTES, paid: true, aliases: [], order: 99 },
  ]
  return city(cityName, seeds, {})
}

/** Catalog for a city; cities without data get the four generic places. */
export function getCityCatalog(cityName: string): CityCatalog {
  const key = normalize(cityName)
  return CATALOGS.find((c) => normalize(c.city) === key) ?? genericCatalog(cityName)
}

export function hasDetailedCatalog(cityName: string): boolean {
  const key = normalize(cityName)
  return CATALOGS.some((c) => normalize(c.city) === key)
}

export function findPlace(id: string): CatalogPlace | undefined {
  for (const c of CATALOGS) {
    const p = c.places.find((pl) => pl.id === id)
    if (p) return p
  }
  return genericCatalog('').places.find((p) => p.id === id)
}

export function legBetween(catalog: CityCatalog, a: string, b: string): Leg {
  return catalog.legs[`${a}|${b}`] ?? catalog.legs[`${b}|${a}`] ?? DEFAULT_LEG
}

/** Catalog places (any city with detailed data) whose name or alias appears in the text. */
export function placesMentioned(text: string, ignoreAliases: Set<string> = new Set()): CatalogPlace[] {
  const norm = ` ${normalize(text)} `
  const found: CatalogPlace[] = []
  for (const c of CATALOGS) {
    for (const p of c.places) {
      if (p.kind === 'pause') continue
      const keys = [p.name, ...p.aliases.filter((a) => !ignoreAliases.has(a))].map(normalize).filter((k) => k.length > 0)
      if (keys.some((k) => norm.includes(` ${k} `))) found.push(p)
    }
  }
  return found
}

/** Does a must-include label (e.g. "Tapas", "Sagrada Família") refer to this place? */
export function matchesMustInclude(place: CatalogPlace, label: string): boolean {
  const key = normalize(label)
  return [place.name, ...place.aliases].some((k) => normalize(k) === key)
}
