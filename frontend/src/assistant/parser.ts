/*
 * Free text → partial RouteRequest (tech spec §7.2).
 *
 * Rule for "mañana" (kept deliberately simple):
 *   - "la mañana", "esta mañana", "por la mañana", "de la mañana", "toda la mañana"
 *     → day part 09:00–13:00
 *   - any other "mañana" (e.g. "mañana", "para mañana", "mañana por la tarde")
 *     → the date (tomorrow). "pasado mañana" → the day after tomorrow.
 *
 * A duration without a start hour starts at 10:00 (or at the day part start).
 */
import type { Preferences, RouteRequest } from '../contract/types'
import { CITY_ALIASES, KNOWN_CITIES, placesMentioned } from '../data/catalog'
import { t } from '../i18n'
import { containsPhrase, normalize, phraseIndex } from '../lib/text'
import { addDays, fromMinutes, isoDate, nextWeekday, toMinutes } from '../lib/time'

export type ParsedRequest = {
  city?: string
  date?: string
  timeWindow?: RouteRequest['timeWindow']
  /** Duration in minutes when no window could be built yet. */
  durationMinutes?: number
  /** "a las 11" without a duration. */
  startHour?: string
  start?: RouteRequest['start']
  mustInclude: string[]
  overrides: Partial<Preferences>
  /** True when anything at all was recognized. */
  recognized: boolean
}

export const DAY_PARTS = {
  morning: { from: '09:00', to: '13:00' },
  afternoon: { from: '16:00', to: '20:00' },
  night: { from: '19:00', to: '23:00' },
  fullDay: { from: '10:00', to: '19:00' },
} as const

export const DEFAULT_START_HOUR = '10:00'

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
}

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6,
  agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
}

const NUMBER_WORDS: Record<string, number> = {
  una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}

/** Must-include keywords that are not a single place. */
const GENERIC_MUST: Record<string, () => string> = {
  tapas: () => t('request.tapas'),
}

export const INTEREST_KEYWORDS: Record<string, string[]> = {
  arquitectura: ['arquitectura', 'edificios', 'gaudi', 'modernismo'],
  gastronomia: ['gastronomia', 'comida local', 'comer bien'],
  museos: ['museo', 'museos'],
  naturaleza: ['naturaleza', 'parques', 'playa'],
  historia: ['historia', 'historico', 'historica'],
  compras: ['compras', 'tiendas', 'shopping'],
  vida_nocturna: ['vida nocturna', 'fiesta', 'copas'],
  arte_urbano: ['arte urbano', 'grafiti', 'grafitis', 'murales', 'street art'],
}

export const PACE_KEYWORDS: Record<Preferences['pace'], string[]> = {
  relajado: ['relajado', 'relajada', 'tranquilo', 'tranquila', 'sin prisa', 'con calma'],
  equilibrado: ['equilibrado', 'equilibrada'],
  intenso: ['intenso', 'intensa', 'a tope', 'al maximo'],
}

export const TRANSPORT_KEYWORDS: Record<Preferences['transport'][number], string[]> = {
  a_pie: ['a pie', 'andando', 'caminando', 'paseando'],
  transporte_publico: ['transporte publico', 'en metro', 'metro', 'en bus', 'autobus'],
  coche: ['coche', 'en coche'],
  bici: ['bici', 'bicicleta', 'en bici'],
}

export const COMPANY_KEYWORDS: Record<Preferences['company'], string[]> = {
  solo: ['voy solo', 'voy sola', 'yo solo', 'yo sola', 'solo', 'sola'],
  pareja: ['en pareja', 'con mi pareja', 'pareja', 'con mi novia', 'con mi novio', 'con mi mujer', 'con mi marido'],
  con_ninos: ['con ninos', 'con mis hijos', 'con los ninos', 'ninos', 'en familia', 'familia'],
  grupo: ['en grupo', 'grupo', 'con amigos', 'con amigas', 'amigos'],
}

export const BUDGET_KEYWORDS: Record<Preferences['budget'], string[]> = {
  bajo: ['bajo', 'barato', 'barata', 'economico', 'economica', 'poco dinero'],
  medio: ['medio', 'normal'],
  alto: ['alto', 'lujo', 'sin mirar el precio'],
}

