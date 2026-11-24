import { asksForAnotherCity, localStart } from '../../../backend/lib/marbella-scope.js'
/*
 * Simulated assistant (tech spec §7). The single swappable seam is
 * `Assistant.sendMessage`; everything here is scripted and runs in the browser.
 */
import type { Assistant, Preferences, Route, RouteRequest } from '../contract/types'
import { DEFAULT_PREFERENCES } from '../data/defaults'
import { t } from '../i18n'
import { parseRefineText, type QuickRefine } from '../lib/refineKeywords'
import { routeEnd } from '../lib/route'
import { joinList, normalize } from '../lib/text'
import { addDays, isoDate, nextWeekday, toMinutes, wait } from '../lib/time'
import { numberWord } from './format'
import {
  BUDGET_KEYWORDS,
  COMPANY_KEYWORDS,
  DAY_PARTS,
  DEFAULT_START_HOUR,
  INTEREST_KEYWORDS,
  PACE_KEYWORDS,
  TRANSPORT_KEYWORDS,
  matchKeywords,
  parseRequest,
  windowFromDuration,
  type ParsedRequest,
} from './parser'
import {
  SLOT_ORDER,
  UNDO_OPTION,
  onboardingDone,
  onboardingIntro,
  onboardingOptions,
  onboardingQuestion,
  quickRefineOptions,
  slotOptions,
  slotQuestion,
  type Slot,
} from './script'
import type { AssistantDeps, AssistantMode, RichReply } from './types'

export interface MockAssistant extends Assistant {
  sendMessage(input: { text?: string; option?: string }): Promise<RichReply>
  /**
   * Start a mode. `route` feeds change mode; `request` (feature 2, "Reutilizar")
   * pre-fills request mode so the first reply is the "Esto es lo que entendí" summary.
   */
  reset(mode: AssistantMode, ctx?: { route?: Route; request?: RouteRequest }): void
  getState(): { mode: AssistantMode; onboardingStep: number; onboardingComplete: boolean; routeId?: string }
}

type Draft = {
  date?: string
  timeWindow?: RouteRequest['timeWindow']
  durationMinutes?: number
  startHour?: string
  start?: RouteRequest['start']
  mustInclude: string[]
  overrides: Partial<Preferences>
}

const emptyDraft = (): Draft => ({ mustInclude: [], overrides: {} })

/* ---------- onboarding helpers ---------- */

type OnboardingAnswers = Partial<Pick<Preferences, 'interests' | 'pace' | 'transport' | 'company' | 'budget'>>

function parseOptionValues(option: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const part of option.split(',').map((p) => p.trim()).filter(Boolean)) {
    const [field, value] = part.split(':')
    if (field && value) (out[field] ??= []).push(value)
  }
  return out
}

/** Free-text answer: option labels plus keyword synonyms, accent-insensitive. */
function onboardingFromText(step: number, text: string): Record<string, string[]> {
  const withLabels = <K extends string>(field: string, table: Record<K, string[]>) => {
    const labels = Object.fromEntries(
      onboardingOptions(step)
        .filter((o) => o.value.startsWith(`${field}:`))
        .map((o) => [o.value.split(':')[1], [normalize(o.label), ...(table[o.value.split(':')[1] as K] ?? [])]]),
    ) as Record<K, string[]>
    return matchKeywords(text, labels)
  }
  switch (step) {
    case 1:
      return { interests: withLabels('interests', INTEREST_KEYWORDS as Record<string, string[]>) }
    case 2:
      return { pace: withLabels('pace', PACE_KEYWORDS), transport: withLabels('transport', TRANSPORT_KEYWORDS) }
    case 3:
      return { company: withLabels('company', COMPANY_KEYWORDS) }
    case 4:
      return { budget: withLabels('budget', BUDGET_KEYWORDS) }
    default:
      return {}
  }
}

