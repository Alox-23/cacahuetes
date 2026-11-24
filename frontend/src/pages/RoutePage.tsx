/* Ruta (Ruta.html): schematic map, stops with times and legs, quick changes, save and share. */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, FloatingBackButton, Header, IconButton, Mascot, RouteMap, Screen, ShareIcon, Sheet, StopRow } from '../components'
import type { Route } from '../contract/types'
import { t, tDynamic } from '../i18n'
import { QUICK_REFINES } from '../lib/refineKeywords'
import { mapLabel, routeSubtitle, stopDetail } from '../lib/routeText'
import { shareToastKey, shareRoute } from '../lib/share'
import { useBack } from '../lib/useBack'
import { useCurrentRoute, useData, usePendingRequest, usePreferences, useSession, useToast } from '../state/AppState'
import layout from './layout.module.css'
import { activityFor, useRoute, useStopPlaces } from './routeHooks'
import styles from './RoutePage.module.css'

export function RoutePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const data = useData()
  const { preferences } = usePreferences()
  const { isAccount } = useSession()
  const { setCurrentRouteId } = useCurrentRoute()
  const { setPendingRequest } = usePendingRequest()
  const toast = useToast()
  const back = useBack('/chat')
  const { state, route, setRoute } = useRoute(id)
  const places = useStopPlaces(route)
  const [busy, setBusy] = useState(false)

  // The create flow is over once the route is on screen.
  useEffect(() => setPendingRequest(null), [setPendingRequest])
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

  if (state.status === 'missing') {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} backLabel={t('route.backToChat')} />
        <p className={layout.muted}>{t('route.notFound')}</p>
      </Screen>
    )
  }
  if (!route) return null

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

  return (
    <Screen fixed className={layout.page}>
      <div className={styles.mapArea}>
        <RouteMap stops={route.stops} variant="full" label={mapLabel(route.stops.length)} />
        <FloatingBackButton onClick={back} />
      </div>
      <Sheet className={styles.sheet}>
        <div className={styles.top}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{route.name}</h1>
            <p className={styles.subtitle}>{routeSubtitle(route, preferences)}</p>
          </div>
          <div className={styles.quick} role="group" aria-label={t('route.quickTitle')}>
            {QUICK_REFINES.map((value) => (
              <button
                key={value}
                type="button"
                className={styles.quickButton}
                disabled={busy}
                onClick={() => run(() => data.refineRoute(route.id, { type: 'quick', value }))}
              >
                {tDynamic(`route.quick.${value}`)}
              </button>
            ))}
            {route.version > 1 && (
              <button
                type="button"
                className={styles.undo}
                disabled={busy}
                onClick={() => run(() => data.undo(route.id))}
              >
                {t('common.undo')}
              </button>
            )}
          </div>
        </div>

        <ol className={styles.stops} aria-label={t('route.stopsLabel')}>
          {route.stops.map((stop, i) => (
            <li key={`${stop.order}-${stop.placeId}`}>
              <StopRow
                order={stop.order}
                name={stop.name}
                detail={stopDetail(stop, activityFor(places, stop.placeId))}
                time={stop.arrive}
                to={`/route/${route.id}/stop/${stop.order}`}
                linkState={{ depth: 1 }}
                last={i === route.stops.length - 1}
              />
            </li>
          ))}
        </ol>

        <div className={styles.bottom}>
          <Link to={`/route/${route.id}/change`} className={styles.ask}>
            <Mascot size={24} />
            {t('route.askChange')}
          </Link>
          <div className={styles.actions}>
            <Button className={styles.save} disabled={busy} onClick={() => void save(route)}>
              {route.saved ? t('routeScreen.saved') : t('routeScreen.save')}
            </Button>
            <IconButton label={t('routeScreen.share')} onClick={() => void share(route)}>
              <ShareIcon />
            </IconButton>
          </div>
        </div>
      </Sheet>
    </Screen>
  )
}
