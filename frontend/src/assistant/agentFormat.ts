/* Feature 5 §5.2: one Spanish bullet per route event of an agent turn. */
import type { AgentEvent, AgentReply, Route } from '../contract/types'
import { t, tDynamic } from '../i18n'
import { routeEnd } from '../lib/route'
import { joinList } from '../lib/text'

/** Events that change which route is current or what it contains. */
export type RouteEvent = Extract<AgentEvent, { type: 'route_created' | 'route_changed' | 'undone' }>

export function isRouteEvent(event: AgentEvent): event is RouteEvent {
  return event.type === 'route_created' || event.type === 'route_changed' || event.type === 'undone'
}

function stopsText(route: Route): string {
  const n = route.stops.length
  return n === 1 ? t('change.stopsOne') : t('change.stops', { count: n })
}

/**
 * The bullet for a route event; `route` is the reply's route (it describes the state after the turn).
 * The server's assumptions get their own "He supuesto: …" sentence only on the rules path (`source`
 * `'rules'`): with the model, the narrator already states them in the reply text.
 */
export function describeEvent(event: RouteEvent, route?: Route, source?: AgentReply['source']): string {
  switch (event.type) {
    case 'route_created': {
      const parts: string[] = []
      if (route && route.id === event.routeId) {
        parts.push(t('agent.event.created', {
          name: route.name,
          stops: stopsText(route),
          from: route.request.timeWindow.from,
          to: routeEnd(route),
        }))
      } else {
        parts.push(t('agent.event.createdShort'))
      }
      const assumptions = source === 'rules' ? event.assumptions.filter((a) => typeof a === 'string' && a.trim()) : []
      if (assumptions.length > 0) parts.push(t('agent.event.assumptions', { list: joinList(assumptions.map((a) => a.trim())) }))
      return parts.join(' ')
    }
    case 'route_changed': {
      const key = `agent.event.change.${event.change}`
      const text = tDynamic(key)
      return text === key ? t('agent.event.changed') : text
    }
    case 'undone':
      return t('agent.event.undone')
  }
}
