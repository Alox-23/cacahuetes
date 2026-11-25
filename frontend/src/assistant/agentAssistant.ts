/*
 * Feature 5 §5.2: the conversational assistant for request and change modes when the API is configured.
 * The model (server side) decides and the planner computes; this module only maps a turn of
 * `DataModule.agent` onto the same `MockAssistant` seam the scripted assistant implements, so the
 * provider and the screens need no new path. Onboarding keeps the scripted assistant.
 */
import type { AgentReply, Preferences, RouteRequest } from '../contract/types'
import { isApiError } from '../data/errors'
import { t, tDynamic } from '../i18n'
import { routeEnd } from '../lib/route'
import { joinList, lowerFirst } from '../lib/text'
import { describeEvent, isRouteEvent } from './agentFormat'
import { budgetLabel, companyLabel, formatDateLong, interestLabel, paceLabel } from './format'
import type { MockAssistant } from './mockAssistant'
import { UNDO_OPTION } from './script'
import type { AssistantDeps, AssistantMode, AssistantTurn, RichReply } from './types'

/** Chip values of the model's suggestions: tapping one sends its text. */
export const SAY_PREFIX = 'say:'

export const sayOption = (text: string) => ({ label: text, value: SAY_PREFIX + text })

/** At most three chips: trimmed, non-empty, without repeats (chip values must be unique). */
export function cleanSuggestions(list: readonly unknown[]): string[] {
  const texts = list.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
  return [...new Set(texts)].slice(0, 3)
}

/** What the visitor said: typed text, a suggestion chip (`say:<text>`) or the change bubble's "Deshacer". */
function textOf(input: { text?: string; option?: string }): string {
  if (input.option?.startsWith(SAY_PREFIX)) return input.option.slice(SAY_PREFIX.length).trim()
  if (input.option === UNDO_OPTION) return t('common.undo')
  return (input.text ?? '').trim()
}

/** " Para esta ruta: intereses historia, ritmo relajado, presupuesto bajo, voy en pareja." ('' without overrides). */
function overridesText(o: Partial<Preferences> | undefined): string {
  if (!o) return ''
  const parts: string[] = []
  if (o.interests && o.interests.length > 0) {
    parts.push(t('agent.reusePrefs.interests', { list: joinList(o.interests.map((i) => lowerFirst(interestLabel(i)))) }))
  }
  if (o.pace) parts.push(t('agent.reusePrefs.pace', { pace: lowerFirst(paceLabel(o.pace)) }))
  if (o.budget) parts.push(t('agent.reusePrefs.budget', { budget: lowerFirst(budgetLabel(o.budget)) }))
  if (o.company) parts.push(t('agent.reusePrefs.company', { company: lowerFirst(companyLabel(o.company)) }))
  if (o.transport && o.transport.length > 0) {
    parts.push(t('agent.reusePrefs.transport', { list: joinList(o.transport.map((v) => tDynamic(`options.transportPhrase.${v}`))) }))
  }
  return parts.length > 0 ? ' ' + t('agent.reusePrefs.lead', { list: parts.join(', ') }) : ''
}

/**
 * "Reutilizar" (feature 2) without a summary card: the stored request becomes the visitor's first message.
 * The ISO date rides along so the model does not have to parse the Spanish one; per-route overrides are
 * spelled out because the server only knows the stored preferences.
 */
export function reuseText(request: RouteRequest): string {
  const params = {
    date: formatDateLong(request.date),
    iso: request.date,
    from: request.timeWindow.from,
    to: request.timeWindow.to,
    start: request.start.label,
  }
  const places = request.mustInclude.filter((name) => name !== request.start.label)
  const base = places.length > 0
    ? t('agent.reuseWith', { ...params, places: joinList(places) })
    : t('agent.reuse', params)
  return base + overridesText(request.overrides)
}

/**
 * Agent turn → the reply the chat renders (kind "change" when the route moved, else "question"). A turn that
 * created a route also carries it as `createdRoute`: the provider plays Creando with it, the thread keeps
 * only `display.createdRouteId`.
 */
