/* Ruta guardada behaviour shared by the mobile page and the desktop panel (dev's SavedRoutePage logic). */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Route } from '../../contract/types'
import { t } from '../../i18n'
import { enrichStops } from '../../lib/enrichStops'
import { shareRoute, shareToastKey } from '../../lib/share'
import { useRoute, useStopPlaces } from '../../pages/routeHooks'
import { useData, useReuse, useToast } from '../../state/AppState'

export function useSavedRouteScreen(id: string) {
  const navigate = useNavigate()
  const data = useData()
  const toast = useToast()
  const startReuse = useReuse()
  const { state, route, setRoute } = useRoute(id)
  const places = useStopPlaces(route)
  // Stops filled from their places for the map; the stop list keeps using route.stops.
  const mapStops = useMemo(() => (route ? enrichStops(route.stops, places) : []), [route, places])
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggleFavorite(r: Route) {
    setRoute(await data.setFavorite(r.id, !r.favorite))
  }

  async function share(r: Route) {
    const key = shareToastKey(await shareRoute(r))
    if (key) toast.show(t(key))
  }

  function reuse(r: Route) {
    startReuse(r.request, t('savedRoute.reuseEcho', { name: r.name }))
    navigate('/chat/conversation')
  }

  async function remove(r: Route) {
    setBusy(true)
    try {
      await data.deleteRoute(r.id)
      setConfirming(false)
      toast.show(t('toast.routeDeleted'))
      navigate('/my-routes', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return {
    state,
    route,
    places,
    mapStops,
    busy,
    confirming,
    setConfirming,
    /** Missing, or no longer a saved route. */
    missing: state.status === 'missing' || (route !== null && !route.saved),
    toggleFavorite,
    share,
    reuse,
    remove,
  }
}

export type SavedRouteScreen = ReturnType<typeof useSavedRouteScreen>