/** Request-mode company keywords: "solo" alone is too ambiguous ("solo quiero…"). */
const REQUEST_COMPANY_EXCLUDE = new Set(['solo', 'sola', 'pareja', 'ninos', 'familia', 'grupo', 'amigos'])

export function matchKeywords<K extends string>(text: string, table: Record<K, string[]>, exclude?: Set<string>): K[] {
  return (Object.keys(table) as K[]).filter((key) =>
    table[key].some((k) => !exclude?.has(k) && containsPhrase(text, k)),
  )
}

/** Window from a duration and an optional start hour. */
export function windowFromDuration(minutes: number, from: string = DEFAULT_START_HOUR): RouteRequest['timeWindow'] {
  return { from, to: fromMinutes(toMinutes(from) + minutes) }
}

function parseCity(norm: string): string | undefined {
  const padded = ` ${norm} `
  for (const city of KNOWN_CITIES) {
    if (padded.includes(` ${normalize(city)} `)) return city
  }
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (padded.includes(` ${alias} `)) return city
  }
  return undefined
}

function parseDate(tokens: string[], now: Date): { date?: string; morning: boolean } {
  let date: string | undefined
  let morning = false
  tokens.forEach((tok, i) => {
    const prev = tokens[i - 1]
    const prev2 = tokens[i - 2]
    if (tok === 'manana') {
      if (prev === 'pasado') date = isoDate(addDays(now, 2))
      else if (prev === 'la' || prev === 'esta') morning = true
      else date = isoDate(addDays(now, 1))
    } else if (tok === 'hoy') {
      date = isoDate(now)
    } else if (tok in WEEKDAYS) {
      date = isoDate(nextWeekday(now, WEEKDAYS[tok]))
    } else if (tok in MONTHS && prev === 'de' && /^\d{1,2}$/.test(prev2 ?? '')) {
      const day = Number(prev2)
      let candidate = new Date(now.getFullYear(), MONTHS[tok], day, 12)
      if (candidate < addDays(now, 0)) candidate = new Date(now.getFullYear() + 1, MONTHS[tok], day, 12)
      date = isoDate(candidate)
    }
  })
  return { date, morning }
}

function parseDuration(norm: string): number | undefined {
  if (/\bmedia hora\b/.test(norm)) return 30
  const digits = norm.match(/\b(\d{1,2})(?: y media)? ?(?:h|hora|horas)\b/)
  if (digits) return Number(digits[1]) * 60 + (/(\d) y media/.test(digits[0]) ? 30 : 0)
  const words = norm.match(/\b(una|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) (?:hora|horas)\b/)
  if (words) return NUMBER_WORDS[words[1]] * 60
  return undefined
}

function parseStartHour(norm: string): string | undefined {
  const m = norm.match(/\b(?:a las|desde las|a partir de las|sobre las) (\d{1,2})(?::(\d{2}))?\b/)
  if (!m) return undefined
  const h = Number(m[1])
  if (h > 23) return undefined
  return fromMinutes(h * 60 + Number(m[2] ?? 0))
}

function parseStart(original: string, norm: string): RouteRequest['start'] | undefined {
  if (/\b(mi|el|del) hotel\b/.test(norm)) return { label: t('request.opt_start_hotel') }
  if (/\b(mi ubicacion|donde estoy|desde aqui)\b/.test(norm)) return { label: t('request.opt_start_current') }
  const m = original.match(/\b(?:desde|salgo de|salgo del|salimos de|salimos del)\s+(?!las?\s+\d)([^,.;!?]+)/i)
  if (m) {
    const label = m[1].trim()
    if (label && !parseCity(normalize(label))) return { label }
  }
  return undefined
}