export function toRichReply(reply: AgentReply): AssistantTurn {
  const route = reply.route
  const routeEvents = reply.events.filter(isRouteEvent)
  const options = cleanSuggestions(reply.suggestions).map((s) => sayOption(s))
  const createdEvent = reply.events.some((e) => e.type === 'route_created')
  const createdRoute = createdEvent && route ? route : undefined
  const display: RichReply['display'] = {}
  if (reply.source === 'rules') display.hint = t('agent.degraded')
  if (createdRoute) display.createdRouteId = createdRoute.id
  if (routeEvents.length > 0) {
    const routeId = route?.id ?? reply.routeId ?? routeEvents[routeEvents.length - 1].routeId
    display.routeId = routeId
    // A new route has no "ends now at" line: the creation bullet already says when it ends.
    if (route && !createdEvent) display.footer = t('change.endsAt', { time: routeEnd(route) })
    return {
      kind: 'change',
      text: reply.text,
      changes: routeEvents.map((e) => describeEvent(e, route, reply.source)),
      options,
      display,
      ...(createdRoute ? { createdRoute } : {}),
    }
  }
  return { kind: 'question', text: reply.text, options, ...(Object.keys(display).length > 0 ? { display } : {}) }
}

export function createAgentAssistant(deps: AssistantDeps): MockAssistant {
  let mode: AssistantMode = 'request'
  let routeId: string | undefined
  let reuse: RouteRequest | undefined
  /** Chips of the turn that created the route, offered again by the change greeting. */
  let greetingChips: string[] = []
  /** Bumped by reset(): a reply to a turn sent before it must not touch the new conversation's state. */
  let generation = 0

  const greeting = (): RichReply => ({
    kind: 'question',
    text: t('agent.greetingRoute'),
    ...(greetingChips.length > 0 ? { options: greetingChips.map((s) => sayOption(s)) } : {}),
  })

  return {
    conversational: true,

    async sendMessage(input) {
      let text = textOf(input)
      if (!text) {
        if (mode === 'change') return greeting()
        if (!reuse) return { kind: 'question', text: t('chat.helperAgent') }
        text = reuseText(reuse)
        reuse = undefined
      }
      if (!deps.agent) throw new Error('AGENT_UNAVAILABLE')
      const sent = generation
      const current = () => sent === generation
      let reply: AgentReply
      try {
        reply = await deps.agent(routeId ? { text, routeId } : { text })
      } catch (error) {
        // The route is gone (deleted, or not this visitor's): the next turn goes without it.
        if (isApiError(error, 'ROUTE_NOT_FOUND') && current()) routeId = undefined
        // Every error (UNSUPPORTED_CITY, ROUTE_NOT_FOUND, quota, rate limit, network) becomes a reply in
        // the provider's errorReply.
        throw error
      }
      if (current()) {
        for (const event of reply.events) {
          if ('routeId' in event && event.routeId) routeId = event.routeId
        }
        if (reply.routeId) routeId = reply.routeId
      }
      const created = reply.events.find((e) => e.type === 'route_created')
      // The contract sends the route with route_created; read it back if a server ever leaves it out.
      if (created && !reply.route && deps.getRoute && current()) {
        reply = { ...reply, route: await deps.getRoute(created.routeId).catch(() => undefined) }
      }
      if (reply.events.some((e) => e.type === 'preferences_updated')) {
        await Promise.resolve(deps.preferencesChanged?.()).catch(() => undefined)
      }
      return toRichReply(reply)
    },

    reset(nextMode, ctx) {
      generation += 1
      mode = nextMode
      routeId = nextMode === 'change' ? ctx?.route?.id : undefined
      reuse = nextMode === 'request' ? ctx?.request : undefined
      greetingChips = nextMode === 'change' ? cleanSuggestions(ctx?.suggestions ?? []) : []
    },

    getState() {
      return { mode, onboardingStep: 0, onboardingComplete: true, routeId }
    },
  }
}
