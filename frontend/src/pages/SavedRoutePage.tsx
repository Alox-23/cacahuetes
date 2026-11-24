/* Ruta guardada (RutaGuardada.html): map, stops, reuse, share, rate, start, favourite and delete. */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ConfirmSheet, Header, RouteMap, Screen, StarIcon, StopRow } from '../components'
import { formatDateShort } from '../assistant/format'
import type { Route } from '../contract/types'
import { t } from '../i18n'
import { cx } from '../lib/cx'
import { activityLabel, routeTimeRange, stopsCount } from '../lib/routeText'
import { shareRoute, shareToastKey } from '../lib/share'
import { useBack } from '../lib/useBack'
import { useData, useReuse, useToast } from '../state/AppState'
import layout from './layout.module.css'
import { activityFor, useRoute, useStopPlaces } from './routeHooks'
import styles from './SavedRoutePage.module.css'

export function SavedRoutePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const data = useData()
  const toast = useToast()
  const startReuse = useReuse()
  const back = useBack('/my-routes')
  const { state, route, setRoute } = useRoute(id)
  const places = useStopPlaces(route)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (state.status === 'missing' || (route && !route.saved)) {
    return (
      <Screen className={layout.body}>
        <Header onBack={back} label={t('savedRoute.header')} />
        <p className={layout.muted}>{t('savedRoute.notFound')}</p>
      </Screen>
    )
  }
  if (!route) return null

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

  const favorite = (
    <button type="button" aria-pressed={route.favorite} className={cx(styles.favorite, route.favorite && styles.favoriteOn)} onClick={() => void toggleFavorite(route)}>
      {route.favorite && <StarIcon size={18} filled />}
      {t('savedRoute.favorite')}
    </button>
  )

  return (
    <Screen fixed className={layout.page}>
      <div className={styles.headerArea}>
        <Header onBack={back} label={t('savedRoute.header')} right={favorite} />
      </div>
      <div className={`${layout.body} ${layout.gap14} ${styles.body}`}>
        <RouteMap stops={route.stops} variant="card" label={t('routeScreen.mapLabelPlain')} />
        <div className={layout.titleBlock}>
          <h1 className={`${layout.h1} ${layout.h1Route}`}>{route.name}</h1>
          <p className={layout.subtitle}>
            {t('savedRoute.subtitle', { date: formatDateShort(route.request.date), time: routeTimeRange(route), stops: stopsCount(route.stops.length) })}
          </p>
        </div>
        <Card className={layout.stopsCard}>
          <ol className={styles.stops} aria-label={t('savedRoute.stopsLabel')}>
            {route.stops.map((stop, i) => (
              <li key={`${stop.order}-${stop.placeId}`}>
                <StopRow
                  size="md"
                  order={stop.order}
                  name={stop.name}
                  detail={activityLabel(stop, activityFor(places, stop.placeId))}
                  time={stop.arrive}
                  last={i === route.stops.length - 1}
                />
              </li>
            ))}
          </ol>
        </Card>
        <div className={styles.grid} role="group" aria-label={t('savedRoute.actionsLabel')}>
          <button type="button" className={styles.action} onClick={() => reuse(route)}>
            {t('savedRoute.reuse')}
          </button>
          <button type="button" className={styles.action} onClick={() => void share(route)}>
            {t('savedRoute.share')}
          </button>
          <button type="button" className={styles.action} onClick={() => navigate(`/my-routes/${route.id}/rate`)}>
            {t('savedRoute.rate')}
          </button>
        </div>
      </div>
      <div className={`${layout.footer} ${styles.footer}`}>
        <Button fullWidth to={`/route/${route.id}`}>
          {t('savedRoute.start')}
        </Button>
        <button type="button" className={`${layout.textAction} ${layout.danger}`} onClick={() => setConfirming(true)}>
          {t('savedRoute.delete')}
        </button>
      </div>
      <ConfirmSheet
        open={confirming}
        busy={busy}
        title={t('confirm.deleteRouteTitle')}
        text={t('confirm.deleteRouteText')}
        confirmLabel={t('confirm.deleteRouteConfirm')}
        onConfirm={() => void remove(route)}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  )
}