/** Prepared parses for the three suggestions of the main chat (tech spec §7.2). */
function prepared(norm: string): ParsedRequest | undefined {
  const base = { mustInclude: [] as string[], overrides: {} as Partial<Preferences>, recognized: true }
  if (norm === normalize(t('chat.suggestion1'))) {
    return {
      ...base,
      city: 'Barcelona',
      timeWindow: windowFromDuration(5 * 60),
      mustInclude: ['Sagrada Família', t('request.tapas')],
      overrides: { interests: ['arquitectura', 'gastronomia'] },
    }
  }
  if (norm === normalize(t('chat.suggestion2'))) {
    return { ...base, city: 'Valencia', timeWindow: { ...DAY_PARTS.fullDay }, overrides: { company: 'con_ninos' } }
  }
  if (norm === normalize(t('chat.suggestion3'))) {
    return {
      ...base,
      city: 'Sevilla',
      timeWindow: { ...DAY_PARTS.afternoon },
      overrides: { pace: 'relajado', transport: ['a_pie'] },
    }
  }
  return undefined
}

export function parseRequest(text: string, now: Date = new Date()): ParsedRequest {
  const norm = normalize(text)
  const ready = prepared(norm)
  if (ready) return ready

  const tokens = norm.split(' ').filter(Boolean)
  const result: ParsedRequest = { mustInclude: [], overrides: {}, recognized: false }

  result.city = parseCity(norm)

  const { date, morning } = parseDate(tokens, now)
  result.date = date

  // Day parts and duration → time window.
  const fullDay = /\b(un dia|todo el dia|dia entero|dia completo)\b/.test(norm)
  const afternoon = /\btarde\b/.test(norm)
  const night = /\bnoche\b/.test(norm) && !containsPhrase(norm, 'vida nocturna')
  const duration = parseDuration(norm)
  const startHour = parseStartHour(norm)
  const part = morning ? DAY_PARTS.morning : afternoon ? DAY_PARTS.afternoon : night ? DAY_PARTS.night : undefined

  if (fullDay && !duration) result.timeWindow = { ...DAY_PARTS.fullDay }
  else if (duration) result.timeWindow = windowFromDuration(duration, startHour ?? part?.from ?? DEFAULT_START_HOUR)
  else if (part) result.timeWindow = startHour ? { from: startHour, to: part.to } : { ...part }
  else if (startHour) result.startHour = startHour

  result.start = parseStart(text, norm)

  // Must-include places (and the city they imply), in the order they appear.
  const must: { label: string; at: number }[] = []
  for (const [keyword, label] of Object.entries(GENERIC_MUST)) {
    const at = phraseIndex(norm, keyword)
    if (at >= 0) must.push({ label: label(), at })
  }
  const places = placesMentioned(text, new Set(Object.keys(GENERIC_MUST)))
  if (!result.city) {
    // A place can imply the city, but only when it is unambiguous ("catedral" is not).
    const cities = new Set(places.map((p) => p.city))
    if (cities.size === 1) result.city = [...cities][0]
  }
  const inCity = result.city ? places.filter((p) => normalize(p.city) === normalize(result.city as string)) : []
  for (const p of inCity) {
    const at = Math.min(...[p.name, ...p.aliases].map((k) => phraseIndex(norm, k)).filter((i) => i >= 0))
    if (!must.some((m) => m.label === p.name)) must.push({ label: p.name, at })
  }
  result.mustInclude = must.sort((a, b) => a.at - b.at).map((m) => m.label)

  // Per-route overrides (never saved as preferences).
  const interests = matchKeywords(norm, INTEREST_KEYWORDS)
  if (interests.length > 0) result.overrides.interests = interests
  const pace = matchKeywords(norm, PACE_KEYWORDS)[0]
  if (pace) result.overrides.pace = pace
  const transport = matchKeywords(norm, TRANSPORT_KEYWORDS)
  if (transport.length > 0) result.overrides.transport = transport
  const company = matchKeywords(norm, COMPANY_KEYWORDS, REQUEST_COMPANY_EXCLUDE)[0]
  if (company) result.overrides.company = company
  const budget = matchKeywords(norm, BUDGET_KEYWORDS, new Set(['bajo', 'medio', 'alto', 'normal']))[0]
  if (budget) result.overrides.budget = budget

  result.recognized = Boolean(
    result.city ||
      result.date ||
      result.timeWindow ||
      result.startHour ||
      result.start ||
      result.mustInclude.length > 0 ||
      Object.keys(result.overrides).length > 0,
  )
  return result
}