/** Validate a step's answer; returns null when the step is not answered. */
function applyOnboardingStep(step: number, values: Record<string, string[]>, answers: OnboardingAnswers): boolean {
  switch (step) {
    case 1: {
      const interests = values.interests ?? []
      if (interests.length === 0) return false
      answers.interests = interests
      return true
    }
    case 2: {
      const pace = (values.pace?.[0] as Preferences['pace'] | undefined) ?? undefined
      const transport = (values.transport ?? []) as Preferences['transport']
      if (!pace && transport.length === 0) return false
      answers.pace = pace ?? DEFAULT_PREFERENCES.pace
      answers.transport = transport.length > 0 ? transport : DEFAULT_PREFERENCES.transport
      return true
    }
    case 3: {
      const company = values.company?.[0] as Preferences['company'] | undefined
      if (!company) return false
      answers.company = company
      return true
    }
    case 4: {
      const budget = values.budget?.[0] as Preferences['budget'] | undefined
      if (!budget) return false
      answers.budget = budget
      return true
    }
    default:
      return false
  }
}

/* ---------- request helpers ---------- */

function mergeParsed(draft: Draft, parsed: ParsedRequest) {
  if (parsed.date) draft.date = parsed.date
  if (parsed.start) draft.start = parsed.start
  if (parsed.startHour) {
    draft.startHour = parsed.startHour
    if (draft.timeWindow) {
      const length = toMinutes(draft.timeWindow.to) - toMinutes(draft.timeWindow.from)
      draft.timeWindow = windowFromDuration(length, parsed.startHour)
    }
  }
  if (parsed.timeWindow) draft.timeWindow = parsed.timeWindow
  for (const m of parsed.mustInclude) if (!draft.mustInclude.includes(m)) draft.mustInclude.push(m)
  draft.overrides = { ...draft.overrides, ...parsed.overrides }
}

function filled(draft: Draft, slot: Slot): boolean {
  switch (slot) {
    case 'date':
      return Boolean(draft.date)
    case 'time':
      return Boolean(draft.timeWindow)
    case 'start':
      return Boolean(draft.start)
  }
}

function knownList(draft: Draft): string[] {
  const parts: string[] = []
  if (draft.date) parts.push(t('request.known_date'))
  if (draft.timeWindow) parts.push(t('request.known_time'))
  if (draft.start) parts.push(t('request.known_start'))
  const n = draft.mustInclude.length
  if (n === 1) parts.push(t('request.mustOne'))
  if (n > 1) parts.push(t('request.mustMany', { count: numberWord(n) }))
  return parts
}

function toRequest(draft: Draft): RouteRequest {
  const request: RouteRequest = {
    city: 'Marbella',
    date: draft.date as string,
    timeWindow: draft.timeWindow as RouteRequest['timeWindow'],
    start: draft.start as RouteRequest['start'],
    mustInclude: [...draft.mustInclude],
  }
  if (Object.keys(draft.overrides).length > 0) request.overrides = { ...draft.overrides }
  return request
}

/** Draft filled from a stored request (reuse a saved route). */
function draftFrom(request: RouteRequest): Draft {
  return {
    date: request.date,
    timeWindow: { ...request.timeWindow },
    startHour: request.timeWindow.from,
    start: { ...request.start },
    mustInclude: [...request.mustInclude],
    overrides: { ...(request.overrides ?? {}) },
  }
}

/* ---------- change helpers ---------- */

function describeChange(action: QuickRefine, before: Route, after: Route): string {
  const beforeIds = new Set(before.stops.map((s) => s.placeId))
  const afterIds = new Set(after.stops.map((s) => s.placeId))
  const added = after.stops.findIndex((s) => !beforeIds.has(s.placeId))
  switch (action) {
    case 'menos_caminar': {
      const changed = after.stops.filter(
        (s, i) => s.travelToNext?.mode === 'transporte_publico' && before.stops[i]?.travelToNext?.mode === 'a_pie',
      )
      if (changed.length === 0) return t('change.noLongWalks')
      if (changed.length > 1) return t('change.legsToTransit', { count: numberWord(changed.length) })
      const i = after.stops.indexOf(changed[0])
      return t('change.legToTransit', { from: changed[0].name, to: after.stops[i + 1]?.name ?? '' })
    }
    case 'anadir_pausa': {
      if (added < 0) return t('change.noChange')
      const stop = after.stops[added]
      return t('change.pauseAdded', { minutes: stop.visitMinutes, after: after.stops[added - 1]?.name ?? '' })
    }
    case 'mas_comida': {
      if (added < 0) return t('change.noChange')
      const prev = after.stops[added - 1]
      return prev
        ? t('change.foodAdded', { name: after.stops[added].name, after: prev.name })
        : t('change.foodAddedStart', { name: after.stops[added].name })
    }
    case 'mas_barato': {
      const removed = before.stops.find((s) => !afterIds.has(s.placeId))
      if (!removed || added < 0) return t('change.noCheaper')
      return t('change.cheaper', { old: removed.name, new: after.stops[added].name })
    }
  }
}

