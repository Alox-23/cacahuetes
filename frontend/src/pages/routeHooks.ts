import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Place, Route } from '../contract/types'
import { hintsOf } from '../lib/placeHints'
import type { Activity } from '../lib/routeText'
import { useData } from '../state/AppState'

export type LoadState<T> = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; value: T }

/** Load a route by id; re-runs when `id` or `version` changes. */
export function useRoute(id: string) {
  const data = useData()
  const [state, setState] = useState<LoadState<Route>>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    data.getRoute(id).then(
      (value) => alive && setState({ status: 'ready', value }),
      () => alive && setState({ status: 'missing' }),
    )
    return () => {
      alive = false
    }
  }, [data, id])
  const setRoute = (value: Route) => setState({ status: 'ready', value })
  return { state, route: state.status === 'ready' ? state.value : null, setRoute }
}

/** The catalog places of the stops (for the activity hint: visita, paseo, comida, pausa). */
export function useStopPlaces(route: Route | null): Record<string, Place> {
  const data = useData()
  const [places, setPlaces] = useState<Record<string, Place>>({})
  const ids = route ? route.stops.map((s) => s.placeId).join('|') : ''
  useEffect(() => {
    if (!ids) return
    let alive = true
    const unique = [...new Set(ids.split('|'))]
    Promise.all(unique.map((pid) => data.getPlace(pid).catch(() => null))).then((list) => {
      if (!alive) return
      const next: Record<string, Place> = {}
      for (const p of list) if (p) next[p.id] = p
      setPlaces(next)
    })
    return () => {
      alive = false
    }
  }, [data, ids])
  return places
}

export function activityFor(places: Record<string, Place>, placeId: string): Activity | undefined {
  return hintsOf(places[placeId]).activity
}

/** Router state that tells a sub-screen how many history entries lead back to the route. */
export type DepthState = { depth?: number } | null

/**
 * Go back to the route screen after a per-stop action: pop the history
 * entries that led here (route → stop → alternatives) when we know them,
 * otherwise replace with the route URL.
 */
export function useReturnToRoute(id: string) {
  const navigate = useNavigate()
  const location = useLocation()
  const depth = (location.state as DepthState)?.depth
  return useCallback(() => {
    if (depth && depth > 0) navigate(-depth)
    else navigate(`/route/${id}`, { replace: true })
  }, [navigate, depth, id])
}

/** Depth to pass to the next sub-screen. */
export function useNextDepth(): number {
  const location = useLocation()
  return ((location.state as DepthState)?.depth ?? 0) + 1
}
