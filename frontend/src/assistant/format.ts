/* Human labels for chips, echoes and summaries. All text comes from es.json. */
import type { Preferences, RouteRequest } from '../contract/types'
import { t, tDynamic } from '../i18n'
import { capitalize, joinList, lowerFirst } from '../lib/text'
import { parseIsoDate, toMinutes } from '../lib/time'

export function interestLabel(value: string): string {
  return tDynamic(`options.interests.${value}`)
}
export function paceLabel(value: Preferences['pace']): string {
  return tDynamic(`options.pace.${value}`)
}
export function companyLabel(value: Preferences['company']): string {
  return tDynamic(`options.company.${value}`)
}
export function budgetLabel(value: Preferences['budget']): string {
  return tDynamic(`options.budget.${value}`)
}
export function budgetChip(value: Preferences['budget']): string {
  return tDynamic(`options.budgetChip.${value}`)
}
export function transportLabel(value: Preferences['transport'][number]): string {
  return tDynamic(`options.transport.${value}`)
}

/** ["a_pie","transporte_publico"] → "A pie y bus" */
export function transportChip(values: Preferences['transport']): string {
  return capitalize(joinList(values.map((v) => tDynamic(`options.transportShort.${v}`))))
}

/** "1 hora", "5 horas", "4 h 30 min", "45 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return t('format.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest > 0) return t('format.hoursMinutes', { hours, minutes: rest })
  return hours === 1 ? t('format.hoursOne') : t('format.hoursMany', { count: hours })
}

/** "2026-12-05" → "Sáb 5 dic" (capitalized) or "sáb 5 dic". */
export function formatDateShort(iso: string, capitalized = true): string {
  const date = parseIsoDate(iso)
  const text = t('date.short', {
    weekday: tDynamic(`date.weekdayShort.${date.getDay()}`),
    day: date.getDate(),
    month: tDynamic(`date.monthShort.${date.getMonth()}`),
  })
  return capitalized ? capitalize(text) : text
}

const FULL_DAY = { from: '10:00', to: '19:00' }
const DEFAULT_FROM = '10:00'

/** Window → "5 horas", "Todo el día" or "4 horas desde las 16:00". */
export function formatWindow(window: RouteRequest['timeWindow']): string {
  if (window.from === FULL_DAY.from && window.to === FULL_DAY.to) return t('format.allDay')
  const duration = formatDuration(toMinutes(window.to) - toMinutes(window.from))
  return window.from === DEFAULT_FROM ? duration : t('format.durationFrom', { duration, from: window.from })
}

/** Shorter variant for subtitles: "5 horas" / "Todo el día" / "4 horas". */
export function formatWindowShort(window: RouteRequest['timeWindow']): string {
  if (window.from === FULL_DAY.from && window.to === FULL_DAY.to) return lowerFirst(t('format.allDay'))
  return formatDuration(toMinutes(window.to) - toMinutes(window.from))
}

/** { label: "Plaza de los Naranjos" } → "Desde Plaza de los Naranjos"; a label starting with "Mi " is lowercased ("Desde mi …"). */
export function startChip(start: RouteRequest['start']): string {
  const label = /^mi\s/i.test(start.label) ? lowerFirst(start.label) : start.label
  return t('summary.startPrefix', { label })
}

/** Chips for the saved preferences card in /chat. */
export function preferenceChips(p: Preferences): string[] {
  return [
    ...p.interests.map(interestLabel),
    paceLabel(p.pace),
    companyLabel(p.company),
    ...(p.transport.length > 0 ? [transportChip(p.transport)] : []),
    budgetChip(p.budget),
  ]
}

/** Chips for "De tu mensaje": request data plus per-route overrides. */
export function messageChips(request: RouteRequest): string[] {
  const o = request.overrides ?? {}
  return [
    request.city,
    formatDateShort(request.date),
    formatWindow(request.timeWindow),
    startChip(request.start),
    ...request.mustInclude,
    ...(o.interests ?? []).map(interestLabel),
    ...(o.company ? [companyLabel(o.company)] : []),
    ...(o.pace ? [paceLabel(o.pace)] : []),
    ...(o.transport && o.transport.length > 0 ? [transportChip(o.transport)] : []),
    ...(o.budget ? [budgetChip(o.budget)] : []),
  ]
}

/** Chips for "De tus preferencias": saved preferences minus overridden fields. */
export function preferenceSummaryChips(p: Preferences | null, request: RouteRequest): string[] {
  if (!p) return []
  const o = request.overrides ?? {}
  return [
    ...(o.company ? [] : [companyLabel(p.company)]),
    ...(o.pace ? [] : [paceLabel(p.pace)]),
    ...(o.transport || p.transport.length === 0 ? [] : [transportChip(p.transport)]),
    ...(o.budget ? [] : [budgetChip(p.budget)]),
  ]
}

/** "Marbella · sáb 5 dic · 5 horas" */
export function requestSubtitle(request: RouteRequest): string {
  return [request.city, formatDateShort(request.date, false), formatWindowShort(request.timeWindow)].join(' · ')
}

/**
 * Echo shown as the user's bubble for an onboarding selection, from namespaced
 * option values ("interests:arquitectura", "pace:relajado", "transport:a_pie").
 *  - interests → "Arquitectura y gastronomía"
 *  - pace + transport → "Relajado, a pie y en transporte público"
 */
export function describeSelection(values: string[]): string {
  const byField = (field: string) => values.filter((v) => v.startsWith(`${field}:`)).map((v) => v.slice(field.length + 1))
  const interests = byField('interests')
  if (interests.length > 0) return capitalize(joinList(interests.map((i) => lowerFirst(interestLabel(i)))))
  const pace = byField('pace')[0] as Preferences['pace'] | undefined
  const transport = byField('transport')
  const parts: string[] = []
  if (pace) parts.push(paceLabel(pace))
  if (transport.length > 0) parts.push(joinList(transport.map((v) => tDynamic(`options.transportPhrase.${v}`))))
  return capitalize(parts.join(', '))
}

/** "{n}" as a Spanish word when small ("dos", "tres"…), digits otherwise. */
export function numberWord(n: number): string {
  return n >= 2 && n <= 10 ? tDynamic(`numbers.${n}`) : String(n)
}

/** Route leg line: "12 min en transporte público", "20 min a pie". */
export function legLabel(leg: { mode: string; minutes: number }): string {
  return t('route.leg', { minutes: leg.minutes, mode: tDynamic(`route.legMode.${leg.mode}`) })
}