/* ---------- factory ---------- */

export function createAssistant(deps: AssistantDeps): MockAssistant {
  const now = deps.now ?? (() => new Date())
  const delay = deps.delay ?? wait
  const random = deps.random ?? Math.random

  let mode: AssistantMode = 'onboarding'
  // onboarding
  let step = 0
  let complete = false
  let answers: OnboardingAnswers = {}
  // request
  let draft: Draft = emptyDraft()
  let asked: Slot | undefined
  let awaitingOtherStart = false
  let summaryShown = false
  let reused = false
  // change
  let routeId: string | undefined
  let lastApplied = 0

  const think = () => delay(500 + Math.floor(random() * 401))

  async function onboarding(input: { text?: string; option?: string }): Promise<RichReply> {
    if (step === 0) {
      step = 1
      return onboardingIntro()
    }
    if (complete) return onboardingDone()
    const values = input.option ? parseOptionValues(input.option) : input.text ? onboardingFromText(step, input.text) : {}
    if (!applyOnboardingStep(step, values, answers)) {
      return onboardingQuestion(step, [t('onboarding.notUnderstood')])
    }
    if (step < 4) {
      step += 1
      return onboardingQuestion(step, step === 2 ? [t('onboarding.ack')] : [])
    }
    const prefs: Preferences = { ...DEFAULT_PREFERENCES, ...answers, needs: [] }
    await deps.savePreferences?.(prefs)
    complete = true
    return onboardingDone()
  }

  function askNext(lead: string[]): RichReply {
    const missing = SLOT_ORDER.filter((s) => !filled(draft, s))
    if (missing.length === 0) {
      asked = undefined
      const wasShown = summaryShown
      summaryShown = true
      const auto = wasShown ? [t('summary.updated')] : reused ? [t('summary.reused')] : []
      return {
        kind: 'summary',
        text: t('summary.title'),
        request: toRequest(draft),
        display: { lead: lead.length > 0 ? lead : auto },
      }
    }
    const slot = missing[0]
    asked = slot
    const question = slotQuestion(slot)
    const known = knownList(draft)
    const paragraphs = [...lead]
    if (known.length === 0) {
      paragraphs.push(`${t('request.generic')} ${question}`)
    } else {
      const ask =
        missing.length === 1
          ? t('request.missingOne', { question })
          : t('request.missingMany', { count: numberWord(missing.length), question })
      paragraphs.push(`${t('request.known', { list: joinList(known) })} ${ask}`)
    }
    return { kind: 'question', text: paragraphs.join(' '), options: slotOptions(slot) }
  }

  function applySlotOption(option: string): boolean {
    const [slot, value] = option.split(':')
    const today = now()
    switch (slot) {
      case 'date':
        draft.date = isoDate(value === 'today' ? today : value === 'tomorrow' ? addDays(today, 1) : nextWeekday(today, 6))
        return true
      case 'time': {
        if (value === 'allday') draft.timeWindow = { ...DAY_PARTS.fullDay }
        else draft.timeWindow = windowFromDuration(Number.parseInt(value, 10) * 60, draft.startHour ?? DEFAULT_START_HOUR)
        return true
      }
      case 'start': {
        if (value === 'other') {
          awaitingOtherStart = true
          return true
        }
        const point = localStart(value)
        if (!point) return false
        draft.start = { label: point }
        awaitingOtherStart = false
        return true
      }
      default:
        return false
    }
  }

  const localScopeReply = (): RichReply => ({ kind: 'question', text: t('request.localOnly'),
    options: [{ label: t('request.opt_city_marbella'), value: 'city:Marbella' }] })

  async function request(input: { text?: string; option?: string }): Promise<RichReply> {
    if (input.option) {
      if (input.option.startsWith('city:')) {
        return input.option === 'city:Marbella' ? askNext([]) : localScopeReply()
      }
      if (!applySlotOption(input.option)) return askNext([t('request.notUnderstood')])
      if (awaitingOtherStart) return { kind: 'question', text: t('request.askOther') }
      return askNext([])
    }
    const text = (input.text ?? '').trim()
    if (!text) return askNext([])
    if (asksForAnotherCity(text)) return localScopeReply()
    const nearby = localStart(text)
    if (awaitingOtherStart || (asked === 'start' && nearby)) {
      if (!nearby) return { kind: 'question', text: t('request.askOther'), options: slotOptions('start') }
      awaitingOtherStart = false
      draft.start = { label: nearby }
      return askNext([])
    }
    const parsed = parseRequest(text, now())
    if (deps.interpretRequest) {
      const hints = await deps.interpretRequest(text)
      parsed.overrides = { ...hints.overrides, ...parsed.overrides }
      if (hints.durationMinutes) {
        const from = parsed.startHour ?? parsed.timeWindow?.from ?? draft.timeWindow?.from ?? DEFAULT_START_HOUR
        parsed.timeWindow = windowFromDuration(hints.durationMinutes, from)
      }
      if (hints.start) parsed.start ??= hints.start
      parsed.recognized ||= Boolean(parsed.timeWindow || parsed.start || Object.keys(parsed.overrides).length)
    }
    if (parsed.start) {
      const point = localStart(parsed.start.label)
      parsed.start = point ? { label: point } : undefined
      if (!point) delete draft.start
    }
    if (!parsed.recognized) {
      // While asking for the start point, any free text is taken as the address.
      if (asked === 'start') {
        return { kind: 'question', text: t('request.askOther'), options: slotOptions('start') }
      }
      const knowsSomething = SLOT_ORDER.some((s) => filled(draft, s))
      return askNext(knowsSomething || summaryShown ? [t('request.notUnderstood')] : [])
    }
    mergeParsed(draft, parsed)
    return askNext([])
  }

  async function change(input: { text?: string; option?: string }): Promise<RichReply> {
    const greeting = (text: string): RichReply => ({ kind: 'question', text, options: quickRefineOptions() })
    if (input.text && asksForAnotherCity(input.text)) return greeting(t('request.localChange'))
    if (!input.text && !input.option) return greeting(t('change.greeting'))
    if (!routeId || !deps.getRoute || !deps.refineRoute || !deps.undo) return greeting(t('change.notUnderstood'))

    const wantsUndo = input.option === UNDO_OPTION || (input.text !== undefined && normalize(input.text) === normalize(t('common.undo')))
    if (wantsUndo) {
      const before = await deps.getRoute(routeId)
      const times = lastApplied > 0 ? lastApplied : before.version > 1 ? 1 : 0
      if (times === 0) return greeting(t('change.nothingToUndo'))
      let route = before
      for (let i = 0; i < times; i++) route = await deps.undo(routeId)
      lastApplied = 0
      return greeting(t('change.undone', { time: routeEnd(route) }))
    }

    const actions: QuickRefine[] = input.option?.startsWith('quick:')
      ? [input.option.slice('quick:'.length) as QuickRefine]
      : parseRefineText(input.text ?? '')
    if (actions.length === 0) return greeting(t('change.notUnderstood'))

    const bullets: string[] = []
    let route = await deps.getRoute(routeId)
    const steps = await deps.refineConversation?.(route, actions)
    for (const [index, value] of actions.entries()) {
      const after = steps ? steps[index] : await deps.refineRoute(routeId, { type: 'quick', value })
      bullets.push(describeChange(value, route, after))
      route = after
    }
    lastApplied = steps ? 1 : actions.length
    const n = bullets.length
    return {
      kind: 'change',
      text: n === 1 ? t('change.changedOne') : t('change.changedMany', { count: numberWord(n) }),
      changes: bullets,
      display: { footer: t('change.endsAt', { time: routeEnd(route) }), routeId },
    }
  }

  return {
    async sendMessage(input) {
      await think()
      switch (mode) {
        case 'onboarding':
          return onboarding(input)
        case 'request':
          return request(input)
        case 'change':
          return change(input)
      }
    },

    reset(nextMode, ctx) {
      mode = nextMode
      step = 0
      complete = false
      answers = {}
      draft = emptyDraft()
      asked = undefined
      awaitingOtherStart = false
      summaryShown = false
      reused = Boolean(ctx?.request)
      if (ctx?.request) draft = draftFrom(ctx.request)
      routeId = ctx?.route?.id
      lastApplied = 0
    },

    getState() {
      return { mode, onboardingStep: step, onboardingComplete: complete, routeId }
    },
  }
}
