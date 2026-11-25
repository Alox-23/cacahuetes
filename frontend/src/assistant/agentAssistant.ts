/*
 * Feature 5 §5.2: the conversational assistant for request and change modes when the API is configured.
 * The model (server side) decides and the planner computes; this module only maps a turn of
 * `DataModule.agent` onto the same `MockAssistant` seam the scripted assistant implements, so the
 * provider and the screens need no new path. Onboarding keeps the scripted assistant.
 */
import type { AgentReply, Route, RouteRequest } from '../contract/types'
import { t } from '../i18n'
import { routeEnd } from '../lib/route'
import { joinList } from '../lib/text'
import { describeEvent, isRouteEvent } from './agentFormat'
import { formatDateLong } from './format'
import type { MockAssistant } from './mockAssistant'
import { UNDO_OPTION } from './script'
import type { AssistantDeps, AssistantMode, RichReply } from './types'

/** Chip values of the model's suggestions: tapping one sends its text. */
export const SAY_PREFIX = 'say:'

export const sayOption = (text: string) => ({ label: text, value: SAY_PREFIX + text })

/** What the visitor said: typed text, a suggestion chip (`say:<text>`) or the change bubble's "Deshacer". */
function textOf(input: { text?: string; option?: string }): string {
  if (input.option?.startsWith(SAY_PREFIX)) return input.option.slice(SAY_PREFIX.length).trim()
  if (input.option === UNDO_OPTION) return t('common.undo')
  return (input.text ?? '').trim()
}

/** "Reutilizar" (feature 2) without a summary card: the stored request becomes the visitor's first message. */
function reuseText(request: RouteRequest): string {
  const params = {
    date: formatDateLong(request.date),
    from: request.timeWindow.from,
    to: request.timeWindow.to,
    start: request.start.label,
  }
  const places = request.mustInclude.filter((name) => name !== request.start.label)
  return places.length > 0
    ? t('agent.reuseWith', { ...params, places: joinList(places) })
    : t('agent.reuse', params)
}

/** Agent turn → the reply the chat renders (kind "change" when the route moved, else "question"). */
export function toRichReply(reply: AgentReply): RichReply {
  const route: Route | undefined = reply.route
  const routeEvents = reply.events.filter(isRouteEvent)
  const options = reply.suggestions.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3).map((s) => sayOption(s.trim()))
  const created = reply.events.some((e) => e.type === 'route_created') && route ? route : undefined
  const display: RichReply['display'] = {}
  if (reply.source === 'rules') display.hint = t('agent.degraded')
  if (created) display.created = created
  if (routeEvents.length > 0) {
    const routeId = route?.id ?? reply.routeId ?? routeEvents[routeEvents.length - 1].routeId
    display.routeId = routeId
    if (route) display.footer = t('change.endsAt', { time: routeEnd(route) })
    return {
      kind: 'change',
      text: reply.text,
      changes: routeEvents.map((e) => describeEvent(e, route)),
      options,
      display,
    }
  }
  return { kind: 'question', text: reply.text, options, ...(Object.keys(display).length > 0 ? { display } : {}) }
}

export function createAgentAssistant(deps: AssistantDeps): MockAssistant {
  let mode: AssistantMode = 'request'
  let routeId: string | undefined
  let reuse: RouteRequest | undefined

  const greeting = (): RichReply => ({ kind: 'question', text: t('agent.greetingRoute') })

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
      // Errors (UNSUPPORTED_CITY, quota, rate limit, network) become replies in the provider's errorReply.
      let reply: AgentReply = await deps.agent(routeId ? { text, routeId } : { text })
      for (const event of reply.events) {
        if ('routeId' in event && event.routeId) routeId = event.routeId
      }
      if (reply.routeId) routeId = reply.routeId
      const created = reply.events.find((e) => e.type === 'route_created')
      // The contract sends the route with route_created; read it back if a server ever leaves it out.
      if (created && !reply.route && deps.getRoute) {
        reply = { ...reply, route: await deps.getRoute(created.routeId).catch(() => undefined) }
      }
      if (reply.events.some((e) => e.type === 'preferences_updated')) {
        await Promise.resolve(deps.preferencesChanged?.()).catch(() => undefined)
      }
      return toRichReply(reply)
    },

    reset(nextMode, ctx) {
      mode = nextMode
      routeId = nextMode === 'change' ? ctx?.route?.id : undefined
      reuse = nextMode === 'request' ? ctx?.request : undefined
    },

    getState() {
      return { mode, onboardingStep: 0, onboardingComplete: true, routeId }
    },
  }
}
