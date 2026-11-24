/* Ruta behaviour shared by the mobile page and the desktop panel (dev's RoutePage logic, unchanged). */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RefineAction, Route } from '../../contract/types'
import { canMoveStops } from '../../data/capabilities'
import { t } from '../../i18n'
import { shareRoute, shareToastKey } from '../../lib/share'
import { useRoute, useStopPlaces } from '../../pages/routeHooks'
import { useCreation, useCurrentRoute, useData, useSession, useToast } from '../../state/AppState'

export function useRouteScreen(id: string) {
  const navigate = useNavigate()
  const data = useData()
  const { isAccount } = useSession()
  const { setCurrentRouteId } = useCurrentRoute()
  const { acknowledgeCreation } = useCreation()
  const toast = useToast()
  const { state, route, setRoute } = useRoute(id)
  const places = useStopPlaces(route)
  const [busy, setBusy] = useState(false)

  // The create flow is over once the route is on screen.
  useEffect(() => acknowledgeCreation(id), [acknowledgeCreation, id])
  useEffect(() => {
    if (route) setCurrentRouteId(route.id)
  }, [route, setCurrentRouteId])

  async function run(fn: () => Promise<Route>) {
    if (busy) return
    setBusy(true)
    try {
      setRoute(await fn())
    } finally {
      setBusy(false)
    }
  }

  async function save(r: Route) {
    if (r.saved) return navigate(`/my-routes/${r.id}`)
    if (!isAccount) return navigate(`/route/${r.id}/save`)
    setBusy(true)
    try {
      await data.saveRoute(r.id)
      toast.show(t('toast.routeSaved'))
      navigate(`/my-routes/${r.id}`)
    } finally {
      setBusy(false)
    }
  }

  async function share(r: Route) {
    const key = shareToastKey(await shareRoute(r))
    if (key) toast.show(t(key))
  }

  return {
    state,
    route,
    setRoute,
    places,
    busy,
    refine: (action: RefineAction) => run(() => data.refineRoute(id, action)),
    undo: () => run(() => data.undo(id)),
    save,
    share,
    /** Reordering needs a data module that understands move_stop (the mock; not the HTTP API yet). */
    canMove: canMoveStops(data),
  }
}
